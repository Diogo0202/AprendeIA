"""Apoio compartilhado pelos testes: composição com portas falsas e leitura de erros."""

from types import SimpleNamespace
from typing import Any, Callable

from fastapi import FastAPI

from aprendeia.adapters.inbound.http.dependencies import get_services
from aprendeia.adapters.inbound.http.support import RequestAudit, http_status, install_error_handlers
from aprendeia.config import settings
from aprendeia.container import Services
from aprendeia.domain.login_protection import keyed_hash, require_strong_secret


class NoLimit:
    """Limitador que registra as ações pedidas e nunca bloqueia."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []

    def enforce(self, user_id: str, action: str) -> None:
        self.calls.append((user_id, action))


def services_for(db: Any, **ports: Any) -> Services:
    """Casos de uso ligados a um banco falso; o limite de uso fica aberto por padrão."""

    ports.setdefault("limiter", NoLimit())
    return Services(lambda: db, **ports)


def audit_for(state: Any | None = None) -> RequestAudit:
    """Gravador de auditoria sobre um estado simples, como o request.state."""

    return RequestAudit(SimpleNamespace(state=state if state is not None else SimpleNamespace()))


def status_of(error: Exception) -> int:
    return http_status(error)


def rate_limit_hash(kind: str, value: str, secret: str | None = None) -> str:
    return keyed_hash(kind, value, secret or require_strong_secret(settings.rate_limit_secret()))


class CallableLimiter:
    """Encaminha a reserva para um dublê que recebe (banco, usuário, ação)."""

    def __init__(self, database: Callable[[], Any], enforce: Callable[[Any, str, str], None]) -> None:
        self._database, self._enforce = database, enforce

    def enforce(self, user_id: str, action: str) -> None:
        self._enforce(self._database(), user_id, action)


class FixedHasher:
    """Hash previsível para os testes que conferem o valor enviado à RPC."""

    def __init__(self, identity: Callable[[str], str]) -> None:
        self.identity = identity
        self.network = self.audit_network = identity


def route_app(
    router: Any,
    *,
    database: Callable[[], Any],
    enforce_limit: Callable[[Any, str, str], None] | None = None,
    identity_hash: Callable[[str], str] | None = None,
    overrides: dict[Callable, Callable] | None = None,
    **ports: Any,
) -> FastAPI:
    """Aplicação mínima com um router real e portas de saída substituídas."""

    ports["limiter"] = CallableLimiter(database, enforce_limit) if enforce_limit else NoLimit()
    if identity_hash:
        ports["hasher"] = FixedHasher(identity_hash)
    app = FastAPI()
    install_error_handlers(app)
    app.include_router(router)
    app.dependency_overrides[get_services] = lambda: Services(database, **ports)
    app.dependency_overrides.update(overrides or {})
    return app