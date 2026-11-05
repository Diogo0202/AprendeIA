"""Validação server-side do Cloudflare Turnstile.

A chave secreta fica no backend. Só o desenvolvimento sem configuração
permite ignorar o desafio. O consumidor de Siteverify deve receber um token
próprio: nunca encaminhe esse mesmo token ao CAPTCHA do Supabase Auth.
"""

from __future__ import annotations

import json
import os
import re
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
UNAVAILABLE = "A verificação de segurança está indisponível. Tente novamente mais tarde."
INVALID = "A verificação de segurança expirou. Tente novamente."
CONFIG_KEYS = ("TURNSTILE_SECRET_KEY", "TURNSTILE_SITE_KEY", "TURNSTILE_ALLOWED_HOSTNAMES")


def captcha_mode() -> str:
    """Produção exige escolha explícita do único consumidor do token."""
    mode = os.getenv("TURNSTILE_VERIFICATION_MODE", "").strip().lower()
    if not mode and not captcha_required():
        return "backend"
    if mode not in {"backend", "supabase"}:
        raise CaptchaUnavailable(UNAVAILABLE)
    return mode


def _hostname(value: str) -> str:
    value = value.strip().lower().rstrip(".")
    if len(value) > 253 or not all(
        re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label)
        for label in value.split(".")
    ):
        raise ValueError("invalid hostname")
    return value


def _configuration() -> tuple[str, str, set[str]]:
    secret, site_key, raw_hosts = (os.getenv(key, "").strip() for key in CONFIG_KEYS)
    hosts = {_hostname(host) for host in raw_hosts.split(",")}
    if not secret or not site_key:
        raise ValueError("incomplete configuration")
    if captcha_mode() == "supabase" and not os.getenv("SUPABASE_PUBLISHABLE_KEY", "").strip():
        raise ValueError("missing public auth client key")
    return secret, site_key, hosts


class CaptchaError(ValueError):
    """Erro seguro que pode ser traduzido para uma resposta HTTP curta."""


class CaptchaUnavailable(CaptchaError):
    """Produção sem chave: é falha de configuração, não erro de quem tenta entrar."""


def captcha_configured() -> bool:
    try:
        _configuration()
    except (ValueError, CaptchaUnavailable):
        return False
    return True


def captcha_required() -> bool:
    """O Railway define o nome do ambiente; a variável explícita cobre outros hosts."""

    if os.getenv("TURNSTILE_REQUIRED", "").strip().lower() in {"1", "true", "yes"}:
        return True
    return any(
        os.getenv(key, "").strip().lower() in {"production", "prod"}
        for key in ("RAILWAY_ENVIRONMENT_NAME", "RAILWAY_ENVIRONMENT", "APP_ENV", "ENVIRONMENT", "NODE_ENV", "ENV")
    )


def verify_turnstile(
    token: str | None, remote_ip: str | None = None, *, expected_action: str = "login"
) -> None:
    """Valida uma vez; a rota escolhe a action, nunca o corpo da requisição.

    No modo supabase, esta função só confere configuração e presença do token;
    Auth faz Siteverify. A checagem local de hostname/action só ocorre em backend.
    """

    if not captcha_required() and not any(
        os.getenv(key, "").strip() for key in (*CONFIG_KEYS, "TURNSTILE_VERIFICATION_MODE")
    ):
        return
    try:
        secret, _, hosts = _configuration()
    except ValueError:
        raise CaptchaUnavailable(UNAVAILABLE) from None
    if expected_action not in {"login", "signup", "recovery"}:
        raise CaptchaUnavailable(UNAVAILABLE)
    if not isinstance(token, str) or not token.strip():
        raise CaptchaError("Confirme que você não é um robô.")
    if len(token) > 2048:
        raise CaptchaError(INVALID)
    if captcha_mode() == "supabase":
        return

    payload = {"secret": secret, "response": token.strip()}
    if remote_ip:
        payload["remoteip"] = remote_ip
    request = Request(
        TURNSTILE_VERIFY_URL,
        data=urlencode(payload).encode("utf-8"),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        # A URL é uma constante HTTPS do provedor, nunca vem do usuário.
        with urlopen(request, timeout=5) as response:  # nosec B310
            result = json.loads(response.read(65536).decode("utf-8"))
    except (HTTPError, URLError, OSError, ValueError) as error:
        raise CaptchaUnavailable(UNAVAILABLE) from error
    if not isinstance(result, dict) or not isinstance(result.get("success"), bool):
        raise CaptchaUnavailable(UNAVAILABLE)
    if result.get("success") is not True:
        codes = result.get("error-codes")
        if isinstance(codes, list) and any(
            code in codes for code in ("missing-input-secret", "invalid-input-secret", "internal-error")
        ):
            raise CaptchaUnavailable(UNAVAILABLE)
        raise CaptchaError(INVALID)
    try:
        hostname = _hostname(result.get("hostname", ""))
    except (ValueError, AttributeError):
        raise CaptchaError(INVALID) from None
    if hostname not in hosts or result.get("action") != expected_action:
        raise CaptchaError(INVALID)
