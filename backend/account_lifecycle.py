"""RF07: acesso por prazo e admissão; retenção destrutiva permanece fechada."""

import hmac
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Literal
from uuid import UUID

from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator

ADMISSION_VERSION = "1"
PROFILE_FIELDS = "auth_created_at,account_expires_at,age_band,admission_status,admission_version"


def run_account_retention(db: Any, *, deliver_summary: Callable, limit: int = 25) -> dict:
    """API-first, com lease e recibo persistido antes de qualquer remoção.

    deliver_summary(user_id, summary, idempotency_key) deve retornar True somente
    após o envio confirmado. Resultado ambíguo exige reconciliação pelo remetente.
    """
    if not 1 <= limit <= 100:
        raise ValueError("Limite de lote inválido")
    candidates = db.rpc("account_retention_candidates", {"p_limit": limit}).execute().data
    if not isinstance(candidates, list):
        raise RuntimeError("Lista de retenção inválida")
    completed = failed = skipped = 0
    for user_id in candidates:
        token = None
        try:
            job = db.rpc("claim_account_retention", {"p_user": user_id}).execute().data
            if not job:
                skipped += 1
                continue
            token = job["token"]
            if not job["summary_sent"]:
                if deliver_summary(user_id, job["summary"], job["id"]) is not True:
                    raise RuntimeError("Resumo sem confirmação")
                db.rpc("confirm_account_retention_summary", {
                    "p_job": job["id"], "p_token": token,
                }).execute()
            manifest = db.rpc("prepare_account_retention", {
                "p_job": job["id"], "p_token": token,
            }).execute().data
            if not isinstance(manifest, list):
                raise RuntimeError("Manifesto Storage inválido")
            # A RPC recusou dependências compartilhadas antes de fornecer paths.
            for item in manifest:
                if not item.get("bucket_id") or not item.get("name"):
                    raise RuntimeError("Objeto Storage inválido")
                db.storage.from_(item["bucket_id"]).remove([item["name"]])
            db.rpc("authorize_account_retention_delete", {
                "p_job": job["id"], "p_token": token,
            }).execute()
            db.auth.admin.delete_user(user_id, should_soft_delete=False)
            # Confirma o commit Auth; uma resposta HTTP incerta não vira sucesso.
            result = db.rpc("account_retention_result", {"p_job": job["id"]}).execute().data
            if result != "completed":
                raise RuntimeError("Exclusão Auth sem confirmação")
            completed += 1
        except Exception:
            failed += 1
            # Não divulgamos PII, tokens ou erros do provedor no endpoint interno.
            # O lease permite retomar a mesma chave de resumo após uma falha.
    return {"completed": completed, "failed": failed, "skipped": skipped}


def account_status(profile: dict[str, Any], *, now: datetime | None = None) -> dict:
    if profile.get("role") == "admin":
        return {"allowed": True, "reason": "admin_exempt", "expires_at": None}
    try:
        created = datetime.fromisoformat(profile["auth_created_at"].replace("Z", "+00:00"))
        if created.tzinfo is None or profile.get("role") not in {"student", "teacher"}:
            raise ValueError("Invalid lifecycle identity")
        if created > (now or datetime.now(timezone.utc)):
            raise ValueError("Future Auth timestamp")
        expires = created + timedelta(hours=168)
    except (KeyError, ValueError, TypeError, AttributeError, OverflowError):
        return {"allowed": False, "reason": "lifecycle_unavailable", "expires_at": None}
    reason = "active"
    if (now or datetime.now(timezone.utc)) >= expires:
        reason = "account_expired"
    elif profile.get("age_band") not in {"adult", "minor"}:
        reason = "age_declaration_required"
    elif profile["age_band"] == "minor" and not (
        profile.get("admission_status") == "approved" and profile.get("admission_version") == ADMISSION_VERSION
    ):
        reason = "institutional_admission_required"
    return {"allowed": reason == "active", "reason": reason, "expires_at": expires.isoformat()}


def check_access(profile: dict[str, Any]) -> dict[str, Any]:
    status = account_status(profile)
    if not status["allowed"]:
        raise HTTPException(503 if status["reason"] == "lifecycle_unavailable" else 403, status)
    return profile


class AgeDeclaration(BaseModel):
    model_config = ConfigDict(extra="forbid")
    age_band: Literal["adult", "minor", "unknown"]


class AdmissionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    responsible_name: str = Field(min_length=2, max_length=120)
    responsible_contact: str = Field(min_length=3, max_length=200)
    institutional_reference: str = Field(min_length=2, max_length=200)
    version: Literal["1"]

    @field_validator("responsible_name", "responsible_contact", "institutional_reference")
    @classmethod
    def clean(cls, value: str) -> str:
        if any(ord(char) < 32 for char in value):
            raise ValueError("Caracteres de controle não são aceitos.")
        return value


class AdmissionReview(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    decision: Literal["approved", "rejected"]
    version: Literal["1"]
    note: str = Field(min_length=2, max_length=500)


def register_lifecycle_routes(
    app: FastAPI, *, database: Callable, user_dependency: Callable,
    admin_dependency: Callable, enforce_limit: Callable,
    retention_secret: Callable[[], str | None] = lambda: None,
    retention_enabled: Callable[[], bool] = lambda: False,
    deliver_summary: Callable | None = None,
) -> None:
    """user_dependency autentica sem exigir admissão, prazo ou aceite de política."""

    def rpc(name: str, params: dict):
        try:
            return database().rpc(name, params).execute().data
        except Exception as error:
            code = str(getattr(error, "code", ""))
            status = {"PT403": 403, "PT409": 409, "PT400": 400, "PT404": 404}.get(code, 503)
            raise HTTPException(status, "Operação de ciclo de conta indisponível ou recusada.") from error

    def internal(x_account_retention_secret: str | None = Header(default=None)):
        expected = retention_secret()
        if not expected:
            raise HTTPException(503, "Segredo de retenção ausente.")
        if not x_account_retention_secret or not hmac.compare_digest(
            x_account_retention_secret.encode(), expected.encode()
        ):
            raise HTTPException(403, "Credencial de retenção inválida.")

    @app.get("/account/status")
    def status(user: dict = Depends(user_dependency)):
        return {**account_status(user), "user_id": user["id"], "role": user.get("role"),
                "auth_created_at": user.get("auth_created_at"), "age_band": user.get("age_band", "unknown"),
                "admission_status": user.get("admission_status", "pending"),
                "admission_version": user.get("admission_version")}

    @app.put("/account/age-band")
    def declare(payload: AgeDeclaration, user: dict = Depends(user_dependency)):
        enforce_limit(database(), user["id"], "account_lifecycle_write")
        return rpc("declare_account_age", {"p_actor": user["id"], "p_age_band": payload.age_band})

    @app.post("/account/admission", status_code=201)
    def admission(payload: AdmissionRequest, user: dict = Depends(user_dependency)):
        enforce_limit(database(), user["id"], "account_lifecycle_write")
        return rpc("request_account_admission", {"p_actor": user["id"], **{
            "p_" + key: value for key, value in payload.model_dump().items()
        }})

    @app.get("/admin/account-admissions")
    def admissions(admin: dict = Depends(admin_dependency)):
        if admin.get("role") != "admin":
            raise HTTPException(403, "Acesso administrativo exigido.")
        enforce_limit(database(), admin["id"], "account_lifecycle_read")
        return rpc("list_account_admissions", {"p_admin": admin["id"]})

    @app.post("/admin/account-admissions/{request_id}/review")
    def review(request_id: UUID, payload: AdmissionReview, admin: dict = Depends(admin_dependency)):
        if admin.get("role") != "admin":
            raise HTTPException(403, "Acesso administrativo exigido.")
        enforce_limit(database(), admin["id"], "account_lifecycle_write")
        return rpc("review_account_admission", {"p_admin": admin["id"], "p_request": str(request_id),
                   **{"p_" + key: value for key, value in payload.model_dump().items()}})

    @app.post("/internal/account-retention/preview", dependencies=[Depends(internal)])
    def preview():
        return rpc("preview_account_retention", {})

    @app.post("/internal/account-retention/execute", dependencies=[Depends(internal)])
    def execute():
        if not retention_enabled():
            raise HTTPException(503, "Execução de retenção desativada.")
        if deliver_summary is None:
            raise HTTPException(503, "Hook de resumo ausente.")
        try:
            return run_account_retention(database(), deliver_summary=deliver_summary)
        except Exception as error:
            raise HTTPException(503, "Retenção indisponível.") from error
