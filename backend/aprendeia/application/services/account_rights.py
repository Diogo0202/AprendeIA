"""Direitos do titular, ciclo de vida da conta, ranking e resumo semanal."""

from typing import Any, Callable
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, ValidationError, field_validator

from aprendeia.application.ports.learning import TeacherNotifier
from aprendeia.application.ports.management import (
    AccountLifecycleRepository,
    LeaderboardRepository,
    PrivacyRequestRepository,
)
from aprendeia.application.ports.security import AuditRecorder, IdentityHasher, PersistenceGate, RateLimiter
from aprendeia.domain.account_lifecycle import account_status
from aprendeia.domain.errors import Conflict, Forbidden, InvalidInput, NotFound, ServiceUnavailable
from aprendeia.domain.leaderboard import validate_leaderboard_alias

Row = dict[str, Any]

REQUEST_NOT_FOUND = "Pedido não encontrado."
LEADERBOARD_UNAVAILABLE = "Ranking temporariamente indisponível."
DESTRUCTIVE_KINDS = ("deletion", "anonymization")
# Ações sensíveis exigem uma palavra digitada, não apenas um clique.
REQUIRED_CONFIRMATIONS = {
    "deletion": "EXCLUIR",
    "anonymization": "ANONIMIZAR",
    "opposition": "MEDIDA CONFIRMADA",
    "revocation": "MEDIDA CONFIRMADA",
}


class PrivacyRequestService:
    """Pedidos do titular, separados das rotas pedagógicas e sem exportar credenciais."""

    def __init__(
        self, *, requests: PrivacyRequestRepository, hasher: IdentityHasher, limiter: RateLimiter
    ) -> None:
        self._requests = requests
        self._hasher = hasher
        self._limiter = limiter

    def own_requests(self, user: Row) -> list[Row]:
        return self._requests.own_requests(user["id"])

    def create(self, user: Row, *, kind: str, details: str, corrections: Row, audit: AuditRecorder) -> Row:
        self._limiter.enforce(user["id"], "privacy_request_write")
        row = self._requests.create({
            "user_id": user["id"], "kind": kind, "details": details.strip(), "corrections": corrections,
        })
        audit.resource(row["id"])
        return row

    def cancel(self, user: Row, request_id: str, audit: AuditRecorder) -> Any:
        self._limiter.enforce(user["id"], "privacy_request_write")
        # A RPC confere posse e estado no mesmo bloqueio de linha.
        result = self._requests.cancel(user["id"], request_id)
        audit.resource(request_id)
        return result

    def export(self, user: Row, request_id: str, audit: AuditRecorder) -> Row:
        self._limiter.enforce(user["id"], "privacy_data_export")
        row = self._find(request_id, user["id"])
        if row["kind"] != "access" or row["status"] != "completed":
            raise Conflict("A exportação depende de um pedido de acesso concluído.")
        content = self._requests.personal_export(user["id"])
        audit.resource(request_id)
        return content

    def all_requests(self, admin: Row) -> list[Row]:
        self._limiter.enforce(admin["id"], "privacy_admin_read")
        return self._requests.all_requests()

    def resolve(
        self, admin: Row, request_id: str, *, decision: str, response: str, confirmation: str, audit: AuditRecorder
    ) -> Any:
        self._limiter.enforce(admin["id"], "privacy_request_resolve")
        row = self._find(request_id)
        if row["user_id"] == admin["id"]:
            raise Forbidden("Outro administrador deve revisar o seu pedido.")
        completing = decision == "complete"
        expected = REQUIRED_CONFIRMATIONS.get(row["kind"])
        if completing and expected and confirmation != expected:
            raise InvalidInput(f"Confirme a ação digitando {expected}.")
        login_hash = self._login_hash(row) if completing and row["kind"] in DESTRUCTIVE_KINDS else None
        result = self._requests.resolve(
            admin_id=admin["id"], request_id=request_id, decision=decision,
            response=response.strip(), confirmation=confirmation, identity_hash=login_hash,
        )
        audit.resource(request_id)
        return result

    def _find(self, request_id: str, user_id: str | None = None) -> Row:
        row = self._requests.find(request_id, user_id)
        if not row:
            raise NotFound(REQUEST_NOT_FOUND)
        return row

    def _login_hash(self, request: Row) -> str:
        email = self._requests.account_email(request["user_id"])
        if not email:
            raise Conflict("A conta deste pedido não está disponível.")
        return self._hasher.identity(email)


class AccountLifecycleService:
    """RF07: acesso por prazo e admissão; retenção destrutiva permanece fechada."""

    def __init__(
        self,
        *,
        lifecycle: AccountLifecycleRepository,
        limiter: RateLimiter,
        retention_enabled: Callable[[], bool],
        deliver_summary: Callable | None = None,
    ) -> None:
        self._lifecycle = lifecycle
        self._limiter = limiter
        self._retention_enabled = retention_enabled
        self._deliver_summary = deliver_summary

    @staticmethod
    def status(user: Row) -> Row:
        return {
            **account_status(user),
            "user_id": user["id"],
            "role": user.get("role"),
            "auth_created_at": user.get("auth_created_at"),
            "age_band": user.get("age_band", "unknown"),
            "admission_status": user.get("admission_status", "pending"),
            "admission_version": user.get("admission_version"),
        }

    def declare_age(self, user: Row, age_band: str) -> Any:
        self._limiter.enforce(user["id"], "account_lifecycle_write")
        return self._lifecycle.call("declare_account_age", {"p_actor": user["id"], "p_age_band": age_band})

    def request_admission(self, user: Row, values: Row) -> Any:
        self._limiter.enforce(user["id"], "account_lifecycle_write")
        return self._lifecycle.call("request_account_admission", {"p_actor": user["id"], **_rpc_params(values)})

    def admissions(self, admin: Row) -> Any:
        _require_admin(admin)
        self._limiter.enforce(admin["id"], "account_lifecycle_read")
        return self._lifecycle.call("list_account_admissions", {"p_admin": admin["id"]})

    def review_admission(self, admin: Row, request_id: str, values: Row) -> Any:
        _require_admin(admin)
        self._limiter.enforce(admin["id"], "account_lifecycle_write")
        return self._lifecycle.call(
            "review_account_admission",
            {"p_admin": admin["id"], "p_request": request_id, **_rpc_params(values)},
        )

    def preview_retention(self) -> Any:
        return self._lifecycle.call("preview_account_retention", {})

    def execute_retention(self) -> Row:
        if not self._retention_enabled():
            raise ServiceUnavailable("Execução de retenção desativada.")
        if self._deliver_summary is None:
            raise ServiceUnavailable("Hook de resumo ausente.")
        try:
            return self._lifecycle.run_retention(self._deliver_summary)
        except Exception as error:
            raise ServiceUnavailable("Retenção indisponível.") from error


def _require_admin(admin: Row) -> None:
    if admin.get("role") != "admin":
        raise Forbidden("Acesso administrativo exigido.")


def _rpc_params(values: Row) -> Row:
    return {"p_" + key: value for key, value in values.items()}


class LeaderboardPreferences(BaseModel):
    model_config = ConfigDict(extra="forbid")

    alias: str = Field(min_length=3, max_length=24)
    school_opt_in: StrictBool

    @field_validator("alias", mode="before")
    @classmethod
    def validate_alias(cls, value: Any) -> str:
        return validate_leaderboard_alias(value)


class LeaderboardRow(BaseModel):
    # O banco pode acrescentar colunas internas sem expor identidades no HTTP.
    model_config = ConfigDict(extra="ignore")

    alias: str
    avatar_key: str | None
    weekly_xp: StrictInt = Field(ge=0)
    level: StrictInt = Field(ge=1)
    rank: StrictInt = Field(ge=1)
    is_me: StrictBool


class LeaderboardClass(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: UUID
    name: str


class LeaderboardData(BaseModel):
    model_config = ConfigDict(extra="ignore")

    entries: list[LeaderboardRow] = Field(max_length=50)
    my_position: LeaderboardRow | None
    total: StrictInt = Field(ge=0)
    page: StrictInt = Field(ge=1, le=1000000)
    page_size: StrictInt = Field(ge=1, le=50)
    week_start: str
    week_end: str
    classes: list[LeaderboardClass]
    school_opt_in: StrictBool
    alias: str


class LeaderboardService:
    """Ranking semanal; os vínculos de turma são conferidos no banco."""

    def __init__(self, *, leaderboard: LeaderboardRepository, limiter: RateLimiter) -> None:
        self._leaderboard = leaderboard
        self._limiter = limiter

    def weekly(self, user: Row, *, scope: str, class_id: str | None, page: int, page_size: int) -> Row:
        self._limiter.enforce(user["id"], "leaderboard_read")
        data = self._leaderboard.weekly(
            actor_id=user["id"], scope=scope, class_id=class_id, page=page, page_size=page_size
        )
        try:
            result = LeaderboardData.model_validate(data)
        except ValidationError as error:
            raise ServiceUnavailable(LEADERBOARD_UNAVAILABLE) from error
        if not _matches_request(result, page, page_size):
            raise ServiceUnavailable(LEADERBOARD_UNAVAILABLE)
        return result.model_dump(mode="json")

    def update_preferences(self, user: Row, *, alias: str, school_opt_in: bool) -> LeaderboardPreferences:
        self._limiter.enforce(user["id"], "leaderboard_preferences")
        data = self._leaderboard.update_preferences(actor_id=user["id"], alias=alias, school_opt_in=school_opt_in)
        try:
            # O que o banco devolve passa pela mesma regra do que a pessoa enviou.
            return LeaderboardPreferences.model_validate({
                "alias": data.get("alias"), "school_opt_in": data.get("school_opt_in"),
            })
        except ValidationError as error:
            raise ServiceUnavailable(LEADERBOARD_UNAVAILABLE) from error


def _matches_request(result: LeaderboardData, page: int, page_size: int) -> bool:
    """A página devolvida precisa ser a pedida, e a posição destacada, a da própria pessoa."""

    return (
        result.page == page
        and result.page_size == page_size
        and len(result.entries) <= page_size
        and (result.my_position is None or result.my_position.is_me)
    )


class WeeklySummaryService:
    """Processa a semana anterior antes de qualquer limpeza de retenção."""

    def __init__(self, *, persistence: PersistenceGate, notifier: TeacherNotifier) -> None:
        self._persistence = persistence
        self._notifier = notifier

    def send(self, audit: AuditRecorder) -> Row:
        self._persistence.ensure_available()
        audit.actor(None, "service")
        try:
            result = self._notifier.weekly_summary()
        except ValueError as error:
            raise ServiceUnavailable("Configuração RF22 inválida no backend.") from error
        audit.metadata(result)
        return result
