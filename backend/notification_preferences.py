"""Preferências de e-mail do professor, separadas das rotas pedagógicas."""

from datetime import datetime, timezone
from typing import Any, Callable, Literal

from fastapi import Depends, FastAPI, HTTPException, Request
from pydantic import BaseModel, ConfigDict

PREFERENCE_FIELDS = ("email_difficulty_alerts", "email_weekly_summary")
EmailKind = Literal["email_difficulty_alerts", "email_weekly_summary"]


class NotificationPreferences(BaseModel):
    """As duas escolhas são obrigatórias para evitar desligar algo por omissão."""

    model_config = ConfigDict(extra="forbid")

    email_difficulty_alerts: bool
    email_weekly_summary: bool


def email_enabled(profile: dict[str, Any], kind: EmailKind) -> bool:
    """Perfis sem a coluna, anteriores à migration, mantêm o envio padrão."""

    return profile.get(kind) is not False


def register_notification_routes(
    app: FastAPI,
    *,
    database: Callable[[], Any],
    teacher_dependency: Callable[..., dict[str, Any]],
    enforce_limit: Callable[[Any, str, str], None],
) -> None:
    """Liga as rotas usando a autenticação e o limite já configurados em main."""

    @app.get("/teacher/notification-preferences")
    def read_preferences(user: dict[str, Any] = Depends(teacher_dependency)):
        """Lê somente o próprio perfil; o identificador vem da sessão."""

        rows = (
            database().table("profiles")
            .select("email_difficulty_alerts,email_weekly_summary,notification_preferences_updated_at")
            .eq("id", user["id"]).limit(1).execute().data
        )
        if not rows:
            raise HTTPException(404, "Perfil não encontrado.")
        row = rows[0]
        return {
            **{field: email_enabled(row, field) for field in PREFERENCE_FIELDS},
            "updated_at": row.get("notification_preferences_updated_at"),
        }

    @app.put("/teacher/notification-preferences")
    def update_preferences(
        preferences: NotificationPreferences,
        request: Request,
        user: dict[str, Any] = Depends(teacher_dependency),
    ):
        """Grava a escolha e deixa os novos valores no evento de auditoria."""

        db = database()
        enforce_limit(db, user["id"], "notification_preferences")
        updated_at = datetime.now(timezone.utc).isoformat()
        values = {**preferences.model_dump(), "notification_preferences_updated_at": updated_at}
        updated = db.table("profiles").update(values).eq("id", user["id"]).execute().data
        if not updated:
            raise HTTPException(404, "Perfil não encontrado.")
        request.state.audit_metadata = preferences.model_dump()
        return {**preferences.model_dump(), "updated_at": updated_at}
