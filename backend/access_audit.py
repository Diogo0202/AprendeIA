"""Regras pequenas e testáveis para a auditoria de acessos do AprendeIA.

O módulo trabalha somente com metadados técnicos. Corpo, query string, token,
senha e endereço IP puro nunca entram no registro persistido.
"""

from datetime import datetime, timezone
from typing import Any


# O mapa explícito evita nomes ambíguos e permite provar em teste que cada
# funcionalidade protegida ganhou um evento de auditoria.
AUDIT_ACTIONS: dict[tuple[str, str], str] = {
    ("GET", "/student/leaderboard"): "student.leaderboard.view",
    ("PUT", "/student/leaderboard-preferences"): "student.leaderboard.preferences",
    ("GET", "/teacher/classes/{class_id}/leaderboard"): "teacher.leaderboard.view",
    ("GET", "/account/status"): "account.status.view",
    ("PUT", "/account/age-band"): "account.age.declare",
    ("POST", "/account/admission"): "account.admission.request",
    ("GET", "/admin/account-admissions"): "admin.admissions.list",
    ("POST", "/admin/account-admissions/{request_id}/review"): "admin.admissions.review",
    ("POST", "/internal/account-retention/preview"): "account.retention.preview",
    ("POST", "/internal/account-retention/execute"): "account.retention.execute",
    ("POST", "/auth/login"): "LOGIN_SUCCESS",
    ("GET", "/health"): "system.health.view",
    ("POST", "/privacy/accept"): "privacy.policy.accept",
    ("GET", "/privacy/requests"): "privacy.requests.list",
    ("POST", "/privacy/requests"): "privacy.requests.create",
    ("POST", "/privacy/requests/{request_id}/cancel"): "privacy.requests.cancel",
    ("GET", "/privacy/requests/{request_id}/export"): "privacy.requests.export",
    ("GET", "/admin/privacy-requests"): "privacy.requests.admin.list",
    ("POST", "/admin/privacy-requests/{request_id}/resolve"): "privacy.requests.resolve",
    ("GET", "/communications/contacts"): "communications.contacts.list",
    ("GET", "/communications/conversations"): "communications.conversations.list",
    ("POST", "/communications/conversations"): "communications.conversations.create",
    ("GET", "/communications/conversations/{conversation_id}/messages"): "communications.messages.list",
    ("POST", "/communications/conversations/{conversation_id}/messages"): "communications.messages.send",
    ("POST", "/communications/ai/messages"): "communications.ai.send",
    ("GET", "/question-bank"): "questions.list",
    ("POST", "/question-bank/generate"): "GENERATE_QUESTION",
    ("GET", "/question-bank/next"): "questions.next",
    ("POST", "/question-bank/{question_id}/answer"): "ANSWER_QUESTION",
    ("GET", "/student/subjects"): "student.subjects.view",
    ("GET", "/student/recommendations"): "student.recommendations.view",
    ("GET", "/student/diagnostic"): "student.diagnostic.view",
    ("POST", "/student/diagnostic/{question_id}/answer"): "student.diagnostic.answer",
    ("POST", "/student/diagnostic/complete"): "student.diagnostic.complete",
    ("GET", "/student/lessons/{lesson_id}"): "student.lesson.view",
    ("PUT", "/student/lessons/{lesson_id}/progress"): "student.lesson.progress",
    ("POST", "/student/lessons/{lesson_id}/required-exercises/{question_id}/complete"): "student.lesson.exercise.complete",
    ("GET", "/student/gamification"): "student.gamification.view",
    ("PUT", "/student/profile-personalization"): "UPDATE_PROFILE",
    ("GET", "/teacher/questions"): "teacher.questions.list",
    ("PATCH", "/teacher/questions/{question_id}"): "teacher.questions.review",
    ("GET", "/teacher/students"): "teacher.students.list",
    ("GET", "/teacher/difficulty-alerts"): "teacher.alerts.list",
    ("GET", "/teacher/notification-preferences"): "teacher.notifications.view",
    ("PUT", "/teacher/notification-preferences"): "UPDATE_NOTIFICATION_PREFERENCES",
    ("GET", "/teacher/overview"): "teacher.overview.view",
    ("GET", "/teacher/classes"): "teacher.classes.list",
    ("POST", "/teacher/classes"): "CREATE_CLASS",
    ("GET", "/teacher/classes/{class_id}"): "teacher.classes.view",
    ("POST", "/teacher/classes/{class_id}/students"): "ADD_STUDENT_TO_CLASS",
    ("DELETE", "/teacher/classes/{class_id}/students/{student_id}"): "teacher.classes.student.remove",
    ("GET", "/teacher/classes/{class_id}/students/{student_id}/history"): "teacher.student.history.view",
    ("GET", "/teacher/reports/export"): "EXPORT_REPORT",
    ("GET", "/teacher/contents"): "teacher.contents.list",
    ("POST", "/teacher/contents"): "teacher.contents.create",
    ("POST", "/teacher/contents/import"): "teacher.contents.import",
    ("POST", "/teacher/recommendations"): "teacher.recommendations.generate",
    ("GET", "/admin/overview"): "admin.overview.view",
    ("GET", "/admin/users"): "admin.users.list",
    ("POST", "/admin/users"): "CREATE_USER",
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
    ("POST", "/admin/teacher-requests/{user_id}/approve"): "APPROVE_TEACHER",
    ("GET", "/admin/audit-logs"): "admin.audit_logs.list",
    ("GET", "/admin/teachers"): "admin.teachers.list",
    ("GET", "/admin/classes"): "admin.classes.list",
    ("GET", "/admin/performance"): "admin.performance.view",
    ("POST", "/admin/users/{user_id}/delete"): "DELETE_USER",
    ("POST", "/internal/weekly-difficulty-summary"): "SEND_WEEKLY_SUMMARY",
}


def audit_action_for(method: str, route: str, status_code: int | None = None) -> str | None:
    """Traduz método e template da rota para uma ação estável."""

    if method.upper() == "POST" and route == "/auth/login" and status_code is not None:
        return "LOGIN_SUCCESS" if 200 <= status_code < 400 else "LOGIN_FAILED"
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
    resource_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Monta a linha com uma lista fechada de campos permitidos."""

    safe_role = actor_role if actor_role in {"student", "teacher", "admin", "service"} else None
    # A tarefa semanal só registra totais e semana, nunca nomes nem o corpo do e-mail.
    safe_metadata = {
        key: value
        for key, value in (metadata or {}).items()
        if key in {
            "class_id",
            "student_id",
            "policy_version",
            "terms_version",
            "policy_hash",
            "week_start",
            "teachers_notified",
            "teachers_skipped",
            "failed_deliveries",
            "delivery_status",
            "email_difficulty_alerts",
            "email_weekly_summary",
            # Exclusão administrativa: cargo removido e motivo escrito pela administração.
            "deleted_role",
            "reason",
        }
        and isinstance(value, (str, int, float, bool, type(None)))
    }
    timestamp = datetime.now(timezone.utc).isoformat()
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
        # Os campos novos convivem com os antigos durante a migração dos leitores.
        "user_id": actor_id,
        "role": safe_role,
        "resource": route[:180],
        "resource_id": resource_id,
        "ip_hash": network_hash,
        "created_at": timestamp,
        "metadata": safe_metadata,
    }
