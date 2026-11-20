"""Casos de uso da administração: visão geral, contas, catálogo e desempenho agregado."""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from aprendeia.application.ports.management import AdminRepository, InvalidExerciseSelection
from aprendeia.application.ports.security import (
    AuditRecorder,
    IdentityHasher,
    IdentityProvider,
    PersistenceGate,
    RateLimiter,
)
from aprendeia.domain.admin_performance import build_performance, list_class_overview, list_teacher_overview
from aprendeia.domain.catalog import build_editorial_catalog
from aprendeia.domain.errors import Conflict, Forbidden, InvalidInput, NotFound, Unprocessable

Row = dict[str, Any]
logger = logging.getLogger("aprendeia")

PROVISIONABLE_ROLES = frozenset({"student", "teacher"})
SUBJECT_NOT_FOUND = "Disciplina não encontrada."
SUBJECT_TAKEN = "Esta disciplina já possui professor."
APPROVAL_FAILED = "Não foi possível aprovar esta solicitação."
INVALID_EXERCISES = "Selecione apenas questões publicadas da disciplina desta aula."
ANONYMOUS_ACTOR = "Sistema ou tentativa anônima"


def _count(rows: list[Row], key: str, value: str) -> int:
    return sum(1 for row in rows if row.get(key) == value)


def _describe_audit_events(events: list[Row], profiles: list[Row]) -> list[Row]:
    """Acrescenta o nome do ator sem revelar rede, token ou payload."""

    profiles_by_id = {row["id"]: row for row in profiles}
    described = []
    for event in events:
        actor_id = event.get("user_id") or event.get("actor_id")
        profile = profiles_by_id.get(actor_id, {})
        described.append({
            **event,
            "actor_id": actor_id,
            "occurred_at": event.get("created_at") or event.get("occurred_at"),
            "actor_name": profile.get("full_name", ANONYMOUS_ACTOR),
            "actor_role": event.get("actor_role") or profile.get("role"),
        })
    return described


class AdminOverviewService:
    """Leituras operacionais: totais, perfis e trilha de auditoria."""

    def __init__(self, *, admin: AdminRepository, limiter: RateLimiter) -> None:
        self._admin = admin
        self._limiter = limiter

    def overview(self) -> Row:
        """Resume o sistema sem incluir respostas ou dificuldades individuais."""

        profiles = self._admin.profile_roles()
        subject_count = self._admin.count_subjects()
        lesson_count = self._admin.count_lessons()
        questions = self._admin.question_statuses()
        return {
            "users": len(profiles),
            "students": _count(profiles, "role", "student"),
            "teachers": _count(profiles, "role", "teacher"),
            "admins": _count(profiles, "role", "admin"),
            "subjects": subject_count,
            "lessons": lesson_count,
            "questions": len(questions),
            "draft_questions": _count(questions, "status", "draft"),
        }

    def users(self) -> list[Row]:
        """Lista perfis operacionais sem consultar senhas ou tokens do Auth."""

        return self._admin.users()

    def audit_logs(
        self,
        admin: Row,
        *,
        days: int,
        role: str | None,
        outcome: str | None,
        action: str | None,
        user_id: str | None,
        limit: int,
    ) -> list[Row]:
        """Entrega metadados de auditoria dentro da retenção de sete dias."""

        self._limiter.enforce(admin["id"], "admin_audit_read")
        since = datetime.now(timezone.utc) - timedelta(days=days)
        events = self._admin.audit_events(
            since=since.isoformat(), role=role, outcome=outcome, action=action, user_id=user_id, limit=limit
        )
        actor_ids = list({
            row.get("user_id") or row.get("actor_id")
            for row in events
            if row.get("user_id") or row.get("actor_id")
        })
        profiles = self._admin.profiles(actor_ids) if actor_ids else []
        return _describe_audit_events(events, profiles)


class EditorialCatalogService:
    """Árvore editorial: disciplinas, módulos, aulas e exercícios obrigatórios."""

    def __init__(self, *, admin: AdminRepository, limiter: RateLimiter) -> None:
        self._admin = admin
        self._limiter = limiter

    def _reserve_write(self, admin: Row) -> None:
        self._limiter.enforce(admin["id"], "admin_content_write")

    def subjects(self) -> list[Row]:
        return build_editorial_catalog(*self._admin.editorial_rows())

    def create_subject(self, admin: Row, values: Row) -> Row:
        """Cria uma disciplina e matricula estudantes pelo gatilho já existente."""

        self._reserve_write(admin)
        if self._admin.subject_name_taken(values["name"]):
            raise Conflict("Já existe uma disciplina com esse nome.")
        return self._admin.create_subject(values)

    def update_subject(self, admin: Row, subject_id: str, values: Row) -> Row:
        self._reserve_write(admin)
        updated = self._admin.update_subject(subject_id, values)
        if not updated:
            raise NotFound(SUBJECT_NOT_FOUND)
        return updated[0]

    def create_module(self, admin: Row, subject_id: str, values: Row) -> Row:
        self._reserve_write(admin)
        if not self._admin.subject_exists(subject_id):
            raise NotFound(SUBJECT_NOT_FOUND)
        return self._admin.create_module({**values, "subject_id": subject_id})

    def create_lesson(self, admin: Row, module_id: str, values: Row) -> Row:
        self._reserve_write(admin)
        if not self._admin.module_exists(module_id):
            raise NotFound("Módulo não encontrado.")
        return self._admin.create_lesson({**values, "module_id": module_id})

    def update_lesson(self, admin: Row, lesson_id: str, values: Row) -> Row:
        """Edita ou despublica a aula sem apagar histórico do estudante."""

        self._reserve_write(admin)
        updated = self._admin.update_lesson(lesson_id, values)
        if not updated:
            raise NotFound("Aula não encontrada.")
        return updated[0]

    def required_exercises(self, lesson_id: str) -> Row:
        """Carrega apenas questões publicadas da mesma disciplina da aula."""

        subject_id = self._admin.lesson_subject_id(lesson_id)
        if not subject_id:
            raise NotFound("Aula não encontrada.")
        selected = self._admin.required_exercise_ids(lesson_id)
        questions = self._admin.published_subject_questions(subject_id)
        return {"selected_question_ids": selected, "questions": questions}

    def set_required_exercises(self, admin: Row, lesson_id: str, question_ids: list[str]) -> Row:
        """Substitui a lista, sempre dentro da disciplina que contém a aula."""

        self._reserve_write(admin)
        allowed_ids = {question["id"] for question in self.required_exercises(lesson_id)["questions"]}
        if any(question_id not in allowed_ids for question_id in question_ids):
            raise Unprocessable(INVALID_EXERCISES)
        # Uma única RPC troca a lista na mesma transação, sem janela sem exercícios.
        try:
            self._admin.replace_required_exercises(lesson_id, question_ids)
        except InvalidExerciseSelection as error:
            raise Unprocessable(INVALID_EXERCISES) from error
        return self.required_exercises(lesson_id)

    def contents(self) -> Row:
        """Mostra aulas oficiais e materiais enviados por professores."""

        lessons = self._admin.official_lessons()
        materials = self._admin.teacher_materials()
        return {"lessons": lessons, "teacher_materials": materials}


class AccountProvisioningService:
    """Criação, aprovação e exclusão de contas pela administração."""

    def __init__(
        self,
        *,
        persistence: PersistenceGate,
        admin: AdminRepository,
        identity: IdentityProvider,
        hasher: IdentityHasher,
        limiter: RateLimiter,
    ) -> None:
        self._persistence = persistence
        self._admin = admin
        self._identity = identity
        self._hasher = hasher
        self._limiter = limiter

    def teacher_requests(self) -> list[Row]:
        """Lista solicitações sem expor senhas, tokens ou metadados de autenticação."""

        if not self._persistence.configured():
            return []
        return self._admin.pending_teacher_requests()

    def _free_subject_id(self, subject_name: str) -> str:
        """Uma disciplina aceita um único professor; a regra vale para criar e aprovar."""

        subject_id = self._admin.subject_id_by_name(subject_name)
        if not subject_id:
            raise NotFound(SUBJECT_NOT_FOUND)
        if self._admin.subject_has_teacher(subject_id):
            raise Conflict(SUBJECT_TAKEN)
        return subject_id

    def approve_teacher(self, admin: Row, user_id: str, subject_name: str, audit: AuditRecorder) -> Row:
        """Promove a solicitação em uma transação que também prende a disciplina."""

        self._limiter.enforce(admin["id"], "admin_user_write")
        if not self._admin.pending_teacher_request(user_id):
            raise NotFound("Solicitação de professor não encontrada.")
        self._free_subject_id(subject_name)
        try:
            # A função SQL atualiza perfil e vínculo juntos. Assim não sobra uma conta
            # de professor sem matéria se duas aprovações acontecerem ao mesmo tempo.
            approved = self._admin.approve_teacher(user_id, subject_name)
        except Exception as error:
            raise Conflict(APPROVAL_FAILED) from error
        if not approved:
            raise Conflict(APPROVAL_FAILED)
        audit.resource(user_id)
        return approved[0]

    def create_user(
        self,
        admin: Row,
        *,
        name: str,
        email: str,
        password: str,
        role: str,
        subject: str | None,
        audit: AuditRecorder,
    ) -> Row:
        """Cria uma conta e atribui a disciplina antes de liberar um professor."""

        if role not in PROVISIONABLE_ROLES:
            raise InvalidInput("O cargo deve ser student ou teacher.")
        account = {"name": name, "email": email, "role": role, "subject": subject}
        if not self._persistence.configured():
            return account
        self._limiter.enforce(admin["id"], "admin_user_write")
        subject_id = self._free_subject_id(subject) if role == "teacher" else None
        created_user_id: str | None = None
        try:
            created_user_id = self._identity.create_confirmed_user(email=email, password=password, full_name=name)
            if not created_user_id:
                raise ValueError("User was not created")
            audit.resource(created_user_id)
            self._admin.set_profile_role(created_user_id, name, role)
            if role == "teacher" and subject_id:
                self._admin.assign_teacher(created_user_id, subject_id)
            return {"id": created_user_id, **account}
        except Exception as error:
            if created_user_id:
                self._remove_incomplete_account(created_user_id)
            raise InvalidInput(
                "Não foi possível criar o usuário. Verifique se o e-mail já está cadastrado."
            ) from error

    def _remove_incomplete_account(self, user_id: str) -> None:
        # Se algo falhar no vínculo, removemos a conta incompleta para ela não
        # virar uma estudante sem querer ou uma professora sem disciplina.
        try:
            self._identity.delete_user(user_id)
        except Exception as cleanup_error:
            logger.error(
                "Não foi possível remover a conta incompleta após falha no cadastro: %s",
                type(cleanup_error).__name__,
            )

    def delete_user(self, admin: Row, user_id: str, *, confirmation: str, reason: str, audit: AuditRecorder) -> Row:
        """Exclui um aluno ou professor; a RPC repete todas as verificações."""

        if user_id == admin["id"]:
            raise Forbidden("A administração não exclui a própria conta.")
        self._limiter.enforce(admin["id"], "admin_user_delete")
        account = self._admin.account_identity(user_id)
        if not account:
            raise NotFound("Conta não encontrada.")
        if account["role"] == "admin":
            raise Forbidden("Contas administrativas não são excluídas pelo painel.")
        result = self._admin.delete_account(
            admin_id=admin["id"],
            target_id=user_id,
            confirmation=confirmation,
            reason=reason,
            identity_hash=self._hasher.identity(account["email"]),
        )
        deleted_role = (result or {}).get("deleted_role", account["role"])
        # O evento guarda o cargo e o motivo; o identificador da conta some com ela.
        audit.metadata({"deleted_role": deleted_role, "reason": reason})
        return {"deleted": True, "deleted_role": deleted_role}


class SchoolPerformanceService:
    """Professores, turmas e desempenho agregado, sem dados individuais."""

    def __init__(self, *, admin: AdminRepository, limiter: RateLimiter) -> None:
        self._admin = admin
        self._limiter = limiter

    def teachers(self) -> list[Row]:
        teachers = self._admin.teachers_with_subject()
        subjects = self._admin.subject_names()
        classes, members = self._admin.classes_with_members()
        return list_teacher_overview(teachers, subjects, classes, members)

    def classes(self) -> list[Row]:
        teachers = self._admin.teachers_with_subject()
        subjects = self._admin.subject_names()
        classes, members = self._admin.classes_with_members()
        return list_class_overview(teachers, subjects, classes, members)

    def performance(self, admin: Row, *, teacher_id: str | None, subject_id: str | None) -> Row:
        """Desempenho agregado por turma e por professor."""

        self._limiter.enforce(admin["id"], "admin_performance_read")
        teachers = self._admin.teachers_with_subject()
        if teacher_id:
            teachers = {key: value for key, value in teachers.items() if key == teacher_id}
        if subject_id:
            teachers = {key: value for key, value in teachers.items() if value["subject_id"] == subject_id}
        subjects = self._admin.subject_names()
        classes, members = self._admin.classes_with_members(teacher_id, subject_id)
        student_ids = list({row["student_id"] for row in members})
        subject_ids = list({row["subject_id"] for row in classes})
        attempts: list[Row] = []
        completions: list[Row] = []
        alerts: list[Row] = []
        if student_ids and subject_ids:
            attempts, completions, alerts = self._admin.group_activity(student_ids, subject_ids)
        return build_performance(
            classes=classes, members=members, teachers=teachers, subjects=subjects,
            attempts=attempts, completions=completions, alerts=alerts, now=datetime.now(timezone.utc),
        )
