"""Peças do adaptador HTTP: erros, auditoria da requisição e rede do cliente."""

import ipaddress
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from aprendeia.config import settings
from aprendeia.domain import errors

Network = ipaddress.IPv4Network | ipaddress.IPv6Network
UNKNOWN_NETWORK = "unknown"
NO_STORE = {"Cache-Control": "no-store"}

# A ordem importa só para subclasses: a mais específica vem antes da classe base.
STATUS_BY_ERROR: tuple[tuple[type[errors.ApplicationError], int], ...] = (
    (errors.InvalidInput, 400),
    (errors.Unauthenticated, 401),
    (errors.Forbidden, 403),
    (errors.NotFound, 404),
    (errors.Conflict, 409),
    (errors.PreconditionFailed, 412),
    (errors.PayloadTooLarge, 413),
    (errors.Unprocessable, 422),
    (errors.ConsentRequired, 428),
    (errors.TooManyRequests, 429),
    (errors.UpstreamFailure, 502),
    (errors.ServiceUnavailable, 503),
)


def http_status(error: errors.ApplicationError) -> int:
    """Traduz o erro de negócio para o status HTTP; desconhecido vira 500."""

    for error_type, status in STATUS_BY_ERROR:
        if isinstance(error, error_type):
            return status
    return 500


def http_headers(error: errors.ApplicationError) -> dict[str, str]:
    headers: dict[str, str] = {}
    if isinstance(error, errors.RateLimited):
        headers["Retry-After"] = str(error.retry_after_seconds)
    if error.no_store:
        headers.update(NO_STORE)
    return headers


async def application_error_response(_request: Request, error: errors.ApplicationError) -> JSONResponse:
    return JSONResponse(
        {"detail": error.detail}, status_code=http_status(error), headers=http_headers(error) or None
    )


def install_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(errors.ApplicationError, application_error_response)


class RequestAudit:
    """Guarda em request.state o que o middleware grava no evento de auditoria."""

    def __init__(self, request: Request) -> None:
        self._state = request.state

    def subject(self, subject_hash: str) -> None:
        self._state.audit_subject_hash = subject_hash

    def actor(self, actor_id: str | None, role: str | None) -> None:
        if actor_id is not None:
            self._state.audit_actor_id = actor_id
        self._state.audit_actor_role = role

    def resource(self, resource_id: str | None) -> None:
        self._state.audit_resource_id = resource_id

    def metadata(self, values: dict[str, Any]) -> None:
        self._state.audit_metadata = values


def trusted_proxy_networks(value: str | None = None) -> tuple[Network, ...]:
    """Lê somente redes declaradas pelo responsável pela infraestrutura."""

    configured = settings.trusted_proxy_cidrs() if value is None else value
    networks = []
    for item in configured.split(","):
        item = item.strip()
        if not item:
            continue
        try:
            networks.append(ipaddress.ip_network(item, strict=False))
        except ValueError as error:
            raise errors.ServiceUnavailable("Configuração de proxy do login é inválida.") from error
    return tuple(networks)


def client_network(request: Request, trusted_proxy_cidrs: str | None = None) -> str:
    """Obtém o IP real sem aceitar cabeçalho enviado por uma conexão comum."""

    direct_value = request.client.host if request.client else ""
    try:
        direct_ip = ipaddress.ip_address(direct_value)
    except ValueError:
        # O valor constante mantém a barreira por conta ativa e sinaliza uma
        # configuração de rede que precisa ser revisada no ambiente.
        return UNKNOWN_NETWORK

    trusted = trusted_proxy_networks(trusted_proxy_cidrs)
    if not any(direct_ip in network for network in trusted):
        return direct_ip.compressed

    # O Railway fornece X-Real-IP. Ele só é considerado quando o socket veio de
    # uma rede confiável, então um cliente comum não escolhe o próprio contador.
    real_value = request.headers.get("x-real-ip", "").strip()
    try:
        return ipaddress.ip_address(real_value).compressed
    except ValueError:
        return direct_ip.compressed
