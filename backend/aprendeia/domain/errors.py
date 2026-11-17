"""Erros de negócio, sem conhecimento de HTTP, banco ou provedores.

Casos de uso e adaptadores de saída levantam estas exceções. Só o adaptador
HTTP decide qual status e quais cabeçalhos cada uma recebe.
"""

from typing import Any


class ApplicationError(Exception):
    """Falha esperada, com um detalhe seguro para devolver a quem chamou."""

    def __init__(self, detail: Any, *, no_store: bool = False) -> None:
        super().__init__(detail)
        self.detail = detail
        # Respostas de autenticação nunca podem ficar em cache intermediário.
        self.no_store = no_store


class InvalidInput(ApplicationError):
    """O pedido é compreensível, mas um valor não atende à regra."""


class Unauthenticated(ApplicationError):
    """Sessão ausente, expirada ou credencial incorreta."""


class Forbidden(ApplicationError):
    """A pessoa está identificada, mas não pode executar a operação."""


class NotFound(ApplicationError):
    """O recurso não existe ou não pertence a quem pediu."""


class Conflict(ApplicationError):
    """O estado atual impede a operação."""


class PreconditionFailed(ApplicationError):
    """Uma condição externa precisa ser resolvida antes de repetir o pedido."""


class PayloadTooLarge(ApplicationError):
    """O resultado ultrapassa o teto seguro de uma única resposta."""


class Unprocessable(ApplicationError):
    """Os campos são válidos isoladamente, mas a combinação não é aceita."""


class ConsentRequired(ApplicationError):
    """Falta aceitar os documentos legais vigentes."""


class TooManyRequests(ApplicationError):
    """Limite de uso atingido, sem um prazo conhecido para tentar de novo."""


class RateLimited(TooManyRequests):
    """Limite de uso atingido; informa quando tentar de novo."""

    def __init__(self, detail: Any, *, retry_after_seconds: int) -> None:
        super().__init__(detail, no_store=True)
        self.retry_after_seconds = max(1, int(retry_after_seconds))


class UpstreamFailure(ApplicationError):
    """Um provedor externo respondeu de forma inválida ou não respondeu."""


class ServiceUnavailable(ApplicationError):
    """Configuração ou dependência essencial indisponível no momento."""
