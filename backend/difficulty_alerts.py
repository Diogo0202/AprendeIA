"""Regras de alerta e mensagens sem dados pessoais ou resultados individuais."""
import hmac
from urllib.parse import urlsplit


def is_high_difficulty(accuracy_percent: float, attempts: int) -> bool:
    return attempts >= 3 and accuracy_percent < 60


def is_valid_cron_secret(provided: str | None, expected: str | None) -> bool:
    return bool(provided and expected and hmac.compare_digest(provided, expected))


def panel_link(panel_url: str) -> str:
    parts = urlsplit(panel_url)
    if (parts.scheme != "https" or not parts.hostname or parts.username
            or parts.password or parts.query or parts.fragment
            or any(c.isspace() for c in panel_url)):
        raise ValueError("Defina uma URL HTTPS pública para o painel.")
    return panel_url


def build_immediate_email(
    *, panel_url: str, teacher_name: str = "", student_name: str = "",
    subject_name: str = "", topic: str = "", accuracy_percent: float = 0,
    attempts: int = 0,
) -> tuple[str, str]:
    # Argumentos legados nunca entram no conteúdo da mensagem.
    return (
        "AprendeIA: novo alerta no painel",
        "Há um alerta pedagógico disponível na área do professor.\n\n"
        f"Consulte os detalhes após entrar na sua conta:\n{panel_link(panel_url)}\n\n"
        "Equipe AprendeIA",
    )


def build_weekly_email(
    *, panel_url: str, teacher_name: str = "", subject_name: str = "",
    alerts: list[dict[str, object]] | None = None,
) -> tuple[str, str]:
    return (
        "AprendeIA: resumo semanal no painel",
        "O resumo semanal de alertas pedagógicos está disponível na área do professor.\n\n"
        f"Consulte os detalhes após entrar na sua conta:\n{panel_link(panel_url)}\n\n"
        "Equipe AprendeIA",
    )
