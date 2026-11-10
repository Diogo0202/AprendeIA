"""Pedidos do titular, separados das rotas pedagógicas e sem exportar credenciais."""

from datetime import datetime, timezone
from typing import Any, Callable, Literal
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from rpc_errors import rpc_http_error


class ProfileCorrections(BaseModel):
    """Só campos de apresentação podem ser corrigidos por este fluxo."""

    model_config = ConfigDict(extra="forbid")
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    grade: str | None = Field(default=None, max_length=60)
    goal: str | None = Field(default=None, max_length=500)

    @field_validator("full_name", "grade", "goal")
    @classmethod
    def clean_text(cls, value: str | None) -> str | None:
        if value is not None and any(ord(char) < 32 for char in value):
            raise ValueError("Não inclua caracteres de controle.")
        return value.strip() if value is not None else None

    @field_validator("full_name")
    @classmethod
    def valid_name(cls, value: str | None) -> str | None:
        if value is not None and len(value) < 2:
            raise ValueError("O nome precisa de pelo menos dois caracteres.")
        return value


class PrivacyRequestCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal[
        "access", "correction", "anonymization", "deletion",
        "confirmation", "sharing", "opposition", "revocation", "portability", "automated_review",
    ]
    details: str = Field(default="", max_length=1000)
    corrections: ProfileCorrections | None = None

    @model_validator(mode="after")
    def validate_corrections(self):
        values = self.corrections.model_dump(exclude_none=True) if self.corrections else {}
        if (self.kind == "correction") != bool(values):
            raise ValueError("Informe campos de perfil somente em um pedido de correção.")
        if any(ord(char) < 32 and char not in "\n\t" for char in self.details):
            raise ValueError("Detalhamento contém caracteres de controle.")
        return self


class PrivacyRequestResolve(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decision: Literal["complete", "reject"]
    response: str = Field(min_length=2, max_length=1000)
    confirmation: str = Field(default="", max_length=20)

    @field_validator("response")
    @classmethod
    def valid_response(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 2 or any(ord(char) < 32 and char not in "\n\t" for char in value):
            raise ValueError("Escreva uma resposta válida para o titular.")
        return value


REQUEST_FIELDS = "id,user_id,kind,status,details,corrections,response,created_at,resolved_at,expires_at"

# Cada consulta filtra a pessoa antes de paginar. Não há SELECT * de Auth nem
# exportação dos históricos de colegas que compartilham a mesma turma.
EXPORT_TABLES = (
    ("profiles", "id", "id,email,full_name,role,grade,goal,created_at,updated_at,avatar_key,featured_badge_id,accent_theme,profile_setup_complete,requested_role,requested_subject,registration_status,privacy_policy_version,privacy_policy_accepted_at,terms_of_use_version,terms_of_use_accepted_at,auth_created_at,account_expires_at,age_band,admission_status,admission_version,email_difficulty_alerts,email_weekly_summary,notification_preferences_updated_at"),
    ("gamification_events", "student_id", "event_kind,event_key,xp,occurred_at,subject_id"),
    ("student_achievements", "student_id", "achievement_id,earned_at"),
    ("leaderboard_preferences", "student_id", "alias,school_opt_in"),
    ("account_admissions", "user_id", "id,responsible_name,responsible_contact,institutional_reference,version,decision,note,reviewed_at,created_at"),
    ("enrollments", "student_id", "subject_id,enrolled_at"),
    ("lesson_progress", "student_id", "lesson_id,completed,time_seconds,last_accessed_at"),
    ("question_attempts", "student_id", "id,question_id,selected_index,correct,response_time_seconds,answered_at"),
    ("student_difficulties", "student_id", "subject_id,topic,level,accuracy,attempts,updated_at"),
    ("difficulty_alerts", "student_id", "subject_id,topic,accuracy,attempts,status,opened_at,updated_at"),
    ("pedagogical_recommendations", "student_id", "id,subject_id,recommendation,created_at"),
    ("diagnostic_sessions", "student_id", "id,status,started_at,completed_at"),
    ("diagnostic_answers", "student_id", "id,session_id,question_id,selected_index,correct,response_time_seconds,answered_at"),
    ("student_activity_days", "student_id", "activity_date,last_activity_at"),
    ("lesson_exercise_completions", "student_id", "lesson_id,question_id,completed_at"),
    ("class_students", "student_id", "class_id,joined_at"),
    ("teacher_subjects", "teacher_id", "subject_id,created_at"),
    ("classes", "teacher_id", "id,subject_id,name,school_year,created_at"),
    ("learning_contents", "teacher_id", "id,subject_id,title,description,content_type,source_url,created_at"),
    ("questions", "created_by", "id,subject_id,topic,difficulty,question,options,correct_index,explanation,status,created_at"),
    ("messages", "sender_id", "id,conversation_id,body,created_at"),
    ("conversations", "created_by", "id,kind,created_at,last_message_at"),
    ("conversation_members", "user_id", "conversation_id,joined_at"),
    ("privacy_policy_acceptances", "user_id", "policy_version,terms_version,accepted_at"),
    ("privacy_requests", "user_id", "id,kind,status,details,corrections,response,created_at,resolved_at"),
    ("access_audit_logs", "user_id", "action,resource,resource_id,status_code,outcome,created_at"),
)

EXPORT_ORDER = {
    "gamification_events": ("event_kind", "event_key"),
    "student_achievements": ("achievement_id",),
    "leaderboard_preferences": ("student_id",),
    "enrollments": ("subject_id",), "lesson_progress": ("lesson_id",),
    "student_difficulties": ("subject_id", "topic"), "student_activity_days": ("activity_date",),
    "lesson_exercise_completions": ("lesson_id", "question_id"), "class_students": ("class_id",),
    "teacher_subjects": ("subject_id",), "conversation_members": ("conversation_id",),
    "privacy_policy_acceptances": ("policy_version",),
}


def personal_export(db: Any, user_id: str) -> dict[str, Any]:
    """Página cheia exige próxima consulta; um limite não pode cortar o arquivo em silêncio."""

    result: dict[str, Any] = {"generated_at": datetime.now(timezone.utc).isoformat(), "data": {}}
    for table, owner_column, fields in EXPORT_TABLES:
        rows = []
        # O teto evita uma resposta sem limite de memória. Contas acima dele
        # recebem erro explícito e precisam de exportação assistida pela instituição.
        for offset in range(0, 10001, 500):
            query = db.table(table).select(fields).eq(owner_column, user_id)
            for column in EXPORT_ORDER.get(table, ("id",)):
                query = query.order(column)
            page = query.range(offset, offset + 499).execute().data
            rows.extend(page)
            if len(rows) > 10000:
                raise HTTPException(413, "Exportação extensa. Solicite atendimento assistido à instituição.")
            if len(page) < 500:
                break
        result["data"][table] = rows
    # Respostas do tutor pertencem ao contexto individual. Mensagens recebidas
    # em conversas humanas não entram no arquivo de outro titular.
    ai_ids = [row["id"] for row in result["data"]["conversations"] if row["kind"] == "ai"]
    ai_messages = []
    if ai_ids:
        for offset in range(0, 10001, 500):
            page = db.table("messages").select("id,conversation_id,sender_kind,body,created_at").in_(
                "conversation_id", ai_ids
            ).order("created_at").order("id").range(offset, offset + 499).execute().data
            ai_messages.extend(page)
            if len(ai_messages) > 10000:
                raise HTTPException(413, "Exportação extensa. Solicite atendimento assistido à instituição.")
            if len(page) < 500:
                break
    result["data"]["ai_messages"] = ai_messages
    return result


def provider_error(error: Exception) -> HTTPException:
    """Códigos controlados preservam o estado HTTP sem divulgar respostas do provedor."""
    messages = {
        400: "Confira o tipo de pedido, os campos e a confirmação da ação.",
        403: "Pedido próprio e encerramento de conta administrativa não podem ser processados aqui.",
        404: "Pedido não encontrado ou fora do prazo de retenção.",
        409: "Pedido já processado ou já existe outro pedido desse tipo em aberto.",
        412: "A conta possui arquivos no Storage. Faça o atendimento assistido antes de encerrar a conta.",
        503: "Não foi possível processar o pedido agora.",
    }
    return rpc_http_error(error, messages)


def register_privacy_routes(
    router: FastAPI,
    *,
    database: Callable,
    user_dependency: Callable,
    admin_dependency: Callable,
    enforce_limit: Callable,
    identity_hash: Callable[[str], str],
) -> None:
    """Recebe as dependências existentes sem importar main e criar um ciclo."""

    def find_request(db: Any, request_id: UUID, user_id: str | None = None):
        query = db.table("privacy_requests").select(REQUEST_FIELDS).eq("id", str(request_id))
        if user_id is not None:
            query = query.eq("user_id", user_id)
        rows = query.gt("expires_at", datetime.now(timezone.utc).isoformat()).limit(1).execute().data
        if not rows:
            raise HTTPException(404, "Pedido não encontrado.")
        return rows[0]

    @router.get("/privacy/requests")
    def list_own_requests(user: dict = Depends(user_dependency)):
        try:
            return database().table("privacy_requests").select(REQUEST_FIELDS).eq("user_id", user["id"]).gt(
                "expires_at", datetime.now(timezone.utc).isoformat()
            ).order("created_at", desc=True).limit(100).execute().data
        except Exception as error:
            raise provider_error(error) from error

    @router.post("/privacy/requests", status_code=201)
    def create_request(payload: PrivacyRequestCreate, request: Request, user: dict = Depends(user_dependency)):
        db = database()
        enforce_limit(db, user["id"], "privacy_request_write")
        try:
            row = db.table("privacy_requests").insert({
                "user_id": user["id"], "kind": payload.kind, "details": payload.details.strip(),
                "corrections": payload.corrections.model_dump(exclude_none=True) if payload.corrections else {},
            }).execute().data[0]
        except Exception as error:
            raise provider_error(error) from error
        request.state.audit_resource_id = row["id"]
        return row

    @router.post("/privacy/requests/{request_id}/cancel")
    def cancel_request(request_id: UUID, request: Request, user: dict = Depends(user_dependency)):
        db = database()
        enforce_limit(db, user["id"], "privacy_request_write")
        try:
            # A RPC confere posse e estado no mesmo bloqueio de linha.
            result = db.rpc("cancel_privacy_request", {"p_actor_id": user["id"], "p_request_id": str(request_id)}).execute().data
        except Exception as error:
            raise provider_error(error) from error
        request.state.audit_resource_id = str(request_id)
        return result

    @router.get("/privacy/requests/{request_id}/export")
    def export_request(request_id: UUID, request: Request, user: dict = Depends(user_dependency)):
        db = database()
        enforce_limit(db, user["id"], "privacy_data_export")
        try:
            row = find_request(db, request_id, user["id"])
            if row["kind"] != "access" or row["status"] != "completed":
                raise HTTPException(409, "A exportação depende de um pedido de acesso concluído.")
            content = personal_export(db, user["id"])
        except HTTPException:
            raise
        except Exception as error:
            raise provider_error(error) from error
        request.state.audit_resource_id = str(request_id)
        return JSONResponse(content, headers={
            "Content-Disposition": 'attachment; filename="meus-dados-aprendeia.json"', "Cache-Control": "no-store",
        })

    @router.get("/admin/privacy-requests")
    def list_admin_requests(admin: dict = Depends(admin_dependency)):
        db = database()
        enforce_limit(db, admin["id"], "privacy_admin_read")
        try:
            return db.table("privacy_requests").select(REQUEST_FIELDS).gt(
                "expires_at", datetime.now(timezone.utc).isoformat()
            ).order("created_at", desc=True).limit(100).execute().data
        except Exception as error:
            raise provider_error(error) from error

    @router.post("/admin/privacy-requests/{request_id}/resolve")
    def resolve_request(
        request_id: UUID, payload: PrivacyRequestResolve, request: Request, admin: dict = Depends(admin_dependency),
    ):
        db = database()
        enforce_limit(db, admin["id"], "privacy_request_resolve")
        try:
            row = find_request(db, request_id)
            if row["user_id"] == admin["id"]:
                raise HTTPException(403, "Outro administrador deve revisar o seu pedido.")
            expected = {
                "deletion": "EXCLUIR", "anonymization": "ANONIMIZAR",
                "opposition": "MEDIDA CONFIRMADA", "revocation": "MEDIDA CONFIRMADA",
            }.get(row["kind"])
            if payload.decision == "complete" and expected and payload.confirmation != expected:
                raise HTTPException(400, f"Confirme a ação digitando {expected}.")
            login_hash = None
            if payload.decision == "complete" and row["kind"] in ("deletion", "anonymization"):
                profiles = db.table("profiles").select("email").eq("id", row["user_id"]).limit(1).execute().data
                if not profiles:
                    raise HTTPException(409, "A conta deste pedido não está disponível.")
                login_hash = identity_hash(profiles[0]["email"])
            result = db.rpc("resolve_privacy_request", {
                "p_admin_id": admin["id"], "p_request_id": str(request_id), "p_decision": payload.decision,
                "p_response": payload.response.strip(), "p_confirmation": payload.confirmation,
                "p_identity_hash": login_hash,
            }).execute().data
        except HTTPException:
            raise
        except Exception as error:
            raise provider_error(error) from error
        request.state.audit_resource_id = str(request_id)
        return result
