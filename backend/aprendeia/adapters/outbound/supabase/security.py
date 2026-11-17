"""Adaptadores Supabase de identidade, limites de uso, auditoria e documentos legais."""

import json
import logging
from typing import Any

from supabase_auth.errors import AuthApiError

from aprendeia.adapters.outbound import turnstile
from aprendeia.adapters.outbound.supabase import client as supabase_client
from aprendeia.adapters.outbound.supabase.client import DatabaseProvider
from aprendeia.application.ports.security import (
    CredentialsRejected,
    IdentityProviderThrottled,
    IdentityProviderUnavailable,
    LoginCredentials,
    SessionTokens,
)
from aprendeia.config import settings
from aprendeia.domain.errors import ApplicationError, RateLimited, ServiceUnavailable
from aprendeia.domain.legal_documents import (
    LegalDocuments,
    LegalDocumentVersionsUnavailable,
    parse_legal_documents,
)
from aprendeia.domain.login_protection import (
    LOGIN_LOCK_SECONDS,
    LOGIN_MAX_FAILURES,
    LOGIN_MAX_LOCK_SECONDS,
    LOGIN_PROTECTION_UNAVAILABLE,
    LOGIN_WINDOW_SECONDS,
    NETWORK_MAX_FAILURES,
    RateLimitState,
    keyed_hash,
    normalize_login_email,
    rate_limit_state,
    require_strong_secret,
)
from aprendeia.domain.rate_limits import rate_limit_policy

Row = dict[str, Any]
logger = logging.getLogger("aprendeia")

LIFECYCLE_PROFILE_FIELDS = "auth_created_at,account_expires_at,age_band,admission_status,admission_version"
SESSION_PROFILE_FIELDS = (
    "id,email,role,full_name,grade,goal,registration_status,"
    "privacy_policy_version,terms_of_use_version," + LIFECYCLE_PROFILE_FIELDS
)
# Limite zero valida o contrato das áreas novas sem ler dados dos titulares.
REQUIRED_TABLES = {
    "diagnostic_sessions": "id", "access_audit_logs": "id",
    "conversations": "id", "privacy_policy_acceptances": "id,terms_version",
    "privacy_requests": "id", "account_admissions": "id",
    "email_deliveries": "id,provider_accepted_at",
    "gamification_events": "student_id", "student_achievements": "student_id",
    "leaderboard_preferences": "student_id",
    "legal_document_versions": "document_type,version,effective_at",
    "profiles": "id,auth_created_at,account_expires_at,terms_of_use_version",
}


def authenticate_with_password(credentials: LoginCredentials):
    """Usa um cliente separado para a sessão nunca trocar o papel da RPC."""

    payload: Row = {"email": credentials.email, "password": credentials.password}
    if turnstile.captcha_mode() == "supabase":
        # Este cliente precisa da chave publicável e não recebe tokens já consumidos localmente.
        client = supabase_client.public_auth_client()
        payload["options"] = {"captcha_token": credentials.captcha_token.strip()}
    else:
        client = supabase_client.database()
    return client.auth.sign_in_with_password(payload)


def _session_tokens(auth_response: Any) -> SessionTokens | None:
    session = auth_response.session
    if not session or not session.access_token or not session.refresh_token:
        return None
    auth_user = getattr(auth_response, "user", None) or getattr(session, "user", None)
    return SessionTokens(
        access_token=session.access_token,
        refresh_token=session.refresh_token,
        expires_in=session.expires_in,
        token_type=getattr(session, "token_type", "bearer"),
        user_id=str(getattr(auth_user, "id", "")),
    )


class SupabaseIdentityProvider:
    """Supabase Auth como provedor de identidade."""

    def __init__(self, db: DatabaseProvider) -> None:
        self._db = db

    def sign_in(self, credentials: LoginCredentials) -> SessionTokens | None:
        try:
            auth_response = authenticate_with_password(credentials)
        except AuthApiError as error:
            status = int(error.status or 500)
            if status == 429:
                raise IdentityProviderThrottled() from error
            if 400 <= status < 500:
                raise CredentialsRejected() from error
            raise IdentityProviderUnavailable() from error
        except Exception as error:
            raise IdentityProviderUnavailable() from error
        return _session_tokens(auth_response)

    def user_id_for_token(self, access_token: str) -> str | None:
        auth_user = self._db().auth.get_user(access_token).user
        return str(auth_user.id) if auth_user else None

    def create_confirmed_user(self, *, email: str, password: str, full_name: str) -> str | None:
        created = self._db().auth.admin.create_user({
            "email": str(email),
            "password": password,
            "email_confirm": True,
            "user_metadata": {"full_name": full_name},
            "app_metadata": {"account_origin": "admin_provisioned"},
        })
        return str(created.user.id) if created.user else None

    def delete_user(self, user_id: str) -> None:
        self._db().auth.admin.delete_user(user_id)


class SupabaseLoginThrottle:
    """Contadores de login mantidos por funções atômicas do PostgreSQL."""

    def __init__(self, db: DatabaseProvider) -> None:
        self._db = db

    def _state(self, function: str, params: Row) -> RateLimitState:
        try:
            return rate_limit_state(self._db().rpc(function, params).execute().data)
        except ApplicationError:
            raise
        except Exception as error:
            raise ServiceUnavailable(LOGIN_PROTECTION_UNAVAILABLE) from error

    def network_status(self, network_hash: str) -> RateLimitState:
        """Consulta o contador pelo backend, sem abrir a tabela ao navegador."""

        return self._state("login_rate_limit_status", {
            "p_key_hash": network_hash,
            "p_key_kind": "network",
            "p_window_seconds": LOGIN_WINDOW_SECONDS,
        })

    def reserve_attempt(self, identity_hash: str) -> RateLimitState:
        """Reserva uma das cinco tentativas antes de conferir a senha."""

        return self._state("reserve_login_attempt", {
            "p_key_hash": identity_hash,
            "p_max_attempts": LOGIN_MAX_FAILURES,
            "p_window_seconds": LOGIN_WINDOW_SECONDS,
            "p_lock_seconds": LOGIN_LOCK_SECONDS,
            "p_max_lock_seconds": LOGIN_MAX_LOCK_SECONDS,
        })

    def record_network_failure(self, network_hash: str) -> RateLimitState:
        """Incrementa o contador com bloqueio atômico dentro do PostgreSQL."""

        return self._state("record_login_failure", {
            "p_key_hash": network_hash,
            "p_key_kind": "network",
            "p_max_attempts": NETWORK_MAX_FAILURES,
            "p_window_seconds": LOGIN_WINDOW_SECONDS,
            "p_lock_seconds": LOGIN_LOCK_SECONDS,
        })

    def clear_identity_failures(self, identity_hash: str) -> None:
        """Um login correto limpa apenas as falhas daquela conta."""

        try:
            self._db().rpc(
                "clear_login_failures", {"p_key_hash": identity_hash, "p_key_kind": "identity"}
            ).execute()
        except Exception as error:
            raise ServiceUnavailable(LOGIN_PROTECTION_UNAVAILABLE) from error


def enforce_api_rate_limit(db: Any, user_id: str, action: str) -> None:
    """Reserva uma chamada antes de executar a operação protegida."""

    max_requests, window_seconds = rate_limit_policy(action)
    try:
        data = db.rpc("reserve_api_request", {
            "p_actor_id": user_id,
            "p_action": action,
            "p_max_requests": max_requests,
            "p_window_seconds": window_seconds,
        }).execute().data
        row = data[0] if isinstance(data, list) and data else data
        if not isinstance(row, dict) or not isinstance(row.get("allowed"), bool):
            raise ValueError("Resposta inválida do contador")
        if not row["allowed"]:
            raise RateLimited(
                "Limite de solicitações atingido. Aguarde antes de tentar novamente.",
                retry_after_seconds=int(row.get("retry_after_seconds", 1)),
            )
    except ApplicationError:
        raise
    except Exception as error:
        # Falhar fechado impede que uma indisponibilidade no contador libere
        # chamadas caras sem proteção.
        raise ServiceUnavailable("Proteção de uso temporariamente indisponível.") from error


class SupabaseRateLimiter:
    def __init__(self, db: DatabaseProvider) -> None:
        self._db = db

    def enforce(self, user_id: str, action: str) -> None:
        enforce_api_rate_limit(self._db(), user_id, action)


class EnvironmentIdentityHasher:
    """HMAC com o segredo do ambiente; o valor original nunca é gravado."""

    def _hash(self, kind: str, value: str) -> str:
        return keyed_hash(kind, value, require_strong_secret(settings.rate_limit_secret()))

    def identity(self, email: str) -> str:
        return self._hash("identity", normalize_login_email(email))

    def network(self, address: str) -> str:
        return self._hash("network", address)

    def audit_network(self, address: str) -> str:
        return self._hash("audit_network", address)


def persist_access_audit(record: Row) -> None:
    """Grava o evento sem transformar falha de observabilidade em indisponibilidade."""

    if not settings.supabase_configured():
        return
    try:
        supabase_client.database().table("access_audit_logs").insert(record).execute()
    except Exception:
        # O detalhe do provedor pode carregar dados internos; o request_id basta
        # para correlacionar o alerta operacional com o evento HTTP.
        logger.warning(
            json.dumps(
                {"event": "access_audit_write_failed", "request_id": record["request_id"]},
                ensure_ascii=False,
            )
        )


class SupabaseAuditTrail:
    def record(self, event: Row) -> None:
        persist_access_audit(event)


class SupabaseProfiles:
    def __init__(self, db: DatabaseProvider) -> None:
        self._db = db

    def session_profile(self, user_id: str) -> Row | None:
        rows = (
            self._db().table("profiles").select(SESSION_PROFILE_FIELDS)
            .eq("id", user_id).limit(1).execute().data
        )
        return rows[0] if rows else None

    def role_of(self, user_id: str) -> str | None:
        rows = self._db().table("profiles").select("role").eq("id", user_id).limit(1).execute().data
        return rows[0]["role"] if rows else None


def get_current_legal_documents(db: Any) -> LegalDocuments:
    """Consulta sem cache. Falhas nunca retornam versões fixas ou dados parciais."""

    try:
        data = db.rpc("get_current_legal_document_versions", {}).execute().data
        return parse_legal_documents(data)
    except Exception as error:
        raise LegalDocumentVersionsUnavailable("Versões legais vigentes indisponíveis.") from error


class SupabaseLegalDocuments:
    def __init__(self, db: DatabaseProvider) -> None:
        self._db = db

    def current(self) -> LegalDocuments:
        return get_current_legal_documents(self._db())

    def record_acceptance(self, user_id: str, policy_version: str, terms_version: str) -> Any:
        return self._db().rpc("record_privacy_policy_acceptance", {
            "target_user_id": user_id,
            "target_policy_version": policy_version,
            "target_terms_version": terms_version,
        }).execute().data


class SupabaseReadinessProbe:
    def __init__(self, db: DatabaseProvider) -> None:
        self._db = db

    def check_schema(self) -> None:
        db = self._db()
        for table, columns in REQUIRED_TABLES.items():
            db.table(table).select(columns).limit(0).execute()


class TurnstileCaptcha:
    """Cloudflare Turnstile validado no servidor."""

    def verify(self, token: str | None, remote_ip: str | None, *, expected_action: str) -> None:
        turnstile.verify_turnstile(token, remote_ip, expected_action=expected_action)

    def required(self) -> bool:
        return turnstile.captcha_required()

    def configured(self) -> bool:
        return turnstile.captcha_configured()
