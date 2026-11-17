"""Regras pequenas e testáveis usadas para proteger o login.

O banco recebe somente hashes HMAC. Assim, uma consulta administrativa ou um
vazamento da tabela de limite não revela diretamente e-mails ou endereços IP.
"""

from __future__ import annotations

import hashlib
import hmac
from dataclasses import dataclass
from typing import Any

from aprendeia.domain.errors import ServiceUnavailable

LOGIN_MAX_FAILURES = 5
# Uma escola pode compartilhar o mesmo IP entre várias turmas. Por isso, o
# limite de rede é só uma segunda barreira e fica bem acima do limite da conta.
NETWORK_MAX_FAILURES = 100
LOGIN_WINDOW_SECONDS = 15 * 60
LOGIN_LOCK_SECONDS = 5 * 60
LOGIN_MAX_LOCK_SECONDS = 24 * 60 * 60

MIN_PASSWORD_LENGTH = 6
MAX_PASSWORD_LENGTH = 128
MIN_SECRET_LENGTH = 32
HASH_KINDS = frozenset({"identity", "network", "audit_network"})
LOGIN_PROTECTION_UNAVAILABLE = "Proteção de login temporariamente indisponível."


def password_policy_error(value: str) -> str | None:
    """Explica a primeira regra de senha que ainda não foi atendida."""

    if len(value) < MIN_PASSWORD_LENGTH:
        return "A senha precisa ter pelo menos 6 caracteres."
    if len(value) > MAX_PASSWORD_LENGTH:
        return "A senha pode ter no máximo 128 caracteres."
    if not any(character.isupper() for character in value):
        return "A senha precisa ter pelo menos uma letra maiúscula."
    if not any(character.islower() for character in value):
        return "A senha precisa ter pelo menos uma letra minúscula."
    if not any(character.isdigit() for character in value):
        return "A senha precisa ter pelo menos um número."
    return None


@dataclass(frozen=True)
class RateLimitState:
    """Resposta enxuta devolvida pelas funções atômicas do PostgreSQL."""

    allowed: bool
    failed_attempts: int
    retry_after_seconds: int


def normalize_login_email(value: str) -> str:
    """Evita que maiúsculas e espaços criem contadores diferentes."""

    return value.strip().casefold()


def require_strong_secret(secret: str | None) -> str:
    """Recusa segredo ausente ou curto antes de qualquer hash ser gravado."""

    if not secret or len(secret) < MIN_SECRET_LENGTH:
        raise ServiceUnavailable("Proteção de login ainda não está configurada.")
    return secret


def keyed_hash(kind: str, value: str, secret: str) -> str:
    """Gera um identificador irreversível e separado para usuário ou rede."""

    if kind not in HASH_KINDS:
        raise ValueError("Tipo de identificador inválido.")
    message = f"aprendeia-login:{kind}:{value}".encode("utf-8")
    return hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()


def rate_limit_state(data: Any) -> RateLimitState:
    """Valida o formato da RPC antes de tomar uma decisão de autenticação."""

    row = data[0] if isinstance(data, list) and data else data
    if not isinstance(row, dict):
        raise ServiceUnavailable(LOGIN_PROTECTION_UNAVAILABLE)
    try:
        return RateLimitState(
            allowed=bool(row["allowed"]),
            failed_attempts=max(0, int(row["failed_attempts"])),
            retry_after_seconds=max(0, int(row["retry_after_seconds"])),
        )
    except (KeyError, TypeError, ValueError) as error:
        raise ServiceUnavailable(LOGIN_PROTECTION_UNAVAILABLE) from error


def reached_lock_threshold(state: RateLimitState) -> bool:
    """A tentativa que esgota o limite já recebe a resposta de bloqueio."""

    return not state.allowed or state.failed_attempts in {LOGIN_MAX_FAILURES, NETWORK_MAX_FAILURES}
