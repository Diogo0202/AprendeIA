"""Tradução segura dos erros de RPC do PostgREST para erros de negócio."""

from aprendeia.domain.errors import (
    ApplicationError,
    Conflict,
    Forbidden,
    InvalidInput,
    NotFound,
    PreconditionFailed,
    ServiceUnavailable,
    TooManyRequests,
    Unauthenticated,
    Unprocessable,
)

UNIQUE_VIOLATION = "23505"
STORAGE_PRECONDITION = "PT412"

_CODE_STATUS = {
    "PT400": 400,
    "PT401": 401,
    "PT403": 403,
    "PT404": 404,
    "PT409": 409,
    STORAGE_PRECONDITION: 412,
    "PT422": 422,
    # Mantém o código já tratado pelo adaptador do ranking.
    "PT429": 429,
    UNIQUE_VIOLATION: 409,
}

_STATUS_ERROR: dict[int, type[ApplicationError]] = {
    400: InvalidInput,
    401: Unauthenticated,
    403: Forbidden,
    404: NotFound,
    409: Conflict,
    412: PreconditionFailed,
    422: Unprocessable,
    429: TooManyRequests,
    503: ServiceUnavailable,
}

GENERIC_UNAVAILABLE = "Serviço temporariamente indisponível."


def error_code(error: Exception) -> str | None:
    code = getattr(error, "code", None)
    return code if isinstance(code, str) else None


def rpc_status(error: Exception, messages: dict[int, str]) -> int:
    """Só os status previstos pelo chamador sobrevivem; o resto vira indisponibilidade."""

    status = _CODE_STATUS.get(error_code(error) or "")
    return status if status in messages else 503


def rpc_error(error: Exception, messages: dict[int, str]) -> ApplicationError:
    """Converte apenas status permitidos pelo módulo e nunca inclui erro externo."""

    status = rpc_status(error, messages)
    detail = messages.get(status, messages.get(503, GENERIC_UNAVAILABLE))
    return _STATUS_ERROR[status](detail)
