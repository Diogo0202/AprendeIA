"""RF22: ledger SMTP sem promessa de recebimento.

INTEGRAÇÃO EM main.py (este arquivo não altera main.py):
1. Importe deliver_immediate e run_weekly_summary de email_delivery.
2. Na rota POST /internal/weekly-difficulty-summary mantenha Depends e o teste
   supabase_configured; substitua o restante do corpo por:
       result = run_weekly_summary(database(), panel_url=os.environ['EMAIL_PANEL_URL'])
       request.state.audit_actor_role = 'service'
       request.state.audit_metadata = result
       return result
   Converta ValueError de configuração em HTTPException(503), com texto fixo.
3. Em synchronize_difficulty_alert, após should_send_immediately, substitua o
   bloco que consulta profiles/aluno e envia SMTP por:
       deliver_immediate(db, teacher_id=teacher_id, subject_id=subject_id,
                         panel_url=os.environ['EMAIL_PANEL_URL'])
   Não grave immediate_email_sent_at: o ledger registra smtp_accepted_at.
4. Remova os helpers SMTP antigos e imports de builders sem outras referências.

EMAIL_PANEL_URL: URL HTTPS do frontend que abre login/painel, sem tokens.
SMTP_* mantém os nomes atuais. Aplique 20261103120000_notification_preferences.sql
antes de 20261104140000_email_delivery.sql. As RPCs exigem service_role.
Resumo: semana anterior [segunda 00:00, segunda 00:00), America/Sao_Paulo,
alertas ativos atualizados no intervalo. Aviso imediato: limite diário local
por professor/disciplina. Tipos têm chaves distintas.
Claim pré-SMTP expira em 5 minutos; sending expirado vira unknown. Nunca
reenvie unknown automaticamente. Reconcilie manualmente pelo id no provedor.
received exige evidência externa e não é gravado pelo retorno SMTP.
"""
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from email.utils import parseaddr
import os
import smtplib
import ssl
from typing import Any, Mapping
from zoneinfo import ZoneInfo

try:
    from .difficulty_alerts import build_immediate_email, build_weekly_email
except ImportError:  # uvicorn main:app executado em backend/
    from difficulty_alerts import build_immediate_email, build_weekly_email

LOCAL_ZONE = ZoneInfo('America/Sao_Paulo')


def local_period(kind: str, now: datetime | None = None) -> tuple[str, str]:
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        raise ValueError('O instante precisa informar o fuso horário.')
    today = now.astimezone(LOCAL_ZONE).date()
    if kind == 'weekly':
        end = today - timedelta(days=today.weekday())
        start = end - timedelta(days=7)
    elif kind == 'immediate':
        start, end = today, today + timedelta(days=1)
    else:
        raise ValueError('Tipo de e-mail inválido.')
    return start.isoformat(), end.isoformat()


def _mailbox(value: str) -> str:
    address = parseaddr(value)[1]
    if (not address or address != value or address.count('@') != 1
            or any(c.isspace() for c in value) or any(c in value for c in '<>,;')):
        raise ValueError('Endereço de e-mail inválido.')
    address.encode('ascii')
    return address


@dataclass(frozen=True)
class SMTPConfig:
    host: str
    port: int
    username: str
    password: str
    sender: str
    use_ssl: bool = True
    timeout: float = 15

    def __post_init__(self):
        if (not self.host or not self.username or not self.password
                or not 1 <= self.port <= 65535 or not 0 < self.timeout <= 30):
            raise ValueError('Configuração SMTP inválida.')
        _mailbox(self.sender)

    @classmethod
    def from_env(cls, env: Mapping[str, str] | None = None):
        env = os.environ if env is None else env
        mode = env.get('SMTP_USE_SSL', 'true').lower()
        if mode not in {'true', 'false'}:
            raise ValueError('SMTP_USE_SSL inválido.')
        return cls(env.get('SMTP_HOST', ''), int(env.get('SMTP_PORT', '465' if mode == 'true' else '587')),
                   env.get('SMTP_USERNAME', ''), env.get('SMTP_PASSWORD', ''),
                   env.get('SMTP_FROM', ''), mode == 'true')


@dataclass(frozen=True)
class SMTPResult:
    status: str
    retryable: bool = False
    error_code: str | None = None


def send_smtp(config: SMTPConfig, recipient: str, subject: str, body: str,
              delivery_id: str) -> SMTPResult:
    """Uma tentativa; perda de conexão durante DATA exige reconciliação."""
    server = None
    sending = False
    try:
        recipient = _mailbox(recipient)
        message = EmailMessage()
        message['From'], message['To'], message['Subject'] = config.sender, recipient, subject
        message['Message-ID'] = f"<{delivery_id}@{config.sender.split('@')[1]}>"
        message.set_content(body)
        context = ssl.create_default_context()
        if config.use_ssl:
            server = smtplib.SMTP_SSL(config.host, config.port, timeout=config.timeout, context=context)
        else:
            server = smtplib.SMTP(config.host, config.port, timeout=config.timeout)
            server.starttls(context=context)
        server.login(config.username, config.password)
        sending = True
        refused = server.send_message(message, from_addr=config.sender, to_addrs=[recipient])
        if refused:
            code = next(iter(refused.values()))[0]
            return SMTPResult('failed', 400 <= code < 500, 'recipient_refused')
        return SMTPResult('smtp_accepted')
    except smtplib.SMTPRecipientsRefused as error:
        retryable = bool(error.recipients) and all(400 <= v[0] < 500 for v in error.recipients.values())
        return SMTPResult('failed', retryable, 'recipient_refused')
    except smtplib.SMTPResponseException as error:
        return SMTPResult('failed', 400 <= error.smtp_code < 500, 'smtp_rejected')
    except (ValueError, UnicodeError):
        return SMTPResult('failed', False, 'invalid_message')
    except (OSError, smtplib.SMTPException):
        return SMTPResult('unknown' if sending else 'failed', not sending, 'smtp_connection')
    finally:
        if server is not None:
            # QUIT depois do 250 de DATA não desfaz a aceitação.
            try:
                server.quit()
            except (OSError, smtplib.SMTPException):
                server.close()


def _rpc(db: Any, name: str, values: dict):
    return db.rpc(name, values).execute().data


def deliver(db: Any, *, teacher_id: str, subject_id: str, kind: str,
            panel_url: str, config: SMTPConfig | None = None,
            now: datetime | None = None) -> str:
    """Falha de persistência pós-SMTP deixa sending, que expirará como unknown."""
    start, end = local_period(kind, now)
    builder = build_weekly_email if kind == 'weekly' else build_immediate_email
    subject, body = builder(panel_url=panel_url)
    config = config or SMTPConfig.from_env()
    rows = _rpc(db, 'claim_email_delivery', {
        'p_teacher_id': teacher_id, 'p_subject_id': subject_id, 'p_kind': kind,
        'p_period_start': start, 'p_period_end': end,
    })
    if not rows:
        return 'skipped'
    row = rows[0]
    if not row['claimed']:
        return row['status']
    fence = {'p_id': row['id'], 'p_token': row['claim_token']}
    if not _rpc(db, 'begin_email_delivery', fence):
        return 'unknown'
    result = send_smtp(config, row['recipient'], subject, body, row['id'])
    if not _rpc(db, 'finish_email_delivery', {
        **fence, 'p_status': result.status, 'p_retryable': result.retryable,
        'p_error_code': result.error_code,
    }):
        return 'unknown'
    return result.status


def deliver_immediate(db: Any, *, teacher_id: str, subject_id: str,
                      panel_url: str, config: SMTPConfig | None = None,
                      now: datetime | None = None) -> str:
    return deliver(db, teacher_id=teacher_id, subject_id=subject_id, kind='immediate',
                   panel_url=panel_url, config=config, now=now)


def run_weekly_summary(db: Any, *, panel_url: str, config: SMTPConfig | None = None,
                       now: datetime | None = None) -> dict:
    build_weekly_email(panel_url=panel_url)
    config = config or SMTPConfig.from_env()
    now = now or datetime.now(timezone.utc)
    start, end = local_period('weekly', now)
    counts = {status: 0 for status in ('smtp_accepted', 'received', 'failed', 'unknown', 'claimed', 'sending', 'skipped')}
    after = None
    while True:
        rows = _rpc(db, 'weekly_email_targets', {
            'p_period_start': start, 'p_period_end': end, 'p_after_subject': after,
        })
        for row in rows:
            status = deliver(db, teacher_id=row['teacher_id'], subject_id=row['subject_id'],
                             kind='weekly', panel_url=panel_url, config=config, now=now)
            counts[status] += 1
        if len(rows) < 500:
            break
        after = rows[-1]['subject_id']
    outcome = 'smtp_accepted'
    if counts['unknown']:
        outcome = 'unknown'
    elif counts['failed']:
        outcome = 'failed'
    elif counts['claimed'] or counts['sending']:
        outcome = 'processing'
    elif not sum(counts.values()) or sum(counts.values()) == counts['skipped']:
        outcome = 'no_deliveries'
    return {'status': outcome, 'period_start': start, 'period_end': end,
            'smtp_accepted': counts['smtp_accepted'], 'received': counts['received'],
            'failed_deliveries': counts['failed'], 'unknown_deliveries': counts['unknown'],
            'processing_deliveries': counts['claimed'] + counts['sending'],
            'teachers_skipped': counts['skipped']}
