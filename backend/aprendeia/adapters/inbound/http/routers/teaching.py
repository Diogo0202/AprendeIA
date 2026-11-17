"""Rotas do painel do professor."""

from fastapi import APIRouter, Query, Response

from aprendeia.adapters.inbound.http.dependencies import Audit, RequestServices, TeacherUser
from aprendeia.adapters.inbound.http.schemas import (
    ClassStudentCreate,
    NotificationPreferences,
    RecommendationRequest,
    TeacherClassCreate,
    TeacherContentCreate,
    TeacherContentImport,
)

router = APIRouter(prefix="/teacher")


@router.get("/students")
def teacher_students(user: TeacherUser, services: RequestServices):
    """Lista apenas estudantes matriculados na disciplina do professor atual."""

    if not services.persistence.configured():
        return services.demo.teacher_students()
    return services.teacher_overview.students(user)


@router.get("/difficulty-alerts")
def teacher_difficulty_alerts(user: TeacherUser, services: RequestServices):
    """Devolve ao professor somente alertas ativos da própria disciplina."""

    if not services.persistence.configured():
        return services.demo.teacher_alerts()
    return services.teacher_overview.difficulty_alerts(user)


@router.get("/overview")
def teacher_overview(user: TeacherUser, services: RequestServices):
    """Entrega os indicadores principais somente da disciplina atribuída."""

    return services.teacher_overview.overview(user)


@router.get("/classes")
def list_teacher_classes(user: TeacherUser, services: RequestServices):
    """Lista apenas turmas criadas pelo professor atual."""

    return services.classrooms.list_classes(user)


@router.post("/classes", status_code=201)
def create_teacher_class(payload: TeacherClassCreate, user: TeacherUser, services: RequestServices, audit: Audit):
    """Cria uma turma já presa à disciplina do professor autenticado."""

    return services.classrooms.create(user, name=payload.name, school_year=payload.school_year, audit=audit)


@router.get("/classes/{class_id}")
def teacher_class_detail(class_id: str, user: TeacherUser, services: RequestServices):
    """Mostra estudantes e indicadores da turma, sempre em modo somente leitura."""

    return services.classrooms.detail(user, class_id)


@router.post("/classes/{class_id}/students", status_code=201)
def add_class_student(
    class_id: str, payload: ClassStudentCreate, user: TeacherUser, services: RequestServices, audit: Audit
):
    """Organiza a turma sem dar acesso para editar qualquer dado pedagógico."""

    return services.classrooms.add_student(user, class_id, payload.student_email, audit)


@router.delete("/classes/{class_id}/students/{student_id}", status_code=204)
def remove_class_student(class_id: str, student_id: str, user: TeacherUser, services: RequestServices):
    """Remove só o vínculo com a turma; histórico e perfil ficam intactos."""

    services.classrooms.remove_student(user, class_id, student_id)
    return Response(status_code=204)


@router.get("/classes/{class_id}/students/{student_id}/history")
def teacher_student_history(class_id: str, student_id: str, user: TeacherUser, services: RequestServices):
    """Fecha a rota por turma e estudante antes de devolver qualquer histórico."""

    return services.classrooms.student_history(user, class_id, student_id)


@router.get("/reports/export")
def export_teacher_report(
    class_id: str,
    user: TeacherUser,
    services: RequestServices,
    audit: Audit,
    student_id: str | None = Query(default=None),
):
    """Exporta a turma ou um aluno dela, sempre dentro da disciplina autorizada."""

    report = services.classrooms.export_report(user, class_id, student_id, audit)
    return Response(
        content=report["content"],
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{report["filename"]}"'},
    )


@router.get("/contents")
def list_teacher_contents(user: TeacherUser, services: RequestServices):
    """Lista materiais cadastrados somente pelo professor atual."""

    return services.teacher_contents.list_contents(user)


@router.post("/contents", status_code=201)
def create_teacher_content(payload: TeacherContentCreate, user: TeacherUser, services: RequestServices):
    """Cria material na disciplina atribuída, ignorando qualquer matéria do cliente."""

    return services.teacher_contents.create(user, payload.model_dump())


@router.post("/contents/import", status_code=201)
def import_teacher_contents(payload: TeacherContentImport, user: TeacherUser, services: RequestServices):
    """Importa lotes pequenos e validados, sem aceitar arquivos executáveis."""

    return services.teacher_contents.import_batch(user, content=payload.content, content_format=payload.format)


@router.post("/recommendations")
def generate_teacher_recommendation(payload: RecommendationRequest, user: TeacherUser, services: RequestServices):
    """Gera orientação pedagógica a partir de métricas, sem enviar dados pessoais."""

    return services.teacher_recommendations.generate(
        user, class_id=payload.class_id, student_id=payload.student_id
    )


@router.get("/notification-preferences")
def read_notification_preferences(user: TeacherUser, services: RequestServices):
    """Lê somente o próprio perfil; o identificador vem da sessão."""

    return services.notification_preferences.read(user)


@router.put("/notification-preferences")
def update_notification_preferences(
    preferences: NotificationPreferences, user: TeacherUser, services: RequestServices, audit: Audit
):
    """Grava a escolha e deixa os novos valores no evento de auditoria."""

    return services.notification_preferences.update(user, preferences.model_dump(), audit)
