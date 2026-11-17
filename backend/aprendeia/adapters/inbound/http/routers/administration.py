"""Rotas da administração: visão geral, contas, catálogo editorial e desempenho."""

import uuid
from typing import Literal

from fastapi import APIRouter, Query

from aprendeia.adapters.inbound.http.dependencies import AdminUser, Audit, RequestServices
from aprendeia.adapters.inbound.http.schemas import (
    AdminAccountDeletion,
    AdminLessonCreate,
    AdminModuleCreate,
    AdminSubjectCreate,
    MandatoryExercisesUpdate,
    TeacherApproval,
    UserCreate,
)

router = APIRouter(prefix="/admin")

AUDIT_ACTION_PATTERN = r"^(?:[A-Z][A-Z0-9_]+|[a-z][a-z0-9_.]+)$"
AUDIT_RETENTION_DAYS = 7


@router.get("/overview")
def admin_overview(_admin: AdminUser, services: RequestServices):
    """Resume o sistema sem incluir respostas ou dificuldades individuais."""

    return services.admin_overview.overview()


@router.get("/users")
def list_admin_users(_admin: AdminUser, services: RequestServices):
    """Lista perfis operacionais sem consultar senhas ou tokens do Auth."""

    return services.admin_overview.users()


@router.get("/audit-logs")
def list_access_audit_logs(
    admin: AdminUser,
    services: RequestServices,
    days: int = Query(default=AUDIT_RETENTION_DAYS, ge=1, le=AUDIT_RETENTION_DAYS),
    role: Literal["student", "teacher", "admin", "service"] | None = Query(default=None),
    outcome: Literal["success", "denied", "error"] | None = Query(default=None),
    action: str | None = Query(default=None, min_length=3, max_length=100, pattern=AUDIT_ACTION_PATTERN),
    user_id: uuid.UUID | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=200),
):
    """Entrega metadados de auditoria sem revelar rede, token ou payload."""

    return services.admin_overview.audit_logs(
        admin,
        days=days,
        role=role,
        outcome=outcome,
        action=action,
        user_id=str(user_id) if user_id else None,
        limit=limit,
    )


@router.get("/subjects")
def list_admin_subjects(_admin: AdminUser, services: RequestServices):
    return services.editorial_catalog.subjects()


@router.post("/subjects", status_code=201)
def create_admin_subject(payload: AdminSubjectCreate, admin: AdminUser, services: RequestServices):
    """Cria uma disciplina e matricula estudantes pelo gatilho já existente."""

    return services.editorial_catalog.create_subject(admin, payload.model_dump())


@router.put("/subjects/{subject_id}")
def update_admin_subject(
    subject_id: uuid.UUID, payload: AdminSubjectCreate, admin: AdminUser, services: RequestServices
):
    return services.editorial_catalog.update_subject(admin, str(subject_id), payload.model_dump())


@router.post("/subjects/{subject_id}/modules", status_code=201)
def create_admin_module(
    subject_id: uuid.UUID, payload: AdminModuleCreate, admin: AdminUser, services: RequestServices
):
    return services.editorial_catalog.create_module(admin, str(subject_id), payload.model_dump())


@router.post("/modules/{module_id}/lessons", status_code=201)
def create_admin_lesson(
    module_id: uuid.UUID, payload: AdminLessonCreate, admin: AdminUser, services: RequestServices
):
    return services.editorial_catalog.create_lesson(admin, str(module_id), payload.model_dump())


@router.put("/lessons/{lesson_id}")
def update_admin_lesson(
    lesson_id: uuid.UUID, payload: AdminLessonCreate, admin: AdminUser, services: RequestServices
):
    """Edita ou despublica a aula sem apagar histórico do estudante."""

    return services.editorial_catalog.update_lesson(admin, str(lesson_id), payload.model_dump())


@router.get("/lessons/{lesson_id}/mandatory-exercises")
def get_admin_lesson_required_exercises(lesson_id: uuid.UUID, _admin: AdminUser, services: RequestServices):
    return services.editorial_catalog.required_exercises(str(lesson_id))


@router.put("/lessons/{lesson_id}/mandatory-exercises")
def set_admin_lesson_required_exercises(
    lesson_id: uuid.UUID, payload: MandatoryExercisesUpdate, admin: AdminUser, services: RequestServices
):
    """Substitui a lista, sempre dentro da disciplina que contém a aula."""

    question_ids = [str(question_id) for question_id in payload.question_ids]
    return services.editorial_catalog.set_required_exercises(admin, str(lesson_id), question_ids)


@router.get("/contents")
def list_admin_contents(_admin: AdminUser, services: RequestServices):
    """Mostra aulas oficiais e materiais enviados por professores."""

    return services.editorial_catalog.contents()


@router.get("/teacher-requests")
def list_teacher_registration_requests(_admin: AdminUser, services: RequestServices):
    """Lista solicitações sem expor senhas, tokens ou metadados de autenticação."""

    return services.accounts.teacher_requests()


@router.post("/teacher-requests/{user_id}/approve")
def approve_teacher_registration(
    user_id: uuid.UUID, payload: TeacherApproval, admin: AdminUser, services: RequestServices, audit: Audit
):
    """Promove a solicitação em uma transação que também prende a disciplina."""

    return services.accounts.approve_teacher(admin, str(user_id), payload.subject, audit)


@router.post("/users")
def create_user(payload: UserCreate, admin: AdminUser, services: RequestServices, audit: Audit):
    """Cria uma conta e atribui a disciplina antes de liberar um professor."""

    return services.accounts.create_user(
        admin,
        name=payload.name,
        email=payload.email,
        password=payload.password,
        role=payload.role,
        subject=payload.subject,
        audit=audit,
    )


@router.post("/users/{user_id}/delete")
def admin_delete_user(
    user_id: uuid.UUID, payload: AdminAccountDeletion, admin: AdminUser, services: RequestServices, audit: Audit
):
    """Exclui um aluno ou professor; a RPC repete todas as verificações."""

    return services.accounts.delete_user(
        admin, str(user_id), confirmation=payload.confirmation, reason=payload.reason, audit=audit
    )


@router.get("/teachers")
def admin_teachers(_admin: AdminUser, services: RequestServices):
    """Todos os professores, com disciplina, turmas e alunos vinculados."""

    return services.school_performance.teachers()


@router.get("/classes")
def admin_classes(_admin: AdminUser, services: RequestServices):
    """Todas as turmas com professor, disciplina e número de alunos."""

    return services.school_performance.classes()


@router.get("/performance")
def admin_performance(
    admin: AdminUser,
    services: RequestServices,
    teacher_id: uuid.UUID | None = Query(default=None),
    subject_id: uuid.UUID | None = Query(default=None),
):
    """Desempenho agregado por turma e por professor, sem dados individuais."""

    return services.school_performance.performance(
        admin,
        teacher_id=str(teacher_id) if teacher_id else None,
        subject_id=str(subject_id) if subject_id else None,
    )
