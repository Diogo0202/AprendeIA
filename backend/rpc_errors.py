"""Mensagens HTTP seguras para erros retornados por RPCs."""

from fastapi import HTTPException


_CODE_STATUS = {
    "PT400": 400,
    "PT401": 401,
    "PT403": 403,
    "PT404": 404,
    "PT409": 409,
    "PT412": 412,
    "PT422": 422,
    # Mantém o código já tratado pelo adaptador do ranking.
    "PT429": 429,
    "23505": 409,
}


def rpc_http_error(error: Exception, messages: dict[int, str]) -> HTTPException:
    """Converte apenas status permitidos pelo módulo e nunca inclui erro externo."""

    code = getattr(error, "code", None)
    status = _CODE_STATUS.get(code) if isinstance(code, str) else None
    if status not in messages:
        status = 503
    detail = messages.get(status, messages.get(503, "Serviço temporariamente indisponível."))
    return HTTPException(status, detail)
