"""Casos de uso do banco de questões: consulta, geração, revisão e prática."""

import logging
from datetime import datetime, timezone
from typing import Any

from aprendeia.application.ports.learning import (
    DifficultyAlertRepository,
    QuestionRepository,
    TeacherNotifier,
    TutorModel,
)
from aprendeia.application.ports.security import AuditRecorder, RateLimiter
from aprendeia.application.services.teaching_scope import require_assignment, subject_name_of
from aprendeia.domain.difficulty_alerts import is_high_difficulty
from aprendeia.domain.errors import ApplicationError, Forbidden, NotFound, Unprocessable, UpstreamFailure
from aprendeia.domain.questions import (
    DIFFICULTY_LEVELS,
    hide_question_solution,
    next_difficulty_level,
    serialize_question,
)

Row = dict[str, Any]
logger = logging.getLogger("aprendeia")

AI_ONLY_FIELDS = ("id", "subject", "skill")
QUESTION_NOT_IN_SUBJECT = "Questão não encontrada na sua disciplina."


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def validate_difficulty_filter(difficulty: str | None) -> None:
    if difficulty is not None and difficulty not in DIFFICULTY_LEVELS:
        raise Unprocessable("Dificuldade inválida.")


def generate_question_with_ai(tutor: TutorModel, *, subject: str, topic: str, difficulty: str) -> Row:
    """Gera uma questão estruturada e apropriada ao contexto educacional."""

    try:
        return tutor.generate_question(subject=subject, topic=topic, difficulty=difficulty)
    except ApplicationError:
        raise
    except Exception as error:
        raise UpstreamFailure("Não foi possível gerar a questão agora.") from error


def visible_to(role: str, questions: list[Row]) -> list[Row]:
    """Só o professor recebe o gabarito; o estudante vê a questão sem a solução."""

    if role == "teacher":
        return questions
    return [hide_question_solution(question) for question in questions]


class DifficultyAlertService:
    """Abre ou resolve o alerta da dupla estudante+tópico sem parar a atividade."""

    def __init__(self, *, alerts: DifficultyAlertRepository, notifier: TeacherNotifier) -> None:
        self._alerts = alerts
        self._notifier = notifier

    def synchronize(
        self, *, student_id: str, subject_id: str, topic: str, accuracy_percent: float, attempts: int
    ) -> None:
        teacher_id = self._alerts.teacher_of_subject(subject_id)
        if not teacher_id:
            return
        existing = self._alerts.find_alert(student_id, subject_id, topic)
        already_active = bool(existing) and existing["status"] == "active"
        if not is_high_difficulty(accuracy_percent, attempts):
            if already_active:
                self._alerts.resolve_alert(existing["id"], _now())
            return

        self._alerts.open_alert({
            "teacher_id": teacher_id,
            "student_id": student_id,
            "subject_id": subject_id,
            "topic": topic,
            "accuracy": round(accuracy_percent, 2),
            "attempts": attempts,
            "status": "active",
            "updated_at": _now(),
        })
        if already_active:
            return
        # Falha externa não desfaz a tentativa ou o alerta do painel.
        try:
            self._notifier.alert_available(teacher_id, subject_id)
        except Exception:
            logger.warning("RF22: envio imediato pendente de revisão no ledger.")


class QuestionBankService:
    """Consulta e produção de questões dentro da disciplina autorizada."""

    def __init__(
        self,
        *,
        questions: QuestionRepository,
        tutor: TutorModel,
        limiter: RateLimiter,
        alerts: DifficultyAlertService,
    ) -> None:
        self._questions = questions
        self._tutor = tutor
        self._limiter = limiter
        self._alerts = alerts

    def list_questions(self, user: Row, subject: str | None, difficulty: str | None) -> list[Row]:
        """Lista questões e permite filtros simples para uso pedagógico."""

        validate_difficulty_filter(difficulty)
        is_teacher = user["role"] == "teacher"
        if is_teacher:
            assignment = self._questions.assignment_of(user["id"])
            if not assignment:
                return []
            assigned_subject = subject_name_of(assignment, default=None)
            if subject and subject != assigned_subject:
                raise Forbidden("Professor não pode consultar outra disciplina.")
            subject = assigned_subject
        rows = self._questions.list_questions(difficulty=difficulty, published_only=not is_teacher)
        questions = [serialize_question(row) for row in rows]
        filtered = [question for question in questions if not subject or question["subject"] == subject]
        return visible_to(user["role"], filtered)

    def generate(self, user: Row, *, subject: str, topic: str, difficulty: str, audit: AuditRecorder) -> Row:
        """Gera com IA e persiste a nova questão como rascunho da disciplina do professor."""

        subject_id = self._questions.subject_id_by_name(subject)
        if not subject_id:
            raise NotFound("Disciplina não encontrada.")
        if self._questions.assigned_subject_id(user["id"]) != subject_id:
            raise Forbidden("Professor não pode criar questões para outra disciplina.")
        self._limiter.enforce(user["id"], "generate_question")
        generated = generate_question_with_ai(self._tutor, subject=subject, topic=topic, difficulty=difficulty)
        values = {
            **{key: value for key, value in generated.items() if key not in AI_ONLY_FIELDS},
            "subject_id": subject_id,
            "source": "openai",
            "status": "draft",
            "created_by": user["id"],
        }
        created = self._questions.insert_question(values)
        audit.resource(created["id"])
        return serialize_question({**created, "subjects": {"name": subject}})

    def teacher_queue(self, user: Row) -> list[Row]:
        """Abre a fila editorial apenas na disciplina atribuída ao professor."""

        assignment = require_assignment(self._questions, user["id"])
        rows = self._questions.questions_of_subject(assignment["subject_id"])
        return [serialize_question(row) for row in rows]

    def review(self, user: Row, question_id: str, values: Row) -> Row:
        """Permite revisão e publicação sem tocar em outra disciplina."""

        assignment = require_assignment(self._questions, user["id"])
        subject_id = assignment["subject_id"]
        if not self._questions.question_in_subject(question_id, subject_id):
            raise NotFound(QUESTION_NOT_IN_SUBJECT)
        self._limiter.enforce(user["id"], "teacher_question_write")
        updated = self._questions.update_question(question_id, subject_id, values)
        if not updated:
            raise NotFound(QUESTION_NOT_IN_SUBJECT)
        return serialize_question({**updated[0], "subjects": {"name": assignment["subject"]}})

    def next_question(self, user: Row, subject: str) -> Row:
        """Seleciona uma questão no nível calculado para o estudante autenticado."""

        subject_id = self._questions.subject_id_by_name(subject)
        if not subject_id:
            raise NotFound("Disciplina não encontrada.")
        desired = self._questions.latest_level(user["id"], subject_id) or "basic"
        rows = self._questions.published_questions(subject_id, desired)
        if not rows:
            rows = self._questions.published_questions(subject_id, None)
        if not rows:
            raise NotFound("Ainda não há questões para esta disciplina.")
        return hide_question_solution(serialize_question(rows[0]))

    def answer(self, user: Row, question_id: str, *, selected_index: int, response_time_seconds: int) -> Row:
        """Corrige, registra a tentativa e recalcula a dificuldade recomendada."""

        self._limiter.enforce(user["id"], "answer_question")
        question = self._questions.published_question(question_id)
        if not question:
            raise NotFound("Questão não encontrada.")
        correct = selected_index == question["correct_index"]
        self._questions.record_attempt({
            "student_id": user["id"],
            "question_id": question_id,
            "selected_index": selected_index,
            "correct": correct,
            "response_time_seconds": response_time_seconds,
        })
        attempts = self._questions.topic_attempts(user["id"], question["subject_id"], question["topic"])
        accuracy = (sum(1 for item in attempts if item["correct"]) / len(attempts)) if attempts else 0
        next_level = next_difficulty_level(accuracy, len(attempts))
        accuracy_percent = round(accuracy * 100, 2)
        self._questions.save_difficulty({
            "student_id": user["id"],
            "subject_id": question["subject_id"],
            "topic": question["topic"],
            "level": next_level,
            "accuracy": accuracy_percent,
            "attempts": len(attempts),
            "updated_at": _now(),
        })
        self._synchronize_alert(user["id"], question, accuracy_percent, len(attempts))
        return {
            "correct": correct,
            "correct_index": question["correct_index"],
            "explanation": question["explanation"],
            "next_difficulty": next_level,
            "accuracy": round(accuracy_percent),
        }

    def _synchronize_alert(self, student_id: str, question: Row, accuracy_percent: float, attempts: int) -> None:
        try:
            self._alerts.synchronize(
                student_id=student_id,
                subject_id=question["subject_id"],
                topic=question["topic"],
                accuracy_percent=accuracy_percent,
                attempts=attempts,
            )
        except Exception as error:
            # A resposta do aluno já foi salva; problema no aviso não pode apagar a atividade.
            logger.warning("Não foi possível sincronizar o alerta de dificuldade: %s", type(error).__name__)
