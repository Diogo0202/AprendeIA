"""Regras pequenas e testáveis para a auditoria de acessos do AprendeIA.

O módulo trabalha somente com metadados técnicos. Corpo, query string, token,
senha e endereço IP puro nunca entram no registro persistido.
"""

from typing import Any


# O mapa explícito evita nomes ambíguos e permite provar em teste que cada
# funcionalidade protegida ganhou um evento de auditoria.
AUDIT_ACTIONS: dict[tuple[str, str], str] = {
    ("POST", "/auth/login"): "auth.login",
    ("GET", "/health"): "system.health.view",
    ("GET", "/question-bank"): "questions.list",
    ("POST", "/question-bank/generate"): "questions.generate",
    ("GET", "/question-bank/next"): "questions.next",
    ("POST", "/question-bank/{question_id}/answer"): "questions.answer",
    ("GET", "/student/subjects"): "student.subjects.view",
    ("GET", "/student/recommendations"): "student.recommendations.view",
    ("GET", "/student/diagnostic"): "student.diagnostic.view",
    ("POST", "/student/diagnostic/{question_id}/answer"): "student.diagnostic.answer",
    ("POST", "/student/diagnostic/complete"): "student.diagnostic.complete",
    ("GET", "/student/lessons/{lesson_id}"): "student.lesson.view",
    ("PUT", "/student/lessons/{lesson_id}/progress"): "student.lesson.progress",
    ("POST", "/student/lessons/{lesson_id}/required-exercises/{question_id}/complete"): "student.lesson.exercise.complete",
    ("GET", "/student/gamification"): "student.gamification.view",
    ("PUT", "/student/profile-personalization"): "student.profile.personalize",
    ("GET", "/teacher/questions"): "teacher.questions.list",
    ("PATCH", "/teacher/questions/{question_id}"): "teacher.questions.review",
    ("GET", "/teacher/students"): "teacher.students.list",
    ("GET", "/teacher/difficulty-alerts"): "teacher.alerts.list",
    ("GET", "/teacher/overview"): "teacher.overview.view",
    ("GET", "/teacher/classes"): "teacher.classes.list",
    ("POST", "/teacher/classes"): "teacher.classes.create",
    ("GET", "/teacher/classes/{class_id}"): "teacher.classes.view",
    ("POST", "/teacher/classes/{class_id}/students"): "teacher.classes.student.add",
    ("DELETE", "/teacher/classes/{class_id}/students/{student_id}"): "teacher.classes.student.remove",
    ("GET", "/teacher/classes/{class_id}/students/{student_id}/history"): "teacher.student.history.view",
    ("GET", "/teacher/reports/export"): "teacher.reports.export",
    ("GET", "/teacher/contents"): "teacher.contents.list",
    ("POST", "/teacher/contents"): "teacher.contents.create",
    ("POST", "/teacher/contents/import"): "teacher.contents.import",
    ("POST", "/teacher/recommendations"): "teacher.recommendations.generate",
    ("GET", "/admin/overview"): "admin.overview.view",
    ("GET", "/admin/users"): "admin.users.list",
    ("POST", "/admin/users"): "admin.users.create",
    ("GET", "/admin/subjects"): "admin.subjects.list",
    ("POST", "/admin/subjects"): "admin.subjects.create",
    ("PUT", "/admin/subjects/{subject_id}"): "admin.subjects.update",
    ("POST", "/admin/subjects/{subject_id}/modules"): "admin.modules.create",
    ("POST", "/admin/modules/{module_id}/lessons"): "admin.lessons.create",
    ("PUT", "/admin/lessons/{lesson_id}"): "admin.lessons.update",
    ("GET", "/admin/lessons/{lesson_id}/mandatory-exercises"): "admin.lessons.exercises.view",
    ("PUT", "/admin/lessons/{lesson_id}/mandatory-exercises"): "admin.lessons.exercises.update",
    ("GET", "/admin/contents"): "admin.contents.list",
    ("GET", "/admin/teacher-requests"): "admin.teacher_requests.list",
    ("POST", "/admin/teacher-requests/{user_id}/approve"): "admin.teacher_requests.approve",
    ("GET", "/admin/audit-logs"): "admin.audit_logs.list",
    ("POST", "/internal/weekly-difficulty-summary"): "system.weekly_summary.send",
}


def audit_action_for(method: str, route: str) -> str | None:
    """Traduz método e template da rota para uma ação estável."""

    return AUDIT_ACTIONS.get((method.upper(), route))


def audit_outcome(status_code: int) -> str:
    """Agrupa o resultado sem persistir mensagens internas de erro."""

    if 200 <= status_code < 400:
        return "success"
    if status_code in {401, 403, 429}:
        return "denied"
    return "error"


def build_access_audit_record(
    *,
    actor_id: str | None,
    actor_role: str | None,
    subject_hash: str | None,
    action: str,
    method: str,
    route: str,
    status_code: int,
    request_id: str,
    network_hash: str | None,
) -> dict[str, Any]:
    """Monta a linha com uma lista fechada de campos permitidos."""

    safe_role = actor_role if actor_role in {"student", "teacher", "admin", "service"} else None
    return {
        "actor_id": actor_id,
        "actor_role": safe_role,
        "subject_hash": subject_hash,
        "action": action[:100],
        "request_method": method.upper()[:7],
        "route": route[:180],
        "status_code": status_code,
        "outcome": audit_outcome(status_code),
        "request_id": request_id,
        "network_hash": network_hash,
    }
