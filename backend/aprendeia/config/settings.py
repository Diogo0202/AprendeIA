"""Único ponto de leitura das variáveis de ambiente do backend.

Os valores são lidos a cada chamada: um segredo trocado no provedor passa a
valer sem depender de estado guardado em memória.
"""

import os

DEFAULT_OPENAI_MODEL = "gpt-5-mini"


def supabase_configured() -> bool:
    """Indica se o servidor recebeu URL e chave secreta do Supabase."""

    return bool(os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_SECRET_KEY"))


def supabase_url() -> str:
    return os.environ["SUPABASE_URL"]


def supabase_secret_key() -> str:
    return os.environ["SUPABASE_SECRET_KEY"]


def supabase_publishable_key() -> str:
    return os.environ["SUPABASE_PUBLISHABLE_KEY"].strip()


def rate_limit_secret() -> str | None:
    """Segredo dedicado ou, na falta dele, a chave privada do servidor.

    A chave do Supabase nunca entra no hash armazenado. Ela funciona apenas como
    segredo HMAC e pode ser substituída por ``RATE_LIMIT_PEPPER`` no Railway.
    """

    return os.getenv("RATE_LIMIT_PEPPER") or os.getenv("SUPABASE_SECRET_KEY")


def trusted_proxy_cidrs() -> str:
    return os.getenv("TRUSTED_PROXY_CIDRS", "")


def openai_configured() -> bool:
    return bool(os.getenv("OPENAI_API_KEY"))


def openai_model() -> str:
    return os.getenv("OPENAI_MODEL", DEFAULT_OPENAI_MODEL)


def email_panel_url() -> str:
    return os.getenv("EMAIL_PANEL_URL", "")


def weekly_summary_secret() -> str | None:
    return os.getenv("WEEKLY_SUMMARY_CRON_SECRET")


def account_retention_secret() -> str | None:
    return os.getenv("ACCOUNT_RETENTION_CRON_SECRET")


def account_retention_enabled() -> bool:
    return os.getenv("ACCOUNT_RETENTION_ENABLED", "false").lower() == "true"


def log_level() -> str:
    return os.getenv("LOG_LEVEL", "INFO").upper()
