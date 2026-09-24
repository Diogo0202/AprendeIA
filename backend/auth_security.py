"""Regras pequenas e testáveis usadas para proteger o login.

O banco recebe somente hashes HMAC. Assim, uma consulta administrativa ou um
vazamento da tabela de limite não revela diretamente e-mails ou endereços IP.
"""

from __future__ import annotations

import hashlib
import hmac
import ipaddress
import os
from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException, Request


LOGIN_MAX_FAILURES = 5
# Uma escola pode compartilhar o mesmo IP entre várias turmas. Por isso, o
# limite de rede é só uma segunda barreira e fica bem acima do limite da conta.
NETWORK_MAX_FAILURES = 100
LOGIN_WINDOW_SECONDS = 15 * 60
LOGIN_LOCK_SECONDS = 5 * 60
LOGIN_MAX_LOCK_SECONDS = 24 * 60 * 60


def password_policy_error(value: str) -> str | None:
    """Explica a primeira regra de senha que ainda não foi atendida."""

    if len(value) < 6:
        return "A senha precisa ter pelo menos 6 caracteres."
    if len(value) > 128:
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


def rate_limit_secret() -> str:
    """Busca um segredo dedicado ou reaproveita a chave privada do servidor.

    A chave do Supabase nunca entra no hash armazenado. Ela funciona apenas como
    segredo HMAC e pode ser substituída por ``RATE_LIMIT_PEPPER`` no Railway.
    """

    secret = os.getenv("RATE_LIMIT_PEPPER") or os.getenv("SUPABASE_SECRET_KEY")
    if not secret or len(secret) < 32:
        raise HTTPException(status_code=503, detail="Proteção de login ainda não está configurada.")
    return secret


def rate_limit_hash(kind: str, value: str, secret: str | None = None) -> str:
    """Gera um identificador irreversível e separado para usuário ou rede."""

    if kind not in {"identity", "network"}:
        raise ValueError("Tipo de identificador inválido.")
    key = (secret or rate_limit_secret()).encode("utf-8")
    message = f"aprendeia-login:{kind}:{value}".encode("utf-8")
    return hmac.new(key, message, hashlib.sha256).hexdigest()


def trusted_proxy_networks(value: str | None = None) -> tuple[ipaddress.IPv4Network | ipaddress.IPv6Network, ...]:
    """Lê somente redes declaradas pelo responsável pela infraestrutura."""

    configured = os.getenv("TRUSTED_PROXY_CIDRS", "") if value is None else value
    networks = []
    for item in configured.split(","):
        item = item.strip()
        if not item:
            continue
        try:
            networks.append(ipaddress.ip_network(item, strict=False))
        except ValueError as error:
            raise HTTPException(
                status_code=503,
                detail="Configuração de proxy do login é inválida.",
            ) from error
    return tuple(networks)


def client_network(request: Request, trusted_proxy_cidrs: str | None = None) -> str:
    """Obtém o IP real sem aceitar cabeçalho enviado por uma conexão comum."""

    direct_value = request.client.host if request.client else ""
    try:
        direct_ip = ipaddress.ip_address(direct_value)
    except ValueError:
        # O valor constante mantém a barreira por conta ativa e sinaliza uma
        # configuração de rede que precisa ser revisada no ambiente.
        return "unknown"

    trusted = trusted_proxy_networks(trusted_proxy_cidrs)
    comes_from_proxy = any(direct_ip in network for network in trusted)
    if not comes_from_proxy:
        return direct_ip.compressed

    # O Railway fornece X-Real-IP. Ele só é considerado quando o socket veio de
    # uma rede confiável, então um cliente comum não escolhe o próprio contador.
    real_value = request.headers.get("x-real-ip", "").strip()
    try:
        return ipaddress.ip_address(real_value).compressed
    except ValueError:
        return direct_ip.compressed


def rate_limit_state(data: Any) -> RateLimitState:
    """Valida o formato da RPC antes de tomar uma decisão de autenticação."""

    row = data[0] if isinstance(data, list) and data else data
    if not isinstance(row, dict):
        raise HTTPException(status_code=503, detail="Proteção de login temporariamente indisponível.")
    try:
        return RateLimitState(
            allowed=bool(row["allowed"]),
            failed_attempts=max(0, int(row["failed_attempts"])),
            retry_after_seconds=max(0, int(row["retry_after_seconds"])),
        )
    except (KeyError, TypeError, ValueError) as error:
        raise HTTPException(status_code=503, detail="Proteção de login temporariamente indisponível.") from error
