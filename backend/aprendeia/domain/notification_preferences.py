"""Preferências de e-mail do professor."""

from typing import Any, Literal

PREFERENCE_FIELDS = ("email_difficulty_alerts", "email_weekly_summary")
EmailKind = Literal["email_difficulty_alerts", "email_weekly_summary"]


def email_enabled(profile: dict[str, Any], kind: EmailKind) -> bool:
    """Perfis sem a coluna, anteriores à migration, mantêm o envio padrão."""

    return profile.get(kind) is not False
