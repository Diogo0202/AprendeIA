"""Casos de uso da trilha do estudante: catálogo, aulas, diagnóstico e perfil."""

from datetime import datetime, timezone
from typing import Any

from aprendeia.application.ports.learning import (
    DiagnosticRepository,
    DuplicateAnswer,
    GamificationRepository,
    StudentLearningRepository,
)
from aprendeia.application.ports.security import RateLimiter
from aprendeia.domain.catalog import build_subject_catalog, catalog_lessons, normalize_attempts
from aprendeia.domain.errors import Conflict, InvalidInput, NotFound
from aprendeia.domain.gamification import can_feature_achievement
from aprendeia.domain.learning_engine import build_study_recommendations, build_topic_mastery
from aprendeia.domain.questions import (
    hide_question_solution,
    lesson_requirements_complete,
    select_diagnostic_questions,
    serialize_question,
)

Row = dict[str, Any]
LESSON_NOT_FOUND = "Aula não encontrada."
ALREADY_ANSWERED = "Esta questão já foi respondida."
EMPTY_PROGRESS = {"completed": False, "time_seconds": 0}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class StudyPlanService:
    """Catálogo real e recomendações calculadas com a atividade da própria pessoa."""

    def __init__(self, learning: StudentLearningRepository) -> None:
        self._learning = learning

    def catalog(self, student_id: str) -> list[Row]:
        """Monta disciplina, módulos, aulas e progresso em um contrato único."""

        subject_ids = self._learning.enrolled_subject_ids(student_id)
        if not subject_ids:
            return []
        return build_subject_catalog(*self._learning.catalog_rows(student_id, subject_ids))

    def mastery(self, student_id: str) -> tuple[list[Row], list[Row]]:
        """Combina prática e diagnóstico para recomendar aulas do próprio catálogo."""

        questions = self._learning.all_questions()
        attempts = [
            *self._learning.practice_attempts(student_id),
            *self._learning.diagnostic_attempts(student_id),
        ]
        mastery = build_topic_mastery(normalize_attempts(attempts, questions))
        lessons = catalog_lessons(self.catalog(student_id))
        return mastery, build_study_recommendations(mastery, lessons)

    def recommendations(self, student_id: str) -> Row:
        mastery, recommendations = self.mastery(student_id)
        return {"mastery": mastery, "recommendations": recommendations}


class LessonService:
    """Aulas, progresso e exercícios obrigatórios da pessoa dona da sessão."""

    def __init__(self, *, learning: StudentLearningRepository, limiter: RateLimiter) -> None:
        self._learning = learning
        self._limiter = limiter

    def open(self, user: Row, lesson_id: str) -> Row:
        """Abre uma aula somente quando a disciplina pertence ao estudante."""

        lesson = self._learning.published_lesson(lesson_id)
        if not lesson:
            raise NotFound(LESSON_NOT_FOUND)
        # Aula de outra disciplina responde como inexistente, sem confirmar que existe.
        if not self._learning.is_enrolled(user["id"], lesson["modules"]["subject_id"]):
            raise NotFound(LESSON_NOT_FOUND)
        progress = self._learning.lesson_progress(user["id"], lesson_id)
        return {
            **lesson,
            "progress": progress or dict(EMPTY_PROGRESS),
            "required_exercises": self.required_exercises(user["id"], lesson_id),
        }

    def required_exercises(self, student_id: str, lesson_id: str) -> list[Row]:
        """Expõe a questão sem gabarito e o estado confirmado do checklist."""

        links = self._learning.required_exercise_links(lesson_id)
        question_ids = [row["question_id"] for row in links]
        if not question_ids:
            return []
        attempted = self._learning.attempted_question_ids(student_id, question_ids)
        completed = self._learning.completed_exercise_ids(student_id, lesson_id, question_ids)
        return [
            {
                "id": row["question_id"],
                "position": row["position"],
                **hide_question_solution(serialize_question(row["questions"])),
                "answered": row["question_id"] in attempted,
                "checked": row["question_id"] in completed,
            }
            for row in links
        ]

    def update_progress(self, user: Row, lesson_id: str, *, completed: bool, time_seconds: int) -> Row:
        """Salva apenas o progresso da pessoa dona da sessão."""

        self._limiter.enforce(user["id"], "lesson_progress")
        lesson = self.open(user, lesson_id)
        previous = lesson["progress"]
        if completed and not lesson_requirements_complete(lesson["required_exercises"]):
            raise Conflict("Conclua e confirme todos os exercícios obrigatórios antes de avançar.")
        return self._learning.save_lesson_progress({
            "student_id": user["id"],
            "lesson_id": lesson_id,
            "completed": bool(completed or previous.get("completed")),
            "time_seconds": max(int(previous.get("time_seconds", 0)), time_seconds),
            "last_accessed_at": _now(),
        })

    def complete_required_exercise(self, user: Row, lesson_id: str, question_id: str) -> Row:
        """Confirma o check somente após encontrar uma tentativa real no banco."""

        self._limiter.enforce(user["id"], "lesson_progress")
        lesson = self.open(user, lesson_id)
        exercises = lesson["required_exercises"]
        required = next((item for item in exercises if item["id"] == question_id), None)
        if not required:
            raise NotFound("Exercício obrigatório não encontrado nesta aula.")
        if not required["answered"]:
            raise Conflict("Responda o exercício antes de marcá-lo como concluído.")
        saved = self._learning.save_exercise_completion({
            "student_id": user["id"],
            "lesson_id": lesson_id,
            "question_id": question_id,
            "completed_at": _now(),
        })
        updated = [{**item, "checked": item["checked"] or item["id"] == question_id} for item in exercises]
        return {"completion": saved, "required_complete": lesson_requirements_complete(updated)}


class DiagnosticService:
    """Primeira medição: questões publicadas de várias disciplinas, sem gabarito."""

    def __init__(
        self, *, diagnostics: DiagnosticRepository, study_plan: StudyPlanService, limiter: RateLimiter
    ) -> None:
        self._diagnostics = diagnostics
        self._study_plan = study_plan
        self._limiter = limiter

    def current(self, user: Row) -> Row:
        completed = self._diagnostics.last_completed_session(user["id"])
        if completed:
            return {
                "status": "completed",
                "session_id": completed["id"],
                "completed_at": completed["completed_at"],
                **self._study_plan.recommendations(user["id"]),
            }
        session = self._diagnostics.open_session(user["id"])
        if session:
            questions = self.session_questions(session)
        else:
            session, questions = self.create_session(user["id"])
        return {
            "status": "open",
            "session_id": session["id"],
            "answered_question_ids": self._diagnostics.answered_question_ids(session["id"], user["id"]),
            "questions": [hide_question_solution(serialize_question(row)) for row in questions],
        }

    def create_session(self, student_id: str) -> tuple[Row, list[Row]]:
        """Sorteia as questões da primeira medição e abre a sessão do aluno."""

        selected = select_diagnostic_questions(self._diagnostics.published_candidates())
        if not selected:
            raise Conflict("Ainda não há questões publicadas para a avaliação diagnóstica.")
        session = self._diagnostics.create_session(student_id, [row["id"] for row in selected])
        return session, selected

    def session_questions(self, session: Row) -> list[Row]:
        """Recarrega as questões de uma sessão que o aluno já havia aberto."""

        question_ids = session.get("question_ids") or []
        if not question_ids:
            return []
        return self._diagnostics.questions_by_ids(question_ids)

    def answer(self, user: Row, question_id: str, *, selected_index: int, response_time_seconds: int) -> Row:
        """Registra a medição sem entregar o gabarito durante a avaliação."""

        self._limiter.enforce(user["id"], "diagnostic_answer")
        session = self._diagnostics.open_session(user["id"])
        if not session or question_id not in (session.get("question_ids") or []):
            raise NotFound("Questão não pertence à avaliação atual.")
        if self._diagnostics.has_answer(session["id"], question_id):
            raise Conflict(ALREADY_ANSWERED)
        correct_index = self._diagnostics.correct_index_of(question_id)
        if correct_index is None:
            raise NotFound("Questão não encontrada.")
        try:
            self._diagnostics.save_answer({
                "session_id": session["id"],
                "student_id": user["id"],
                "question_id": question_id,
                "selected_index": selected_index,
                "correct": selected_index == correct_index,
                "response_time_seconds": response_time_seconds,
            })
        except DuplicateAnswer as error:
            # Duas respostas simultâneas passam pela checagem acima; a restrição
            # unique(session_id, question_id) decide e a perdedora recebe conflito.
            raise Conflict(ALREADY_ANSWERED) from error
        return {
            "saved": True,
            "answered": self._diagnostics.count_answers(session["id"]),
            "total": len(session.get("question_ids") or []),
        }

    def complete(self, user: Row) -> Row:
        """Fecha a avaliação só depois de todas as respostas e devolve o mapa real."""

        session = self._diagnostics.open_session(user["id"])
        if not session:
            raise Conflict("Não existe avaliação diagnóstica em andamento.")
        answer_count = self._diagnostics.count_answers(session["id"])
        question_count = len(session.get("question_ids") or [])
        if not question_count or answer_count < question_count:
            raise Conflict("Responda todas as questões antes de concluir.")
        completed_at = _now()
        self._diagnostics.complete_session(session["id"], user["id"], completed_at)
        return {
            "status": "completed",
            "completed_at": completed_at,
            **self._study_plan.recommendations(user["id"]),
        }


class StudentProfileService:
    """Jornada gamificada e personalização visual do próprio perfil."""

    def __init__(
        self, *, gamification: GamificationRepository, learning: StudentLearningRepository, limiter: RateLimiter
    ) -> None:
        self._gamification = gamification
        self._learning = learning
        self._limiter = limiter

    def gamification(self, user: Row) -> Row:
        """Calcula a jornada usando apenas a atividade do estudante autenticado."""

        self._limiter.enforce(user["id"], "leaderboard_read")
        return self._gamification.summary(user["id"])

    def personalize(self, user: Row, *, avatar_key: str, featured_badge_id: str | None, accent_theme: str) -> Row:
        """Salva somente no perfil atual e recusa uma insígnia ainda bloqueada."""

        self._limiter.enforce(user["id"], "profile_personalization")
        summary = self._gamification.summary(user["id"])
        if not can_feature_achievement(summary, featured_badge_id):
            raise InvalidInput("Essa insígnia ainda não foi desbloqueada.")
        values = {
            "avatar_key": avatar_key,
            "featured_badge_id": featured_badge_id,
            "accent_theme": accent_theme,
            "profile_setup_complete": True,
            "updated_at": _now(),
        }
        if not self._learning.update_profile(user["id"], values):
            raise NotFound("Perfil não encontrado.")
        return values
