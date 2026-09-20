"""Validação server-side do Cloudflare Turnstile.

A chave secreta fica no backend. Em desenvolvimento, a ausência da chave
mantém o formulário utilizável; em produção basta configurar a variável para
tornar o token obrigatório.
"""

from __future__ import annotations

import json
import os
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


class CaptchaError(ValueError):
    """Erro seguro que pode ser traduzido para uma resposta HTTP curta."""


def captcha_configured() -> bool:
    return bool(os.getenv("TURNSTILE_SECRET_KEY", "").strip())


def verify_turnstile(token: str | None, remote_ip: str | None = None) -> None:
    """Valida o token uma vez e falha fechado quando o serviço está configurado."""

    secret = os.getenv("TURNSTILE_SECRET_KEY", "").strip()
    if not secret:
        return
    if not token or not token.strip():
        raise CaptchaError("Confirme que você não é um robô.")

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
            result = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
        raise CaptchaError("A verificação de segurança está indisponível. Tente novamente.") from error
    if result.get("success") is not True:
        raise CaptchaError("A verificação de segurança expirou. Tente novamente.")
