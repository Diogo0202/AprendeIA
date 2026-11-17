"""Política de uso por ação: (máximo de chamadas, janela em segundos).

Limites menores ficam nas ações que geram custo ou alteram dados importantes.
A contagem real acontece no PostgreSQL, então continua valendo se o Railway
iniciar mais de uma cópia do backend.
"""

FIFTEEN_MINUTES = 15 * 60
ONE_HOUR = 60 * 60

LEADERBOARD_RATE_LIMITS: dict[str, tuple[int, int]] = {
    "leaderboard_read": (60, FIFTEEN_MINUTES),
    "leaderboard_preferences": (10, FIFTEEN_MINUTES),
}

API_RATE_LIMITS: dict[str, tuple[int, int]] = {
    **LEADERBOARD_RATE_LIMITS,
    "account_lifecycle_write": (10, FIFTEEN_MINUTES),
    "account_lifecycle_read": (60, FIFTEEN_MINUTES),
    "answer_question": (120, FIFTEEN_MINUTES),
    "diagnostic_answer": (60, ONE_HOUR),
    "lesson_progress": (240, ONE_HOUR),
    "generate_question": (10, ONE_HOUR),
    "teacher_question_write": (60, ONE_HOUR),
    "profile_personalization": (30, ONE_HOUR),
    "notification_preferences": (30, ONE_HOUR),
    "admin_performance_read": (120, ONE_HOUR),
    "admin_user_delete": (10, ONE_HOUR),
    "teacher_class_write": (60, ONE_HOUR),
    "teacher_content_write": (30, ONE_HOUR),
    "teacher_content_import": (10, ONE_HOUR),
    "teacher_recommendation": (10, ONE_HOUR),
    "admin_user_write": (30, ONE_HOUR),
    "admin_content_write": (60, ONE_HOUR),
    "admin_audit_read": (120, ONE_HOUR),
    "communication_write": (120, ONE_HOUR),
    "ai_communication": (20, ONE_HOUR),
    "privacy_accept": (5, ONE_HOUR),
    "privacy_request_write": (10, ONE_HOUR),
    "privacy_data_export": (2, ONE_HOUR),
    "privacy_admin_read": (120, ONE_HOUR),
    "privacy_request_resolve": (30, ONE_HOUR),
}


def rate_limit_policy(action: str) -> tuple[int, int]:
    """Toda ação protegida precisa de política explícita; esquecer é erro de código."""

    if action not in API_RATE_LIMITS:
        raise RuntimeError("Ação sem política de limite configurada.")
    return API_RATE_LIMITS[action]
