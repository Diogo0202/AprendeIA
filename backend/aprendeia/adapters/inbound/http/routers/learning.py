"""Rotas do banco de questões e da trilha do estudante."""

import uuid
from typing import Literal

from fastapi import APIRouter, Query, Response

from aprendeia.adapters.inbound.http.dependencies import (
    Audit,
    LearnerOrTeacher,
    RequestServices,
    StudentUser,
    TeacherUser,
)
from aprendeia.adapters.inbound.http.schemas import (
    AnswerRequest,
    DiagnosticAnswerRequest,
    LessonProgressUpdate,
    QuestionRequest,
    StudentProfilePersonalization,
    TeacherQuestionReview,
)
from aprendeia.application.services.account_rights import LeaderboardData, LeaderboardPreferences
from aprendeia.domain.errors import Unprocessable
from aprendeia.domain.questions import validate_question_id
from aprendeia.domain.text import sanitize_prompt_value

router = APIRouter()

SUBJECT_MAX_LENGTH = 60
MAX_PAGE = 1_000_000
MAX_PAGE_SIZE = 50


@router.get("/question-bank")
def list_questions(
    user: LearnerOrTeacher,
    services: RequestServices,
    subject: str | None = None,
    difficulty: str | None = None,
):
    """Lista questões e permite filtros simples para uso pedagógico."""

    if subject is not None:
        subject = sanitize_prompt_value(subject, max_length=SUBJECT_MAX_LENGTH)
    if not services.persistence.configured():
        return services.demo.list_questions(user, subject, difficulty)
    return services.question_bank.list_questions(user, subject, difficulty)


@router.post("/question-bank/generate")
def generate_question(request: QuestionRequest, user: TeacherUser, services: RequestServices, audit: Audit):
    """Gera com IA e persiste a nova questão quando existe banco configurado."""

    parameters = {"subject": request.subject, "topic": request.topic, "difficulty": request.difficulty}
    if not services.persistence.configured():
        return services.demo.generate(**parameters, audit=audit)
    return services.question_bank.generate(user, **parameters, audit=audit)


@router.get("/teacher/questions")
def list_teacher_questions(user: TeacherUser, services: RequestServices):
    """Abre a fila editorial apenas na disciplina atribuída ao professor."""

    return services.question_bank.teacher_queue(user)


@router.patch("/teacher/questions/{question_id}")
def review_teacher_question(
    question_id: uuid.UUID, payload: TeacherQuestionReview, user: TeacherUser, services: RequestServices
):
    """Permite revisão e publicação sem tocar em outra disciplina."""

    return services.question_bank.review(user, str(question_id), payload.model_dump())


@router.get("/question-bank/next")
def next_question(user: StudentUser, services: RequestServices, subject: str = "Matemática"):
    """Seleciona uma questão no nível calculado para o estudante autenticado."""

    subject = sanitize_prompt_value(subject, max_length=SUBJECT_MAX_LENGTH)
    if not services.persistence.configured():
        return services.demo.next_question(user, subject)
    return services.question_bank.next_question(user, subject)


@router.post("/question-bank/{question_id}/answer")
def answer_question(
    question_id: str, answer: AnswerRequest, user: StudentUser, services: RequestServices, audit: Audit
):
    """Corrige, registra a tentativa e recalcula a dificuldade recomendada."""

    question_id = validate_question_id(question_id)
    audit.resource(question_id)
    if not services.persistence.configured():
        return services.demo.answer(user, question_id, selected_index=answer.selected_index)
    return services.question_bank.answer(
        user,
        question_id,
        selected_index=answer.selected_index,
        response_time_seconds=answer.response_time_seconds,
    )


@router.get("/student/subjects")
def student_subjects(user: StudentUser, services: RequestServices):
    """Entrega o catálogo real somente para o estudante autenticado."""

    if not services.persistence.configured():
        return services.demo.subjects()
    return services.study_plan.catalog(user["id"])


@router.get("/student/recommendations")
def student_recommendations(user: StudentUser, services: RequestServices):
    """Explica tópicos dominados, frágeis e as próximas aulas indicadas."""

    if not services.persistence.configured():
        return services.demo.recommendations()
    return services.study_plan.recommendations(user["id"])


@router.get("/student/diagnostic")
def student_diagnostic(user: StudentUser, services: RequestServices):
    """Cria a primeira medição com questões publicadas de várias disciplinas."""

    if not services.persistence.configured():
        return services.demo.diagnostic()
    return services.diagnostics.current(user)


@router.post("/student/diagnostic/{question_id}/answer")
def answer_student_diagnostic(
    question_id: uuid.UUID, payload: DiagnosticAnswerRequest, user: StudentUser, services: RequestServices
):
    """Registra a medição sem entregar o gabarito durante a avaliação."""

    return services.diagnostics.answer(
        user,
        str(question_id),
        selected_index=payload.selected_index,
        response_time_seconds=payload.response_time_seconds,
    )


@router.post("/student/diagnostic/complete")
def complete_student_diagnostic(user: StudentUser, services: RequestServices):
    """Fecha a avaliação só depois de todas as respostas e devolve o mapa real."""

    return services.diagnostics.complete(user)


@router.get("/student/lessons/{lesson_id}")
def student_lesson(lesson_id: uuid.UUID, user: StudentUser, services: RequestServices):
    """Abre uma aula somente quando a disciplina pertence ao estudante."""

    return services.lessons.open(user, str(lesson_id))


@router.put("/student/lessons/{lesson_id}/progress")
def update_student_lesson_progress(
    lesson_id: uuid.UUID, payload: LessonProgressUpdate, user: StudentUser, services: RequestServices
):
    """Salva apenas o progresso da pessoa dona da sessão."""

    return services.lessons.update_progress(
        user, str(lesson_id), completed=payload.completed, time_seconds=payload.time_seconds
    )


@router.post("/student/lessons/{lesson_id}/required-exercises/{question_id}/complete")
def complete_required_exercise(
    lesson_id: uuid.UUID, question_id: uuid.UUID, user: StudentUser, services: RequestServices
):
    """Confirma o check somente após encontrar uma tentativa real no banco."""

    return services.lessons.complete_required_exercise(user, str(lesson_id), str(question_id))


@router.get("/student/gamification")
def student_gamification(response: Response, user: StudentUser, services: RequestServices):
    """Calcula a jornada usando apenas a atividade do estudante autenticado."""

    response.headers["Cache-Control"] = "no-store"
    if not services.persistence.configured():
        return services.demo.gamification()
    return services.student_profile.gamification(user)


@router.put("/student/profile-personalization")
def update_student_profile_personalization(
    personalization: StudentProfilePersonalization, user: StudentUser, services: RequestServices
):
    """Salva somente no perfil atual e recusa uma insígnia ainda bloqueada."""

    return services.student_profile.personalize(
        user,
        avatar_key=personalization.avatar_key,
        featured_badge_id=personalization.featured_badge_id,
        accent_theme=personalization.accent_theme,
    )


@router.get("/student/leaderboard", response_model=LeaderboardData)
def student_leaderboard(
    response: Response,
    user: StudentUser,
    services: RequestServices,
    scope: Literal["class", "school"] = "class",
    class_id: uuid.UUID | None = None,
    page: int = Query(1, ge=1, le=MAX_PAGE),
    page_size: int = Query(20, ge=1, le=MAX_PAGE_SIZE),
):
    if scope == "school" and class_id is not None:
        raise Unprocessable("Informe class_id somente para o ranking da turma.")
    response.headers["Cache-Control"] = "no-store"
    return services.leaderboard.weekly(
        user,
        scope=scope,
        class_id=str(class_id) if class_id is not None else None,
        page=page,
        page_size=page_size,
    )


@router.get("/teacher/classes/{class_id}/leaderboard", response_model=LeaderboardData)
def teacher_leaderboard(
    class_id: uuid.UUID,
    response: Response,
    user: TeacherUser,
    services: RequestServices,
    page: int = Query(1, ge=1, le=MAX_PAGE),
    page_size: int = Query(20, ge=1, le=MAX_PAGE_SIZE),
):
    response.headers["Cache-Control"] = "no-store"
    return services.leaderboard.weekly(user, scope="class", class_id=str(class_id), page=page, page_size=page_size)


@router.put("/student/leaderboard-preferences", response_model=LeaderboardPreferences)
def update_leaderboard_preferences(
    preferences: LeaderboardPreferences, response: Response, user: StudentUser, services: RequestServices
):
    result = services.leaderboard.update_preferences(
        user, alias=preferences.alias, school_opt_in=preferences.school_opt_in
    )
    response.headers["Cache-Control"] = "no-store"
    return result
