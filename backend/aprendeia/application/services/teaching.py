"""Casos de uso do painel do professor, sempre presos à disciplina atribuída."""

import json
from datetime import datetime, timezone
from typing import Any

from aprendeia.application.ports.learning import TutorModel
from aprendeia.application.ports.management import TeacherRepository
from aprendeia.application.ports.security import AuditRecorder, RateLimiter
from aprendeia.application.services.teaching_scope import require_assignment, subject_name_of
from aprendeia.domain.errors import ApplicationError, Conflict, NotFound, Unprocessable, UpstreamFailure
from aprendeia.domain.notification_preferences import PREFERENCE_FIELDS, email_enabled
from aprendeia.domain.teacher_dashboard import (
    anonymous_metrics,
    build_difficulty_trend,
    build_report_csv,
    build_student_summaries,
    parse_content_import,
    report_filename,
    weighted_accuracy,
)

Row = dict[str, Any]
STUDENT_NOT_IN_CLASS = "Estudante não encontrado nesta turma."
UTF8_BOM = "﻿"


class ClassroomAccess:
    """Regras de posse compartilhadas pelos casos de uso do professor."""

    def __init__(self, teachers: TeacherRepository) -> None:
        self._teachers = teachers

    def owned_class(self, teacher_id: str, class_id: str) -> Row:
        """Impede que trocar o ID da URL abra a turma de outro professor."""

        classroom = self._teachers.owned_class(teacher_id, class_id)
        if not classroom:
            raise NotFound("Turma não encontrada.")
        return classroom

    def student_summaries(self, subject_id: str, student_ids: list[str]) -> list[Row]:
        """Junta desempenho da disciplina sem permitir alterações nos dados do aluno."""

        if not student_ids:
            return []
        return build_student_summaries(**self._teachers.performance_rows(subject_id, student_ids))


class TeacherOverviewService:
    """Leituras do painel: estudantes, alertas e indicadores da disciplina."""

    def __init__(self, *, teachers: TeacherRepository, access: ClassroomAccess) -> None:
        self._teachers = teachers
        self._access = access

    def students(self, user: Row) -> list[Row]:
        """Lista apenas estudantes matriculados na disciplina do professor atual."""

        assignment = self._teachers.assignment_of(user["id"])
        if not assignment:
            return []
        student_ids = self._teachers.enrolled_student_ids(assignment["subject_id"])
        if not student_ids:
            return []
        subject = subject_name_of(assignment)
        return [{**profile, "subject": subject} for profile in self._teachers.student_cards(student_ids)]

    def difficulty_alerts(self, user: Row) -> list[Row]:
        """Devolve ao professor somente alertas ativos da própria disciplina."""

        assignment = self._teachers.assignment_of(user["id"])
        if not assignment:
            return []
        alerts = self._teachers.active_alerts(user["id"], assignment["subject_id"])
        if not alerts:
            return []
        student_ids = list({alert["student_id"] for alert in alerts})
        students_by_id = {profile["id"]: profile for profile in self._teachers.student_cards(student_ids)}
        subject = subject_name_of(assignment)
        return [
            {
                **alert,
                "student_name": students_by_id.get(alert["student_id"], {}).get("full_name", "Estudante"),
                "student_grade": students_by_id.get(alert["student_id"], {}).get("grade", ""),
                "subject": subject,
            }
            for alert in alerts
        ]

    def overview(self, user: Row) -> Row:
        """Entrega os indicadores principais somente da disciplina atribuída."""

        assignment = require_assignment(self._teachers, user["id"])
        class_ids = self._teachers.class_ids_of(user["id"])
        student_ids = list(set(self._teachers.student_ids_in_classes(class_ids))) if class_ids else []
        summaries = self._access.student_summaries(assignment["subject_id"], student_ids)
        return {
            "subject": assignment["subject"],
            "class_count": len(class_ids),
            "student_count": len(student_ids),
            "active_alerts": self._teachers.count_active_alerts(user["id"], assignment["subject_id"]),
            "average_accuracy": weighted_accuracy(summaries),
        }


class ClassroomService:
    """Turmas do professor: organização e leitura, nunca edição de dados do aluno."""

    def __init__(self, *, teachers: TeacherRepository, access: ClassroomAccess, limiter: RateLimiter) -> None:
        self._teachers = teachers
        self._access = access
        self._limiter = limiter

    def list_classes(self, user: Row) -> list[Row]:
        assignment = require_assignment(self._teachers, user["id"])
        classes = self._teachers.classes_of(user["id"], assignment["subject_id"])
        class_ids = [row["id"] for row in classes]
        memberships = self._teachers.class_memberships(class_ids) if class_ids else []
        counts: dict[str, int] = {}
        for membership in memberships:
            counts[membership["class_id"]] = counts.get(membership["class_id"], 0) + 1
        return [
            {**row, "subject": assignment["subject"], "student_count": counts.get(row["id"], 0)}
            for row in classes
        ]

    def create(self, user: Row, *, name: str, school_year: str, audit: AuditRecorder) -> Row:
        """Cria uma turma já presa à disciplina do professor autenticado."""

        assignment = require_assignment(self._teachers, user["id"])
        self._limiter.enforce(user["id"], "teacher_class_write")
        if self._teachers.class_exists(user["id"], name, school_year):
            raise Conflict("Já existe uma turma com esse nome e ano.")
        created = self._teachers.create_class({
            "teacher_id": user["id"],
            "subject_id": assignment["subject_id"],
            "name": name,
            "school_year": school_year,
        })
        audit.resource(created["id"])
        return {**created, "subject": assignment["subject"], "student_count": 0}

    def detail(self, user: Row, class_id: str) -> Row:
        """Mostra estudantes e indicadores da turma, sempre em modo somente leitura."""

        classroom = self._access.owned_class(user["id"], class_id)
        member_ids = self._teachers.class_student_ids(class_id)
        students = self._access.student_summaries(classroom["subject_id"], member_ids)
        class_attempts = [attempt for student in students for attempt in student["recent_attempts"]]
        return {
            "id": classroom["id"],
            "name": classroom["name"],
            "school_year": classroom["school_year"],
            "subject": subject_name_of(classroom),
            "student_count": len(students),
            "students": students,
            "trend": build_difficulty_trend(class_attempts),
        }

    def add_student(self, user: Row, class_id: str, student_email: str, audit: AuditRecorder) -> Row:
        """Organiza a turma sem dar acesso para editar qualquer dado pedagógico."""

        classroom = self._access.owned_class(user["id"], class_id)
        self._limiter.enforce(user["id"], "teacher_class_write")
        student = self._teachers.student_by_email(student_email.lower())
        if not student:
            raise NotFound("Estudante não encontrado.")
        if not self._teachers.is_enrolled(student["id"], classroom["subject_id"]):
            raise Conflict("Estudante não está matriculado nesta disciplina.")
        if self._teachers.is_class_member(class_id, student["id"]):
            raise Conflict("Estudante já participa desta turma.")
        self._teachers.add_class_member(class_id, student["id"])
        audit.resource(student["id"])
        audit.metadata({"class_id": class_id, "student_id": student["id"]})
        return {"id": student["id"], "full_name": student["full_name"], "grade": student["grade"]}

    def remove_student(self, user: Row, class_id: str, student_id: str) -> None:
        """Remove só o vínculo com a turma; histórico e perfil ficam intactos."""

        self._access.owned_class(user["id"], class_id)
        self._limiter.enforce(user["id"], "teacher_class_write")
        if not self._teachers.is_class_member(class_id, student_id):
            raise NotFound("Estudante não está nesta turma.")
        self._teachers.remove_class_member(class_id, student_id)

    def student_history(self, user: Row, class_id: str, student_id: str) -> Row:
        """Fecha a consulta por turma e estudante antes de devolver qualquer histórico."""

        classroom = self._access.owned_class(user["id"], class_id)
        if not self._teachers.is_class_member(class_id, student_id):
            raise NotFound(STUDENT_NOT_IN_CLASS)
        summaries = self._access.student_summaries(classroom["subject_id"], [student_id])
        if not summaries:
            raise NotFound("Estudante não encontrado.")
        return summaries[0]

    def export_report(self, user: Row, class_id: str, student_id: str | None, audit: AuditRecorder) -> Row:
        """Exporta a turma ou um aluno dela, sempre dentro da disciplina autorizada."""

        classroom = self._access.owned_class(user["id"], class_id)
        member_ids = self._teachers.class_student_ids(class_id)
        if student_id and student_id not in member_ids:
            raise NotFound(STUDENT_NOT_IN_CLASS)
        audit.resource(student_id or class_id)
        audit.metadata({"class_id": class_id, "student_id": student_id})
        selected_ids = [student_id] if student_id else member_ids
        students = self._access.student_summaries(classroom["subject_id"], selected_ids)
        content = UTF8_BOM + build_report_csv(subject_name_of(classroom), classroom["name"], students)
        return {"filename": f"relatorio-{report_filename(classroom['name'])}.csv", "content": content}


class TeacherContentService:
    """Materiais do professor, sempre gravados na disciplina atribuída."""

    def __init__(self, *, teachers: TeacherRepository, limiter: RateLimiter) -> None:
        self._teachers = teachers
        self._limiter = limiter

    def list_contents(self, user: Row) -> list[Row]:
        assignment = require_assignment(self._teachers, user["id"])
        return self._teachers.contents_of(user["id"], assignment["subject_id"])

    def create(self, user: Row, values: Row) -> Row:
        """Cria material na disciplina atribuída, ignorando qualquer matéria do cliente."""

        assignment = require_assignment(self._teachers, user["id"])
        self._limiter.enforce(user["id"], "teacher_content_write")
        return self._teachers.create_content(self._owned_record(user, assignment, values))

    def import_batch(self, user: Row, *, content: str, content_format: str) -> Row:
        """Importa lotes pequenos e validados, sem aceitar arquivos executáveis."""

        try:
            rows = parse_content_import(content, content_format)
        except (ValueError, json.JSONDecodeError) as error:
            raise Unprocessable(str(error)) from error
        assignment = require_assignment(self._teachers, user["id"])
        self._limiter.enforce(user["id"], "teacher_content_import")
        created = self._teachers.create_contents(
            [self._owned_record(user, assignment, row) for row in rows]
        )
        return {"imported": len(created), "contents": created}

    @staticmethod
    def _owned_record(user: Row, assignment: dict[str, str], values: Row) -> Row:
        # A posse vem por último: nenhum campo do cliente pode trocar o dono da linha.
        return {**values, "teacher_id": user["id"], "subject_id": assignment["subject_id"]}


class TeacherRecommendationService:
    """Gera orientação pedagógica a partir de métricas, sem enviar dados pessoais."""

    def __init__(
        self,
        *,
        teachers: TeacherRepository,
        access: ClassroomAccess,
        tutor: TutorModel,
        limiter: RateLimiter,
    ) -> None:
        self._teachers = teachers
        self._access = access
        self._tutor = tutor
        self._limiter = limiter

    def generate(self, user: Row, *, class_id: str, student_id: str | None) -> Row:
        classroom = self._access.owned_class(user["id"], class_id)
        allowed_ids = self._teachers.class_student_ids(class_id)
        if student_id and student_id not in allowed_ids:
            raise NotFound(STUDENT_NOT_IN_CLASS)
        self._limiter.enforce(user["id"], "teacher_recommendation")
        selected_ids = [student_id] if student_id else allowed_ids
        summaries = self._access.student_summaries(classroom["subject_id"], selected_ids)
        recommendation = self._ask_tutor(subject_name_of(classroom), anonymous_metrics(summaries))
        saved = self._teachers.save_recommendation({
            "teacher_id": user["id"],
            "subject_id": classroom["subject_id"],
            "class_id": class_id,
            "student_id": student_id,
            "recommendation": recommendation,
        })
        return {**recommendation, "id": saved["id"], "created_at": saved["created_at"]}

    def _ask_tutor(self, subject: str, metrics: list[Row]) -> Row:
        try:
            return self._tutor.recommend(subject=subject, metrics=metrics)
        except ApplicationError:
            raise
        except Exception as error:
            raise UpstreamFailure("Não foi possível gerar a recomendação agora.") from error


class NotificationPreferenceService:
    """Preferências de e-mail lidas e gravadas somente no próprio perfil."""

    def __init__(self, *, teachers: TeacherRepository, limiter: RateLimiter) -> None:
        self._teachers = teachers
        self._limiter = limiter

    def read(self, user: Row) -> Row:
        row = self._teachers.notification_preferences(user["id"])
        if row is None:
            raise NotFound("Perfil não encontrado.")
        return {
            **{field: email_enabled(row, field) for field in PREFERENCE_FIELDS},
            "updated_at": row.get("notification_preferences_updated_at"),
        }

    def update(self, user: Row, preferences: Row, audit: AuditRecorder) -> Row:
        """Grava a escolha e deixa os novos valores no evento de auditoria."""

        self._limiter.enforce(user["id"], "notification_preferences")
        updated_at = datetime.now(timezone.utc).isoformat()
        values = {**preferences, "notification_preferences_updated_at": updated_at}
        if not self._teachers.update_notification_preferences(user["id"], values):
            raise NotFound("Perfil não encontrado.")
        audit.metadata(dict(preferences))
        return {**preferences, "updated_at": updated_at}
