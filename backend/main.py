"""API principal do AprendeIA.

O backend concentra operações que exigem confiança, como validar sessões,
administrar usuários, chamar a OpenAI e gravar resultados com privilégios de
servidor. O frontend usa apenas a chave publicável do Supabase.
"""

import json
import logging
import os
import re
import smtplib
import ssl
import time
import uuid
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from email.message import EmailMessage
from typing import Annotated, Any, Literal

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel, Field, field_validator, model_validator
from starlette.concurrency import run_in_threadpool
from supabase import Client, create_client
from supabase.lib.client_options import SyncClientOptions
from supabase_auth.errors import AuthApiError

from access_audit import audit_action_for, build_access_audit_record
from ai_security import guard_ai_text, protected_ai_input
from auth_security import (
    LOGIN_LOCK_SECONDS,
    LOGIN_MAX_LOCK_SECONDS,
    LOGIN_MAX_FAILURES,
    LOGIN_WINDOW_SECONDS,
    NETWORK_MAX_FAILURES,
    RateLimitState,
    client_network,
    normalize_login_email,
    password_policy_error,
    rate_limit_hash,
    rate_limit_state,
)
from captcha import CaptchaError, CaptchaUnavailable, captcha_configured, captcha_mode, captcha_required, verify_turnstile
from communication_rules import can_start_direct_conversation, validate_message_body
from deployment_config import frontend_origin
from difficulty_alerts import (
    build_immediate_email,
    build_weekly_email,
    is_high_difficulty,
    is_valid_cron_secret,
)
from gamification import (
    build_gamification_summary,
    can_feature_achievement,
)
from learning_engine import (
    build_study_recommendations,
    build_topic_mastery,
    infer_subject_category,
    subject_code,
    subject_difficulty,
)
from teacher_dashboard import (
    build_difficulty_trend,
    build_report_csv,
    difficulty_label,
    parse_content_import,
)
from admin_panel import register_admin_panel_routes
from notification_preferences import email_enabled, register_notification_routes
from privacy_requests import register_privacy_routes
from account_lifecycle import PROFILE_FIELDS, check_access, register_lifecycle_routes
from leaderboard import persistent_summary, register_leaderboard_routes

# Carrega somente variáveis locais; o arquivo .env fica fora do Git.
load_dotenv()

# A URL permitida é configurável para evitar CORS aberto em produção.
# A API não publica Swagger em produção: até a documentação revela nomes de
# rotas e modelos que não precisam ficar disponíveis para qualquer visitante.
@asynccontextmanager
async def lifespan(_app: FastAPI):
    if captcha_required() and not captcha_configured():
        raise RuntimeError("Verificação de segurança não configurada para produção.")
    yield


app = FastAPI(title="aprendeIA API", version="0.3.0", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_origin(os.environ)],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
)

logger = logging.getLogger("aprendeia")
logger.setLevel(os.getenv("LOG_LEVEL", "INFO").upper())


def persist_access_audit(record: dict[str, Any]) -> None:
    """Grava o evento sem transformar falha de observabilidade em indisponibilidade."""

    if not supabase_configured():
        return
    try:
        database().table("access_audit_logs").insert(record).execute()
    except Exception:
        # O detalhe do provedor pode carregar dados internos; o request_id basta
        # para correlacionar o alerta operacional com o evento HTTP.
        logger.warning(
            json.dumps(
                {"event": "access_audit_write_failed", "request_id": record["request_id"]},
                ensure_ascii=False,
            )
        )


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    """Aplica cabeçalhos e audita cada funcionalidade protegida."""

    started_at = time.perf_counter()
    supplied_request_id = request.headers.get("X-Request-ID", "")
    try:
        request_id = str(uuid.UUID(supplied_request_id))
    except ValueError:
        request_id = str(uuid.uuid4())
    request.state.request_id = request_id
    response: Response | None = None
    status_code = 500
    try:
        response = await call_next(request)
        status_code = response.status_code
        response.headers.setdefault("Cache-Control", "no-store")
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        response.headers.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        response.headers.setdefault("X-Request-ID", request_id)
    finally:
        duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
        route = request.scope.get("route")
        # Sem uma rota reconhecida, não usamos a URL crua porque ela pode conter
        # UUID ou outro identificador fornecido pelo usuário.
        route_path = getattr(route, "path", "")
        logger.info(
            json.dumps(
                {
                    "event": "http_request",
                    "request_id": request_id,
                    "method": request.method,
                    "path": route_path or "unmatched",
                    "status": status_code,
                    "duration_ms": duration_ms,
                },
                ensure_ascii=False,
            )
        )
        action = audit_action_for(request.method, route_path, status_code)
        if action:
            network_hash = None
            try:
                network_hash = rate_limit_hash("audit_network", client_network(request))
            except Exception:
                # A requisição continua; o evento ainda terá usuário, ação e
                # request_id mesmo quando o pepper não estiver configurado.
                network_hash = None
            record = build_access_audit_record(
                actor_id=getattr(request.state, "audit_actor_id", None),
                actor_role=getattr(request.state, "audit_actor_role", None),
                subject_hash=getattr(request.state, "audit_subject_hash", None),
                action=action,
                method=request.method,
                route=route_path,
                status_code=status_code,
                request_id=request_id,
                network_hash=network_hash,
                resource_id=getattr(request.state, "audit_resource_id", None),
                metadata=getattr(request.state, "audit_metadata", {}),
            )
            await run_in_threadpool(persist_access_audit, record)

    if response is None:
        raise RuntimeError("A resposta HTTP não foi criada.")
    return response

# O schema estrito garante que a IA sempre devolva quatro alternativas e os
# campos necessários para corrigir e explicar a resposta.
QUESTION_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "question": {"type": "string"},
        "options": {"type": "array", "items": {"type": "string"}, "minItems": 4, "maxItems": 4},
        "correct_index": {"type": "integer", "minimum": 0, "maximum": 3},
        "explanation": {"type": "string"},
        "skill": {"type": "string"},
    },
    "required": ["question", "options", "correct_index", "explanation", "skill"],
}

# A recomendação estruturada reduz respostas vagas e mantém o retorno previsível
# para os cartões do painel do professor.
RECOMMENDATION_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "diagnosis": {"type": "string"},
        "objective": {"type": "string"},
        "actions": {"type": "array", "items": {"type": "string"}, "minItems": 3, "maxItems": 5},
        "content_suggestion": {"type": "string"},
    },
    "required": ["diagnosis", "objective", "actions", "content_suggestion"],
}

# A conversa usa saída estruturada para não aceitar comandos ou marcação ativa
# devolvida pelo modelo. O React renderiza esses campos apenas como texto.
AI_ASSISTANT_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "answer": {"type": "string"},
        "suggested_questions": {
            "type": "array",
            "items": {"type": "string"},
            "minItems": 0,
            "maxItems": 3,
        },
    },
    "required": ["answer", "suggested_questions"],
}

# As questões iniciais mantêm o protótipo utilizável sem banco ou OpenAI.
SEED_QUESTIONS = [
    {"id": "seed-fracoes-1", "subject": "Matemática", "topic": "Frações", "difficulty": "basic", "question": "Qual fração representa a metade de uma pizza?", "options": ["1/2", "1/3", "2/3", "3/4"], "correct_index": 0, "explanation": "Uma metade significa dividir o todo em duas partes iguais e considerar uma delas: 1/2."},
    {"id": "seed-portugues-1", "subject": "Português", "topic": "Interpretação de texto", "difficulty": "basic", "question": "Em um texto, a ideia principal é:", "options": ["o assunto mais importante", "uma palavra difícil", "o nome do autor", "a última frase"], "correct_index": 0, "explanation": "A ideia principal é a mensagem mais importante que o texto comunica."},
]
# Estes objetos existem apenas no modo demonstrativo. Quando o Supabase está
# configurado, a fonte de verdade passa a ser o PostgreSQL.
question_bank = list(SEED_QUESTIONS)
performance = defaultdict(lambda: defaultdict(lambda: {"attempts": 0, "correct": 0, "difficulty": "basic"}))


class LoginRequest(BaseModel):
    """Credenciais curtas aceitas somente pelo endpoint protegido de login."""

    email: str = Field(min_length=5, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=1, max_length=128)
    captcha_token: str | None = Field(default=None, max_length=4096)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        """Garante que o mesmo e-mail sempre use o mesmo contador."""

        return normalize_login_email(value)


class UserCreate(BaseModel):
    """Dados que somente uma administradora pode usar para criar uma conta."""

    name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=5, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=6, max_length=128)
    role: str
    subject: str | None = Field(default=None, max_length=60)

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        """Mantém a criação administrativa alinhada ao cadastro público."""

        error = password_policy_error(value)
        if error:
            raise ValueError(error)
        return value


    @field_validator("subject")
    @classmethod
    def validate_subject(cls, value: str | None) -> str | None:
        """Limpa a matéria antes de procurar o registro oficial no banco."""

        return sanitize_prompt_value(value, max_length=60) if value else None

    @model_validator(mode="after")
    def validate_teacher_subject(self):
        """Evita criar professor sem escopo pedagógico definido."""

        if self.role == "teacher" and not self.subject:
            raise ValueError("Professor precisa receber uma disciplina.")
        if self.role == "student" and self.subject:
            raise ValueError("Estudante não recebe disciplina no cadastro.")
        return self


class PrivacyPolicyAccept(BaseModel):
    """A pessoa declara as versões que leu; o backend define a hora do aceite."""

    policy_version: Literal["1.7"]
    terms_version: Literal["1.0"]


class TeacherApproval(BaseModel):
    """Disciplina confirmada pela administradora ao liberar uma solicitação."""

    subject: str = Field(min_length=2, max_length=60)

    @field_validator("subject")
    @classmethod
    def validate_subject(cls, value: str) -> str:
        """Usa o mesmo cuidado dos outros textos antes de consultar o banco."""

        return sanitize_prompt_value(value, max_length=60)


class QuestionRequest(BaseModel):
    """Parâmetros pedagógicos enviados ao gerador de questões."""

    subject: str = Field(min_length=2, max_length=60)
    topic: str = Field(default="conteúdo da disciplina", max_length=100)
    difficulty: str = Field(default="basic", pattern="^(basic|intermediate|advanced)$")

    @field_validator("subject", "topic")
    @classmethod
    def validate_prompt_value(cls, value: str) -> str:
        """Normaliza texto e bloqueia caracteres que podem quebrar o prompt."""

        return guard_ai_text(sanitize_prompt_value(value), max_length=100)


class AnswerRequest(BaseModel):
    """Resposta do estudante e tempo opcional gasto na atividade."""

    selected_index: int = Field(ge=0, le=3)
    response_time_seconds: int = Field(default=0, ge=0, le=7200)


class StudentProfilePersonalization(BaseModel):
    """Escolhas visuais fechadas para não aceitar CSS ou valores arbitrários."""

    avatar_key: Literal["orbit", "spark", "books", "prism", "trail"]
    # A existência e o desbloqueio são conferidos no catálogo persistido.
    featured_badge_id: str | None = Field(default=None, max_length=64, pattern=r"^[a-z][a-z0-9_]*$")
    accent_theme: Literal["wine", "ocean", "forest", "amber"]


class TeacherClassCreate(BaseModel):
    """Informações curtas para criar uma turma da disciplina do professor."""

    name: str = Field(min_length=2, max_length=80)
    school_year: str = Field(min_length=2, max_length=30)

    @field_validator("name", "school_year")
    @classmethod
    def clean_class_text(cls, value: str) -> str:
        return sanitize_prompt_value(value, max_length=80)


class ClassStudentCreate(BaseModel):
    """O e-mail evita que o professor precise conhecer IDs internos."""

    student_email: str = Field(min_length=5, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class TeacherContentCreate(BaseModel):
    """Conteúdo criado pelo professor somente para a própria disciplina."""

    title: str = Field(min_length=2, max_length=120)
    description: str = Field(default="", max_length=1000)
    content_type: str = Field(default="lesson", pattern="^(lesson|exercise|video|link)$")
    source_url: str = Field(default="", max_length=500)

    @field_validator("title")
    @classmethod
    def clean_content_title(cls, value: str) -> str:
        return sanitize_prompt_value(value, max_length=120)

    @field_validator("source_url")
    @classmethod
    def validate_source_url(cls, value: str) -> str:
        normalized = value.strip()
        if normalized and not normalized.startswith(("https://", "http://")):
            raise ValueError("O link precisa usar HTTP ou HTTPS.")
        return normalized


class TeacherContentImport(BaseModel):
    """Arquivo já lido pelo navegador, com tamanho limitado pelo backend."""

    format: str = Field(pattern="^(json|csv)$")
    content: str = Field(min_length=2, max_length=100_000)


class RecommendationRequest(BaseModel):
    """Escolhe a turma e, opcionalmente, um estudante dentro dela."""

    class_id: str = Field(min_length=36, max_length=36)
    student_id: str | None = Field(default=None, min_length=36, max_length=36)


class DirectConversationCreate(BaseModel):
    """Pessoa escolhida para uma conversa humana autorizada."""

    participant_id: uuid.UUID


class CommunicationMessageCreate(BaseModel):
    """Mensagem humana que nunca é encaminhada para a IA."""

    body: str = Field(min_length=1, max_length=2000)

    @field_validator("body")
    @classmethod
    def clean_body(cls, value: str) -> str:
        return validate_message_body(value)


class AICommunicationRequest(BaseModel):
    """Dúvida individual enviada ao assistente educacional."""

    body: str = Field(min_length=1, max_length=2000)
    conversation_id: uuid.UUID | None = None

    @field_validator("body")
    @classmethod
    def protect_prompt(cls, value: str) -> str:
        return guard_ai_text(value, max_length=2000)


class LessonProgressUpdate(BaseModel):
    """Atualização pequena que o estudante envia enquanto avança na aula."""

    completed: bool = False
    time_seconds: int = Field(default=0, ge=0, le=28_800)


class MandatoryExercisesUpdate(BaseModel):
    """Lista ordenada de questões que precisam ser respondidas na aula."""

    question_ids: list[uuid.UUID] = Field(default_factory=list, max_length=12)

    @field_validator("question_ids")
    @classmethod
    def reject_duplicate_questions(cls, values: list[uuid.UUID]) -> list[uuid.UUID]:
        if len(set(values)) != len(values):
            raise ValueError("Cada exercício obrigatório deve aparecer apenas uma vez.")
        return values


class DiagnosticAnswerRequest(AnswerRequest):
    """Resposta diagnóstica com o mesmo limite usado na prática comum."""


class TeacherQuestionReview(BaseModel):
    """Campos que o professor pode revisar antes de publicar uma questão."""

    topic: str = Field(min_length=2, max_length=100)
    difficulty: Literal["basic", "intermediate", "advanced"]
    question: str = Field(min_length=8, max_length=1000)
    options: list[str] = Field(min_length=4, max_length=4)
    correct_index: int = Field(ge=0, le=3)
    explanation: str = Field(min_length=8, max_length=2000)
    review_notes: str = Field(default="", max_length=1000)
    status: Literal["draft", "published", "archived"] = "draft"

    @field_validator("topic")
    @classmethod
    def clean_question_topic(cls, value: str) -> str:
        return guard_ai_text(sanitize_prompt_value(value), max_length=100)

    @field_validator("options")
    @classmethod
    def validate_options(cls, values: list[str]) -> list[str]:
        cleaned = [value.strip() for value in values]
        if any(not value or len(value) > 300 for value in cleaned):
            raise ValueError("As quatro alternativas precisam ter texto curto.")
        if len({value.casefold() for value in cleaned}) != 4:
            raise ValueError("As alternativas precisam ser diferentes.")
        return cleaned


class AdminSubjectCreate(BaseModel):
    """Disciplina nova criada pela administração."""

    name: str = Field(min_length=2, max_length=80)
    description: str = Field(default="", max_length=1000)
    category: str = Field(default="Outras", min_length=2, max_length=80)

    @field_validator("name", "category")
    @classmethod
    def clean_subject_text(cls, value: str) -> str:
        return sanitize_prompt_value(value, max_length=80)


class AdminModuleCreate(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    position: int = Field(ge=1, le=1000)

    @field_validator("title")
    @classmethod
    def clean_module_title(cls, value: str) -> str:
        return sanitize_prompt_value(value, max_length=120)


class AdminLessonCreate(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    position: int = Field(ge=1, le=1000)
    estimated_minutes: int = Field(default=15, ge=1, le=600)
    summary: str = Field(default="", max_length=1000)
    content: str = Field(default="", max_length=30_000)
    learning_objectives: list[str] = Field(default_factory=list, max_length=10)
    published: bool = True

    @field_validator("title")
    @classmethod
    def clean_lesson_title(cls, value: str) -> str:
        return sanitize_prompt_value(value, max_length=120)

    @field_validator("learning_objectives")
    @classmethod
    def clean_objectives(cls, values: list[str]) -> list[str]:
        return [sanitize_prompt_value(value, max_length=160) for value in values]


def supabase_configured() -> bool:
    """Indica se o servidor recebeu URL e chave secreta do Supabase."""

    return bool(os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_SECRET_KEY"))


def sanitize_prompt_value(value: str, max_length: int = 100) -> str:
    """Aceita apenas texto curto de conteúdo, sem controle ou quebra de linha."""

    normalized = value.strip()
    if not normalized or len(normalized) > max_length:
        raise ValueError("O texto precisa ter entre 1 e 100 caracteres.")
    if any(ord(character) < 32 or ord(character) == 127 for character in normalized):
        raise ValueError("O texto não pode conter caracteres de controle.")
    if re.search(r"[{}<>]", normalized):
        raise ValueError("O texto contém caracteres não permitidos.")
    return normalized


def validate_question_id(value: str) -> str:
    """Mantém o identificador em um formato simples antes de consultar o banco."""

    normalized = value.strip()
    if not re.fullmatch(r"[A-Za-z0-9-]{1,100}", normalized):
        raise HTTPException(status_code=400, detail="Identificador de questão inválido.")
    return normalized


def database() -> Client:
    """Cria um cliente privilegiado sem persistir sessão no servidor.

    A chave secreta nunca é compartilhada com o navegador. Cada chamada recebe
    um cliente sem auto-refresh para não misturar sessões entre requisições.
    """

    if not supabase_configured():
        raise HTTPException(status_code=503, detail="Supabase ainda não está configurado no backend.")
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SECRET_KEY"],
        # O backend usa o cliente síncrono do Supabase. A opção base não possui
        # o armazenamento esperado e só falha quando a primeira consulta real acontece.
        options=SyncClientOptions(auto_refresh_token=False, persist_session=False),
    )


def login_limit_status(db: Client, key_hash: str, key_kind: str) -> RateLimitState:
    """Consulta o contador pelo backend, sem abrir a tabela ao navegador."""

    try:
        data = db.rpc(
            "login_rate_limit_status",
            {
                "p_key_hash": key_hash,
                "p_key_kind": key_kind,
                "p_window_seconds": LOGIN_WINDOW_SECONDS,
            },
        ).execute().data
        return rate_limit_state(data)
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=503, detail="Proteção de login temporariamente indisponível.") from error


def reserve_login_attempt(db: Client, identity_hash: str) -> RateLimitState:
    """Reserva uma das cinco tentativas antes de conferir a senha."""

    try:
        data = db.rpc(
            "reserve_login_attempt",
            {
                "p_key_hash": identity_hash,
                "p_max_attempts": LOGIN_MAX_FAILURES,
                "p_window_seconds": LOGIN_WINDOW_SECONDS,
                "p_lock_seconds": LOGIN_LOCK_SECONDS,
                "p_max_lock_seconds": LOGIN_MAX_LOCK_SECONDS,
            },
        ).execute().data
        return rate_limit_state(data)
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=503, detail="Proteção de login temporariamente indisponível.") from error


def record_login_failure(db: Client, key_hash: str, key_kind: str, max_attempts: int) -> RateLimitState:
    """Incrementa o contador com bloqueio atômico dentro do PostgreSQL."""

    try:
        data = db.rpc(
            "record_login_failure",
            {
                "p_key_hash": key_hash,
                "p_key_kind": key_kind,
                "p_max_attempts": max_attempts,
                "p_window_seconds": LOGIN_WINDOW_SECONDS,
                "p_lock_seconds": LOGIN_LOCK_SECONDS,
            },
        ).execute().data
        return rate_limit_state(data)
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=503, detail="Proteção de login temporariamente indisponível.") from error


def clear_login_failures(db: Client, identity_hash: str) -> None:
    """Um login correto limpa apenas as falhas daquela conta."""

    try:
        db.rpc(
            "clear_login_failures",
            {"p_key_hash": identity_hash, "p_key_kind": "identity"},
        ).execute()
    except Exception as error:
        raise HTTPException(status_code=503, detail="Proteção de login temporariamente indisponível.") from error


def login_limit_error(*states: RateLimitState) -> HTTPException:
    """Monta uma resposta padrão sem confirmar se o e-mail existe."""

    retry_after = max(1, *(state.retry_after_seconds for state in states))
    return HTTPException(
        status_code=429,
        detail="Muitas tentativas de acesso. Aguarde antes de tentar novamente.",
        headers={"Retry-After": str(retry_after), "Cache-Control": "no-store"},
    )


def reject_failed_login(db: Client, identity_state: RateLimitState, network_hash: str) -> None:
    """Registra a falha e responde sem revelar qual parte da credencial errou."""

    network_state = record_login_failure(db, network_hash, "network", NETWORK_MAX_FAILURES)
    states = (identity_state, network_state)
    blocked = tuple(
        state
        for state in states
        if not state.allowed or state.failed_attempts in {LOGIN_MAX_FAILURES, NETWORK_MAX_FAILURES}
    )
    if blocked:
        raise login_limit_error(*blocked)
    raise HTTPException(
        status_code=401,
        detail="E-mail ou senha inválidos.",
        headers={"Cache-Control": "no-store"},
    )


def authenticate_with_password(credentials: LoginRequest):
    """Usa um cliente separado para a sessão nunca trocar o papel da RPC."""

    payload = {"email": credentials.email, "password": credentials.password}
    if captcha_mode() == "supabase":
        # Uma chave privilegiada pode dispensar CAPTCHA no Auth. Este cliente
        # precisa da chave publicável e não recebe tokens já consumidos localmente.
        client = create_client(
            os.environ["SUPABASE_URL"],
            os.environ["SUPABASE_PUBLISHABLE_KEY"].strip(),
            options=SyncClientOptions(auto_refresh_token=False, persist_session=False),
        )
        payload["options"] = {"captcha_token": credentials.captcha_token.strip()}
    else:
        client = database()
    return client.auth.sign_in_with_password(payload)


def email_configured() -> bool:
    """Confere o transporte selecionado, sem exigir SMTP quando o envio é HTTPS."""
    from email_delivery import email_config_from_env

    try:
        email_config_from_env()
    except (ValueError, UnicodeError):
        return False
    return True


def send_smtp_email(*, db: Client, teacher_id: str, subject_id: str) -> str:
    """Nome legado: o ledger RF22 seleciona SMTP ou Resend e não comprova recebimento."""
    from email_delivery import deliver_immediate

    return deliver_immediate(
        db, teacher_id=teacher_id, subject_id=subject_id,
        panel_url=os.getenv("EMAIL_PANEL_URL", ""),
    )


def require_weekly_summary_secret(x_cron_secret: Annotated[str | None, Header()] = None) -> None:
    """Fecha o job interno para chamadas autenticadas pelo segredo do Railway."""

    expected = os.getenv("WEEKLY_SUMMARY_CRON_SECRET")
    if not expected:
        raise HTTPException(status_code=503, detail="Resumo semanal ainda não está configurado.")
    if not is_valid_cron_secret(x_cron_secret, expected):
        raise HTTPException(status_code=403, detail="Credencial do resumo semanal inválida.")


def current_week_start(today: date | None = None) -> date:
    """Usa segunda-feira como marcador estável para impedir resumo duplicado."""

    reference = today or datetime.now(timezone.utc).date()
    return reference - timedelta(days=reference.weekday())


def authenticated_profile(
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
    *,
    require_privacy_consent: bool = True,
) -> dict[str, Any]:
    """Valida a sessão e, salvo no endpoint de aceite, exige concordância atual.

    O cargo não vem de dados editáveis do usuário. Ele é lido de ``profiles``
    pelo backend, impedindo que alguém se declare professor ou administrador.
    """

    # Sem Supabase não existe identidade confiável; liberar um usuário demo
    # aqui faria qualquer visitante atravessar as dependências de autorização.
    if not supabase_configured():
        raise HTTPException(status_code=503, detail="Autenticação ainda não está configurada no backend.")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Sessão ausente ou inválida.")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        db = database()
        auth_user = db.auth.get_user(token).user
        if not auth_user:
            raise ValueError("User not found")
        rows = db.table("profiles").select("id,email,role,full_name,grade,goal,privacy_policy_version,terms_of_use_version," + PROFILE_FIELDS).eq("id", str(auth_user.id)).limit(1).execute().data
        if not rows:
            raise ValueError("Profile not found")
        profile = rows[0]
        if request is not None:
            # O middleware lê esse estado somente depois que a dependência
            # validou JWT e cargo no banco; nada vem de cabeçalho inventado.
            request.state.audit_actor_id = profile["id"]
            request.state.audit_actor_role = profile["role"]
        if require_privacy_consent and (
            profile.get("privacy_policy_version") != "1.7" or profile.get("terms_of_use_version") != "1.0"
        ):
            raise HTTPException(
                status_code=428,
                detail="Aceite os Termos de Uso e a Política de Privacidade para continuar.",
            )
        if require_privacy_consent:
            check_access(profile)
        return profile
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=401, detail="Sessão expirada ou inválida.") from error


def current_user(
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
) -> dict[str, Any]:
    """Dependência padrão: só libera a plataforma após o aceite vigente."""

    return authenticated_profile(request, authorization, require_privacy_consent=True)


def current_user_pending_privacy(
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
) -> dict[str, Any]:
    """Única dependência para o endpoint que registra o primeiro aceite."""

    return authenticated_profile(request, authorization, require_privacy_consent=False)


def require_role(*roles: str):
    """Constrói uma dependência FastAPI que restringe uma rota por cargo."""

    def dependency(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
        """Compara o cargo persistido com a lista permitida pela rota."""

        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Você não tem permissão para esta operação.")
        return user
    return dependency


# Limites menores ficam nas ações que geram custo ou alteram dados importantes.
# A contagem real acontece no PostgreSQL, então continua valendo se o Railway
# iniciar mais de uma cópia do backend.
API_RATE_LIMITS: dict[str, tuple[int, int]] = {
    "leaderboard_read": (60, 15 * 60),
    "leaderboard_preferences": (10, 15 * 60),
    "account_lifecycle_write": (10, 15 * 60),
    "account_lifecycle_read": (60, 15 * 60),
    "answer_question": (120, 15 * 60),
    "diagnostic_answer": (60, 60 * 60),
    "lesson_progress": (240, 60 * 60),
    "generate_question": (10, 60 * 60),
    "teacher_question_write": (60, 60 * 60),
    "profile_personalization": (30, 60 * 60),
    "notification_preferences": (30, 60 * 60),
    "admin_performance_read": (120, 60 * 60),
    "admin_user_delete": (10, 60 * 60),
    "teacher_class_write": (60, 60 * 60),
    "teacher_content_write": (30, 60 * 60),
    "teacher_content_import": (10, 60 * 60),
    "teacher_recommendation": (10, 60 * 60),
    "admin_user_write": (30, 60 * 60),
    "admin_content_write": (60, 60 * 60),
    "admin_audit_read": (120, 60 * 60),
    "communication_write": (120, 60 * 60),
    "ai_communication": (20, 60 * 60),
    "privacy_accept": (5, 60 * 60),
    "privacy_request_write": (10, 60 * 60),
    "privacy_data_export": (2, 60 * 60),
    "privacy_admin_read": (120, 60 * 60),
    "privacy_request_resolve": (30, 60 * 60),
}


def enforce_api_rate_limit(db: Client, user_id: str, action: str) -> None:
    """Reserva uma chamada antes de executar a operação protegida."""

    if action not in API_RATE_LIMITS:
        raise RuntimeError("Ação sem política de limite configurada.")
    max_requests, window_seconds = API_RATE_LIMITS[action]
    try:
        data = (
            db.rpc(
                "reserve_api_request",
                {
                    "p_actor_id": user_id,
                    "p_action": action,
                    "p_max_requests": max_requests,
                    "p_window_seconds": window_seconds,
                },
            )
            .execute()
            .data
        )
        row = data[0] if isinstance(data, list) and data else data
        if not isinstance(row, dict) or not isinstance(row.get("allowed"), bool):
            raise ValueError("Resposta inválida do contador")
        if not row["allowed"]:
            retry_after = max(1, int(row.get("retry_after_seconds", 1)))
            raise HTTPException(
                status_code=429,
                detail="Limite de solicitações atingido. Aguarde antes de tentar novamente.",
                headers={"Retry-After": str(retry_after), "Cache-Control": "no-store"},
            )
    except HTTPException:
        raise
    except Exception as error:
        # Falhar fechado impede que uma indisponibilidade no contador libere
        # chamadas caras sem proteção.
        raise HTTPException(status_code=503, detail="Proteção de uso temporariamente indisponível.") from error


# O alias deixa explícito que as rotas abaixo compartilham a mesma barreira.
TeacherUser = Annotated[dict[str, Any], Depends(require_role("teacher"))]
CommunicationUser = Annotated[dict[str, Any], Depends(require_role("student", "teacher", "admin"))]
# O tutor de IA continua restrito a quem estuda ou ensina.
AITutorUser = Annotated[dict[str, Any], Depends(require_role("student", "teacher"))]


def openai_client() -> OpenAI:
    """Entrega o cliente OpenAI apenas quando a chave está configurada."""

    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(status_code=503, detail="A integração de IA ainda não está configurada.")
    return OpenAI()


def rpc_uuid(value: Any) -> str:
    """Normaliza o UUID escalar devolvido pelas funcoes RPC do Supabase."""

    candidate = value[0] if isinstance(value, list) and value else value
    if isinstance(candidate, dict):
        candidate = next(iter(candidate.values()), None)
    try:
        return str(uuid.UUID(str(candidate)))
    except (ValueError, TypeError, AttributeError) as error:
        raise HTTPException(status_code=503, detail="O banco devolveu uma conversa invalida.") from error


def owned_conversation(
    db: Client,
    user_id: str,
    conversation_id: str,
    *,
    expected_kind: str | None = None,
) -> dict[str, Any]:
    """Confirma a participacao antes de ler qualquer detalhe da conversa."""

    memberships = (
        db.table("conversation_members")
        .select("conversation_id")
        .eq("conversation_id", conversation_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
        .data
    )
    if not memberships:
        # O mesmo 404 vale para conversa inexistente ou alheia, evitando enumeracao.
        raise HTTPException(status_code=404, detail="Conversa nao encontrada.")
    rows = (
        db.table("conversations")
        .select("id,kind,created_by,created_at,last_message_at")
        .eq("id", conversation_id)
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Conversa nao encontrada.")
    conversation = rows[0]
    if expected_kind and conversation["kind"] != expected_kind:
        raise HTTPException(status_code=409, detail="Tipo de conversa incompativel com esta acao.")
    return conversation


def start_ai_conversation(db: Client, user_id: str) -> str:
    """Abre uma unica conversa de IA por usuario usando uma operacao atomica."""

    try:
        result = db.rpc("get_or_create_ai_conversation", {"p_actor_id": user_id}).execute().data
        return rpc_uuid(result)
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=503, detail="Nao foi possivel abrir o assistente agora.") from error


def generate_with_ai(request: QuestionRequest) -> dict[str, Any]:
    """Gera uma questão estruturada e apropriada ao contexto educacional."""

    try:
        response = openai_client().responses.create(
            model=os.getenv("OPENAI_MODEL", "gpt-5-mini"),
            input=protected_ai_input(
                task="""Crie uma questão objetiva de múltipla escolha para reforço escolar.
A questão deve ser pedagogicamente correta, apropriada para estudantes, ter quatro alternativas plausíveis e uma explicação curta. Não use dados pessoais.""",
                user_request="Gere uma questão usando os parâmetros pedagógicos informados.",
                context={
                    "subject": request.subject,
                    "topic": request.topic,
                    "difficulty": request.difficulty,
                },
            ),
            store=False,
            text={"format": {"type": "json_schema", "name": "educational_question", "strict": True, "schema": QUESTION_SCHEMA}},
        )
        generated = json.loads(response.output_text)
        return {"id": str(uuid.uuid4()), "subject": request.subject, "topic": request.topic, "difficulty": request.difficulty, **generated}
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=502, detail="Não foi possível gerar a questão agora.") from error


def synchronize_difficulty_alert(
    db: Client,
    *,
    student_id: str,
    subject_id: str,
    subject_name: str,
    topic: str,
    accuracy_percent: float,
    attempts: int,
) -> None:
    """Abre ou resolve o alerta da dupla estudante+tópico sem parar a atividade."""

    assignment = db.table("teacher_subjects").select("teacher_id").eq("subject_id", subject_id).limit(1).execute().data
    if not assignment:
        return
    teacher_id = assignment[0]["teacher_id"]
    existing_rows = (
        db.table("difficulty_alerts")
        .select("id,status")
        .eq("student_id", student_id)
        .eq("subject_id", subject_id)
        .eq("topic", topic)
        .limit(1)
        .execute()
        .data
    )
    existing = existing_rows[0] if existing_rows else None
    now = datetime.now(timezone.utc).isoformat()
    if not is_high_difficulty(accuracy_percent, attempts):
        if existing and existing["status"] == "active":
            db.table("difficulty_alerts").update({"status": "resolved", "updated_at": now}).eq("id", existing["id"]).execute()
        return

    payload = {
        "teacher_id": teacher_id,
        "student_id": student_id,
        "subject_id": subject_id,
        "topic": topic,
        "accuracy": round(accuracy_percent, 2),
        "attempts": attempts,
        "status": "active",
        "updated_at": now,
    }
    db.table("difficulty_alerts").upsert(payload, on_conflict="student_id,subject_id,topic").execute()
    should_send_immediately = not existing or existing["status"] != "active"
    if not should_send_immediately:
        return

    # Falha externa não desfaz a tentativa ou o alerta do painel.
    try:
        send_smtp_email(db=db, teacher_id=teacher_id, subject_id=subject_id)
    except Exception:
        logger.warning("RF22: envio imediato pendente de revisão no ledger.")


def serialize_question(row: dict[str, Any]) -> dict[str, Any]:
    """Normaliza registros do Supabase para o contrato usado pelo React."""

    subject = row.get("subjects") or {}
    return {
        "id": row["id"],
        "subject": subject.get("name", row.get("subject", "")),
        "topic": row["topic"],
        "difficulty": row["difficulty"],
        "question": row["question"],
        "options": row["options"],
        "correct_index": row["correct_index"],
        "explanation": row["explanation"],
        "status": row.get("status", "published"),
        "review_notes": row.get("review_notes", ""),
        "source": row.get("source", "seed"),
        "created_at": row.get("created_at"),
    }


def hide_question_solution(question: dict[str, Any]) -> dict[str, Any]:
    """Remove o gabarito do conteúdo que chega ao estudante antes da tentativa."""

    # O backend guarda a resposta certa para corrigir depois, mas o navegador não
    # precisa conhecê-la enquanto a pessoa ainda está decidindo a alternativa.
    return {key: value for key, value in question.items() if key not in {"correct_index", "explanation"}}


def teacher_assignment(db: Client, teacher_id: str) -> dict[str, str]:
    """Localiza a única disciplina atribuída ao professor autenticado."""

    rows = (
        db.table("teacher_subjects")
        .select("subject_id,subjects(name)")
        .eq("teacher_id", teacher_id)
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(status_code=409, detail="Professor ainda não possui disciplina atribuída.")
    return {
        "subject_id": rows[0]["subject_id"],
        "subject": (rows[0].get("subjects") or {}).get("name", "Disciplina"),
    }


def owned_teacher_class(db: Client, teacher_id: str, class_id: str) -> dict[str, Any]:
    """Impede que trocar o ID da URL abra a turma de outro professor."""

    rows = (
        db.table("classes")
        .select("id,name,school_year,subject_id,subjects(name)")
        .eq("id", class_id)
        .eq("teacher_id", teacher_id)
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Turma não encontrada.")
    return rows[0]


def teacher_student_summaries(db: Client, subject_id: str, student_ids: list[str]) -> list[dict[str, Any]]:
    """Junta desempenho da disciplina sem permitir alterações nos dados do aluno."""

    if not student_ids:
        return []
    profiles = db.table("profiles").select("id,full_name,grade,email").in_("id", student_ids).execute().data
    questions = db.table("questions").select("id,topic").eq("subject_id", subject_id).limit(5000).execute().data
    question_ids = [row["id"] for row in questions]
    topics_by_question = {row["id"]: row["topic"] for row in questions}
    attempts = []
    if question_ids:
        attempts = (
            db.table("question_attempts")
            .select("student_id,question_id,correct,response_time_seconds,answered_at")
            .in_("student_id", student_ids)
            .in_("question_id", question_ids)
            .order("answered_at", desc=True)
            .limit(10000)
            .execute()
            .data
        )
    modules = db.table("modules").select("id").eq("subject_id", subject_id).execute().data
    module_ids = [row["id"] for row in modules]
    lessons = db.table("lessons").select("id").in_("module_id", module_ids).execute().data if module_ids else []
    lesson_ids = [row["id"] for row in lessons]
    progress = []
    if lesson_ids:
        progress = (
            db.table("lesson_progress")
            .select("student_id,time_seconds,completed,last_accessed_at")
            .in_("student_id", student_ids)
            .in_("lesson_id", lesson_ids)
            .limit(10000)
            .execute()
            .data
        )
    difficulties = (
        db.table("student_difficulties")
        .select("student_id,topic,accuracy,attempts,level,updated_at")
        .in_("student_id", student_ids)
        .eq("subject_id", subject_id)
        .limit(5000)
        .execute()
        .data
    )

    attempts_by_student: dict[str, list[dict[str, Any]]] = defaultdict(list)
    progress_by_student: dict[str, list[dict[str, Any]]] = defaultdict(list)
    difficulty_by_student: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in attempts:
        row["topic"] = topics_by_question.get(row["question_id"], "Conteúdo")
        attempts_by_student[row["student_id"]].append(row)
    for row in progress:
        progress_by_student[row["student_id"]].append(row)
    for row in difficulties:
        difficulty_by_student[row["student_id"]].append(row)

    summaries = []
    for profile in profiles:
        student_attempts = attempts_by_student[profile["id"]]
        attempt_count = len(student_attempts)
        correct = sum(1 for row in student_attempts if row["correct"])
        accuracy = round(correct / attempt_count * 100, 1) if attempt_count else 0
        lesson_seconds = sum(int(row.get("time_seconds", 0)) for row in progress_by_student[profile["id"]])
        answer_seconds = sum(int(row.get("response_time_seconds", 0)) for row in student_attempts)
        summaries.append(
            {
                **profile,
                "accuracy": accuracy,
                "attempts": attempt_count,
                "difficulty": difficulty_label(accuracy, attempt_count),
                "time_minutes": round((lesson_seconds + answer_seconds) / 60),
                "completed_lessons": sum(1 for row in progress_by_student[profile["id"]] if row.get("completed")),
                "difficulties": difficulty_by_student[profile["id"]],
                "trend": build_difficulty_trend(student_attempts),
                "recent_attempts": student_attempts[:12],
            }
        )
    return sorted(summaries, key=lambda item: item["full_name"].casefold())


@app.post("/auth/login")
def login(credentials: LoginRequest, request: Request, response: Response):
    """Autentica com cinco tentativas e bloqueio progressivo por conta."""

    db = database()
    try:
        verify_turnstile(credentials.captcha_token, client_network(request), expected_action="login")
    except CaptchaUnavailable as error:
        raise HTTPException(status_code=503, detail=str(error)) from error
    except CaptchaError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    identity_hash = rate_limit_hash("identity", credentials.email)
    request.state.audit_subject_hash = identity_hash
    network_hash = rate_limit_hash("network", client_network(request))
    network_state = login_limit_status(db, network_hash, "network")
    if not network_state.allowed:
        raise login_limit_error(network_state)
    identity_state = reserve_login_attempt(db, identity_hash)
    if not identity_state.allowed:
        raise login_limit_error(identity_state)

    try:
        auth_response = authenticate_with_password(credentials)
    except AuthApiError as error:
        status = int(error.status or 500)
        if status == 429:
            raise HTTPException(
                status_code=429,
                detail="Muitas tentativas de acesso. Aguarde antes de tentar novamente.",
                headers={"Retry-After": "300", "Cache-Control": "no-store"},
            ) from error
        if 400 <= status < 500:
            reject_failed_login(db, identity_state, network_hash)
        raise HTTPException(
            status_code=502,
            detail="O serviço de autenticação está temporariamente indisponível.",
            headers={"Cache-Control": "no-store"},
        ) from error
    except Exception as error:
        raise HTTPException(
            status_code=502,
            detail="O serviço de autenticação está temporariamente indisponível.",
            headers={"Cache-Control": "no-store"},
        ) from error

    session = auth_response.session
    if not session or not session.access_token or not session.refresh_token:
        reject_failed_login(db, identity_state, network_hash)

    auth_user = getattr(auth_response, "user", None) or getattr(session, "user", None)
    actor_id = str(getattr(auth_user, "id", ""))
    if actor_id:
        request.state.audit_actor_id = actor_id
        try:
            role_rows = db.table("profiles").select("role").eq("id", actor_id).limit(1).execute().data
            if role_rows:
                request.state.audit_actor_role = role_rows[0]["role"]
        except Exception:
            # O login continua válido; o ID ainda permite identificar o ator.
            request.state.audit_actor_role = None

    clear_login_failures(db, identity_hash)
    response.headers["Cache-Control"] = "no-store"
    return {
        "access_token": session.access_token,
        "refresh_token": session.refresh_token,
        "expires_in": session.expires_in,
        "token_type": getattr(session, "token_type", "bearer"),
    }


@app.get("/health/live")
def liveness():
    """Sinal mínimo para o Railway saber que o processo está respondendo."""

    return {"status": "ok", "service": "aprendeIA"}


@app.get("/health/ready")
def readiness():
    """Confirma configuração essencial sem publicar valores sensíveis."""

    if not supabase_configured():
        raise HTTPException(status_code=503, detail="Banco de dados não configurado.")
    # O monitor externo acusa a produção que ficaria sem login por falta da chave.
    if captcha_required() and not captcha_configured():
        raise HTTPException(status_code=503, detail="Verificação de segurança não configurada.")
    try:
        # Limite zero valida o contrato das áreas novas sem ler dados dos titulares.
        db = database()
        required_tables = {
            "diagnostic_sessions": "id", "access_audit_logs": "id",
            "conversations": "id", "privacy_policy_acceptances": "id,terms_version",
            "privacy_requests": "id", "account_admissions": "id",
            "email_deliveries": "id,provider_accepted_at",
            "gamification_events": "student_id", "student_achievements": "student_id",
            "leaderboard_preferences": "student_id",
            "profiles": "id,auth_created_at,account_expires_at,terms_of_use_version",
        }
        for table, columns in required_tables.items():
            db.table(table).select(columns).limit(0).execute()
    except Exception as error:
        raise HTTPException(status_code=503, detail="Banco de dados ainda não está pronto.") from error
    return {
        "status": "ready",
        "service": "aprendeIA",
        "ai_configured": bool(os.getenv("OPENAI_API_KEY")),
        "captcha_configured": captcha_configured(),
    }


@app.get("/health")
def health(_user: dict = Depends(current_user)):
    """Informa se os serviços essenciais estão configurados, sem expor chaves."""

    return {
        "status": "ok",
        "service": "aprendeIA",
        "ai_configured": bool(os.getenv("OPENAI_API_KEY")),
        "supabase_configured": supabase_configured(),
        "captcha_configured": captcha_configured(),
        "captcha_required": captcha_required(),
    }


@app.post("/privacy/accept", status_code=201)
def accept_privacy_policy(
    request: Request,
    payload: PrivacyPolicyAccept,
    user: dict = Depends(current_user_pending_privacy),
):
    """Registra aceite pendente antes de liberar as demais rotas da conta."""

    db = database()
    enforce_api_rate_limit(db, user["id"], "privacy_accept")
    accepted_at = db.rpc(
        "record_privacy_policy_acceptance",
        {
            "target_user_id": user["id"],
            "target_policy_version": payload.policy_version,
            "target_terms_version": payload.terms_version,
        },
    ).execute().data
    request.state.audit_resource_id = user["id"]
    request.state.audit_metadata = {
        "policy_version": payload.policy_version,
        "terms_version": payload.terms_version,
    }
    return {
        "accepted": True,
        "policy_version": payload.policy_version,
        "terms_version": payload.terms_version,
        "accepted_at": accepted_at,
    }


@app.get("/communications/contacts")
def communication_contacts(user: CommunicationUser):
    """Lista somente pessoas com quem o cargo atual pode iniciar conversa."""

    db = database()
    contacts: dict[str, dict[str, Any]] = {}
    if user["role"] == "student":
        enrollments = (
            db.table("enrollments")
            .select("subject_id,subjects(name)")
            .eq("student_id", user["id"])
            .execute()
            .data
        )
        subject_ids = [row["subject_id"] for row in enrollments]
        subject_names = {
            row["subject_id"]: (row.get("subjects") or {}).get("name", "Disciplina")
            for row in enrollments
        }
        assignments = (
            db.table("teacher_subjects")
            .select("teacher_id,subject_id")
            .in_("subject_id", subject_ids)
            .execute()
            .data
            if subject_ids
            else []
        )
        teacher_ids = list({row["teacher_id"] for row in assignments})
        profiles = (
            db.table("profiles")
            .select("id,full_name,role")
            .in_("id", teacher_ids)
            .eq("role", "teacher")
            .eq("registration_status", "active")
            .execute()
            .data
            if teacher_ids
            else []
        )
        teachers_by_id = {profile["id"]: profile for profile in profiles}
        for assignment in assignments:
            profile = teachers_by_id.get(assignment["teacher_id"])
            if profile:
                contacts[profile["id"]] = {
                    **profile,
                    "context": subject_names.get(assignment["subject_id"], "Disciplina"),
                }
    elif user["role"] == "admin":
        # A administração conversa só com professores ativos, nunca com alunos.
        teachers = (
            db.table("profiles")
            .select("id,full_name,role")
            .eq("role", "teacher")
            .eq("registration_status", "active")
            .execute()
            .data
        )
        for profile in teachers:
            contacts[profile["id"]] = {**profile, "context": "Professor"}
    else:
        assignment = teacher_assignment(db, user["id"])
        enrollments = (
            db.table("enrollments")
            .select("student_id")
            .eq("subject_id", assignment["subject_id"])
            .execute()
            .data
        )
        student_ids = list({row["student_id"] for row in enrollments})
        students = (
            db.table("profiles")
            .select("id,full_name,role")
            .in_("id", student_ids)
            .eq("role", "student")
            .eq("registration_status", "active")
            .execute()
            .data
            if student_ids
            else []
        )
        for profile in students:
            contacts[profile["id"]] = {**profile, "context": assignment["subject"]}

        # A troca entre professores nao abre dados das disciplinas dos colegas.
        teachers = (
            db.table("profiles")
            .select("id,full_name,role")
            .eq("role", "teacher")
            .eq("registration_status", "active")
            .execute()
            .data
        )
        for profile in teachers:
            if profile["id"] != user["id"]:
                contacts[profile["id"]] = {**profile, "context": "Professor"}

        admins = (
            db.table("profiles")
            .select("id,full_name,role")
            .eq("role", "admin")
            .eq("registration_status", "active")
            .execute()
            .data
        )
        for profile in admins:
            contacts[profile["id"]] = {**profile, "context": "Administração"}

    return sorted(contacts.values(), key=lambda item: item["full_name"].casefold())


@app.get("/communications/conversations")
def communication_conversations(user: CommunicationUser):
    """Resume as conversas do usuario sem revelar membros de outras salas."""

    db = database()
    own_memberships = (
        db.table("conversation_members")
        .select("conversation_id")
        .eq("user_id", user["id"])
        .execute()
        .data
    )
    conversation_ids = [row["conversation_id"] for row in own_memberships]
    if not conversation_ids:
        return []
    conversations = (
        db.table("conversations")
        .select("id,kind,created_at,last_message_at")
        .in_("id", conversation_ids)
        .order("last_message_at", desc=True)
        .execute()
        .data
    )
    members = (
        db.table("conversation_members")
        .select("conversation_id,user_id")
        .in_("conversation_id", conversation_ids)
        .execute()
        .data
    )
    participant_ids = list({row["user_id"] for row in members if row["user_id"] != user["id"]})
    profiles = (
        db.table("profiles")
        .select("id,full_name,role")
        .in_("id", participant_ids)
        .execute()
        .data
        if participant_ids
        else []
    )
    profiles_by_id = {profile["id"]: profile for profile in profiles}
    members_by_conversation: dict[str, list[str]] = defaultdict(list)
    for member in members:
        members_by_conversation[member["conversation_id"]].append(member["user_id"])
    recent_messages = (
        db.table("messages")
        .select("conversation_id,body,created_at,sender_kind")
        .in_("conversation_id", conversation_ids)
        .order("created_at", desc=True)
        .limit(500)
        .execute()
        .data
    )
    latest_by_conversation: dict[str, dict[str, Any]] = {}
    for message in recent_messages:
        latest_by_conversation.setdefault(message["conversation_id"], message)

    result = []
    for conversation in conversations:
        participant = None
        for participant_id in members_by_conversation[conversation["id"]]:
            if participant_id != user["id"]:
                participant = profiles_by_id.get(participant_id)
                break
        result.append(
            {
                **conversation,
                "title": "Tutor IA" if conversation["kind"] == "ai" else (participant or {}).get("full_name", "Conversa"),
                "participant_id": (participant or {}).get("id"),
                "participant_role": "assistant" if conversation["kind"] == "ai" else (participant or {}).get("role"),
                "last_message": latest_by_conversation.get(conversation["id"]),
            }
        )
    return result


@app.post("/communications/conversations", status_code=201)
def create_communication_conversation(payload: DirectConversationCreate, user: CommunicationUser):
    """Cria conversa humana somente quando cargo e vinculo permitem."""

    db = database()
    recipient_rows = (
        db.table("profiles")
        .select("id,role,registration_status")
        .eq("id", str(payload.participant_id))
        .limit(1)
        .execute()
        .data
    )
    if not recipient_rows or recipient_rows[0].get("registration_status") != "active":
        raise HTTPException(status_code=404, detail="Contato nao encontrado.")
    recipient = recipient_rows[0]
    if not can_start_direct_conversation(user["role"], recipient["role"]):
        raise HTTPException(status_code=403, detail="Este tipo de conversa nao e permitido.")
    enforce_api_rate_limit(db, user["id"], "communication_write")
    try:
        result = db.rpc(
            "get_or_create_direct_conversation",
            {"p_actor_id": user["id"], "p_recipient_id": recipient["id"]},
        ).execute().data
        return {"id": rpc_uuid(result), "kind": "direct"}
    except HTTPException:
        raise
    except Exception as error:
        # A RPC repete a autorizacao e impede contornar o vinculo pelo endpoint.
        raise HTTPException(status_code=403, detail="Nao foi possivel iniciar esta conversa.") from error


@app.get("/communications/conversations/{conversation_id}/messages")
def communication_messages(conversation_id: uuid.UUID, user: CommunicationUser):
    """Entrega o historico somente a um membro autenticado da conversa."""

    db = database()
    conversation_key = str(conversation_id)
    owned_conversation(db, user["id"], conversation_key)
    rows = (
        db.table("messages")
        .select("id,sender_id,sender_kind,body,created_at")
        .eq("conversation_id", conversation_key)
        .order("created_at")
        .limit(200)
        .execute()
        .data
    )
    sender_ids = list({row["sender_id"] for row in rows if row.get("sender_id")})
    profiles = (
        db.table("profiles").select("id,full_name,role").in_("id", sender_ids).execute().data
        if sender_ids
        else []
    )
    profiles_by_id = {profile["id"]: profile for profile in profiles}
    return [
        {
            **row,
            "sender_name": "Tutor IA"
            if row["sender_kind"] == "assistant"
            else profiles_by_id.get(row.get("sender_id"), {}).get("full_name", "Usuario"),
            "is_mine": row.get("sender_id") == user["id"],
        }
        for row in rows
    ]


@app.post("/communications/conversations/{conversation_id}/messages", status_code=201)
def send_communication_message(
    conversation_id: uuid.UUID,
    payload: CommunicationMessageCreate,
    user: CommunicationUser,
):
    """Envia texto a uma conversa humana; esta rota nunca chama a IA."""

    db = database()
    conversation_key = str(conversation_id)
    owned_conversation(db, user["id"], conversation_key, expected_kind="direct")
    enforce_api_rate_limit(db, user["id"], "communication_write")
    now = datetime.now(timezone.utc).isoformat()
    saved = (
        db.table("messages")
        .insert(
            {
                "conversation_id": conversation_key,
                "sender_id": user["id"],
                "sender_kind": "user",
                "body": payload.body,
                "created_at": now,
            }
        )
        .execute()
        .data[0]
    )
    db.table("conversations").update({"last_message_at": now}).eq("id", conversation_key).execute()
    return {**saved, "sender_name": user["full_name"], "is_mine": True}


@app.post("/communications/ai/messages", status_code=201)
def send_ai_communication_message(payload: AICommunicationRequest, user: AITutorUser):
    """Mantem a conversa de IA separada das mensagens humanas e dos outros usuarios."""

    db = database()
    enforce_api_rate_limit(db, user["id"], "ai_communication")
    conversation_id = str(payload.conversation_id) if payload.conversation_id else start_ai_conversation(db, user["id"])
    owned_conversation(db, user["id"], conversation_id, expected_kind="ai")
    now = datetime.now(timezone.utc).isoformat()
    user_message = (
        db.table("messages")
        .insert(
            {
                "conversation_id": conversation_id,
                "sender_id": user["id"],
                "sender_kind": "user",
                "body": payload.body,
                "created_at": now,
            }
        )
        .execute()
        .data[0]
    )
    recent = (
        db.table("messages")
        .select("sender_kind,body")
        .eq("conversation_id", conversation_id)
        .order("created_at", desc=True)
        .limit(10)
        .execute()
        .data
    )
    history = [
        {"role": "assistant" if row["sender_kind"] == "assistant" else "user", "content": row["body"]}
        for row in reversed(recent)
    ]
    task = (
        "Explique o conteudo como tutor. Ajude o estudante a raciocinar sem fazer atividades avaliativas por ele."
        if user["role"] == "student"
        else "Ajude o professor com planejamento, explicacoes e estrategias pedagogicas, sem inventar dados de estudantes."
    )
    try:
        response = openai_client().responses.create(
            model=os.getenv("OPENAI_MODEL", "gpt-5-mini"),
            input=protected_ai_input(
                task=task,
                user_request=payload.body,
                context={"perfil": user["role"]},
                history=history,
            ),
            store=False,
            text={"format": {"type": "json_schema", "name": "educational_assistant", "strict": True, "schema": AI_ASSISTANT_SCHEMA}},
        )
        generated = json.loads(response.output_text)
        answer = validate_message_body(str(generated["answer"]), max_length=4000)
        suggestions = []
        for suggestion in generated.get("suggested_questions", [])[:3]:
            try:
                suggestions.append(validate_message_body(str(suggestion), max_length=160))
            except ValueError:
                continue
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=502, detail="O assistente nao conseguiu responder agora.") from error

    assistant_message = (
        db.table("messages")
        .insert(
            {
                "conversation_id": conversation_id,
                "sender_id": None,
                "sender_kind": "assistant",
                "body": answer,
            }
        )
        .execute()
        .data[0]
    )
    db.table("conversations").update(
        {"last_message_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", conversation_id).execute()
    return {
        "conversation_id": conversation_id,
        "user_message": {**user_message, "sender_name": user["full_name"], "is_mine": True},
        "assistant_message": {**assistant_message, "sender_name": "Tutor IA", "is_mine": False},
        "suggested_questions": suggestions,
    }


@app.get("/question-bank")
def list_questions(subject: str | None = None, difficulty: str | None = None, user: dict = Depends(require_role("student", "teacher"))):
    """Lista questões e permite filtros simples para uso pedagógico."""

    if subject is not None:
        subject = sanitize_prompt_value(subject, max_length=60)
    if difficulty is not None and difficulty not in {"basic", "intermediate", "advanced"}:
        raise HTTPException(status_code=422, detail="Dificuldade inválida.")
    if not supabase_configured():
        questions = [q for q in question_bank if (not subject or q["subject"] == subject) and (not difficulty or q["difficulty"] == difficulty)]
        return questions if user["role"] == "teacher" else [hide_question_solution(question) for question in questions]
    if user["role"] == "teacher":
        assignment = database().table("teacher_subjects").select("subject_id,subjects(name)").eq("teacher_id", user["id"]).limit(1).execute().data
        if not assignment:
            return []
        assigned_subject = (assignment[0].get("subjects") or {}).get("name")
        if subject and subject != assigned_subject:
            raise HTTPException(status_code=403, detail="Professor não pode consultar outra disciplina.")
        subject = assigned_subject
    query = database().table("questions").select("id,topic,difficulty,question,options,correct_index,explanation,status,review_notes,source,created_at,subjects(name)")
    if difficulty:
        query = query.eq("difficulty", difficulty)
    if user["role"] == "student":
        query = query.eq("status", "published")
    rows = query.limit(100).execute().data
    questions = [serialize_question(row) for row in rows]
    filtered = [q for q in questions if not subject or q["subject"] == subject]
    return filtered if user["role"] == "teacher" else [hide_question_solution(question) for question in filtered]


@app.post("/question-bank/generate")
def generate_question(http_request: Request, request: QuestionRequest, user: TeacherUser):
    """Gera com IA e persiste a nova questão quando existe banco configurado."""

    if not supabase_configured():
        question = generate_with_ai(request)
        question_bank.append(question)
        http_request.state.audit_resource_id = question["id"]
        return question
    db = database()
    subjects = db.table("subjects").select("id").eq("name", request.subject).limit(1).execute().data
    if not subjects:
        raise HTTPException(status_code=404, detail="Disciplina não encontrada.")
    assignment = db.table("teacher_subjects").select("subject_id").eq("teacher_id", user["id"]).limit(1).execute().data
    if not assignment or assignment[0]["subject_id"] != subjects[0]["id"]:
        raise HTTPException(status_code=403, detail="Professor não pode criar questões para outra disciplina.")
    enforce_api_rate_limit(db, user["id"], "generate_question")
    question = generate_with_ai(request)
    payload = {
        **question,
        "subject_id": subjects[0]["id"],
        "source": "openai",
        "status": "draft",
        "created_by": user["id"],
    }
    payload.pop("id", None); payload.pop("subject", None); payload.pop("skill", None)
    created = db.table("questions").insert(payload).execute().data[0]
    http_request.state.audit_resource_id = created["id"]
    created["subjects"] = {"name": request.subject}
    return serialize_question(created)


@app.get("/teacher/questions")
def list_teacher_questions(user: TeacherUser):
    """Abre a fila editorial apenas na disciplina atribuída ao professor."""

    db = database()
    assignment = teacher_assignment(db, user["id"])
    rows = (
        db.table("questions")
        .select("id,topic,difficulty,question,options,correct_index,explanation,status,review_notes,source,created_at,subjects(name)")
        .eq("subject_id", assignment["subject_id"])
        .order("created_at", desc=True)
        .limit(300)
        .execute()
        .data
    )
    return [serialize_question(row) for row in rows]


@app.patch("/teacher/questions/{question_id}")
def review_teacher_question(
    question_id: uuid.UUID,
    payload: TeacherQuestionReview,
    user: TeacherUser,
):
    """Permite revisão e publicação sem tocar em outra disciplina."""

    db = database()
    assignment = teacher_assignment(db, user["id"])
    existing = (
        db.table("questions")
        .select("id")
        .eq("id", str(question_id))
        .eq("subject_id", assignment["subject_id"])
        .limit(1)
        .execute()
        .data
    )
    if not existing:
        raise HTTPException(status_code=404, detail="Questão não encontrada na sua disciplina.")
    enforce_api_rate_limit(db, user["id"], "teacher_question_write")
    updated = (
        db.table("questions")
        .update(payload.model_dump())
        .eq("id", str(question_id))
        .eq("subject_id", assignment["subject_id"])
        .execute()
        .data
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Questão não encontrada na sua disciplina.")
    updated[0]["subjects"] = {"name": assignment["subject"]}
    return serialize_question(updated[0])


@app.get("/question-bank/next")
def next_question(subject: str = "Matemática", user: dict = Depends(require_role("student"))):
    """Seleciona uma questão no nível calculado para o estudante autenticado."""

    subject = sanitize_prompt_value(subject, max_length=60)
    if not supabase_configured():
        progress = performance[user["id"]][subject]
        candidates = [q for q in question_bank if q["subject"] == subject and q["difficulty"] == progress["difficulty"]]
        candidates = candidates or [q for q in question_bank if q["subject"] == subject] or question_bank
        return hide_question_solution(candidates[progress["attempts"] % len(candidates)])
    db = database()
    subject_rows = db.table("subjects").select("id").eq("name", subject).limit(1).execute().data
    if not subject_rows:
        raise HTTPException(status_code=404, detail="Disciplina não encontrada.")
    subject_id = subject_rows[0]["id"]
    difficulty_rows = db.table("student_difficulties").select("level").eq("student_id", user["id"]).eq("subject_id", subject_id).order("updated_at", desc=True).limit(1).execute().data
    desired = difficulty_rows[0]["level"] if difficulty_rows else "basic"
    rows = db.table("questions").select("id,topic,difficulty,question,options,correct_index,explanation,status,subjects(name)").eq("subject_id", subject_id).eq("difficulty", desired).eq("status", "published").limit(20).execute().data
    if not rows:
        rows = db.table("questions").select("id,topic,difficulty,question,options,correct_index,explanation,status,subjects(name)").eq("subject_id", subject_id).eq("status", "published").limit(20).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Ainda não há questões para esta disciplina.")
    return hide_question_solution(serialize_question(rows[0]))


@app.post("/question-bank/{question_id}/answer")
def answer_question(request: Request, question_id: str, answer: AnswerRequest, user: dict = Depends(require_role("student"))):
    """Corrige, registra a tentativa e recalcula a dificuldade recomendada."""

    question_id = validate_question_id(question_id)
    request.state.audit_resource_id = question_id
    if not supabase_configured():
        question = next((item for item in question_bank if item["id"] == question_id), None)
        if not question:
            raise HTTPException(status_code=404, detail="Questão não encontrada")
        result = performance[user["id"]][question["subject"]]
        correct = answer.selected_index == question["correct_index"]
        result["attempts"] += 1; result["correct"] += int(correct)
        accuracy = result["correct"] / result["attempts"]
        result["difficulty"] = "advanced" if accuracy >= .8 and result["attempts"] >= 3 else "basic" if accuracy < .6 else "intermediate"
        return {"correct": correct, "correct_index": question["correct_index"], "explanation": question["explanation"], "next_difficulty": result["difficulty"], "accuracy": round(accuracy * 100)}
    db = database()
    enforce_api_rate_limit(db, user["id"], "answer_question")
    rows = db.table("questions").select("id,subject_id,topic,correct_index,explanation,subjects(name)").eq("id", question_id).eq("status", "published").limit(1).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Questão não encontrada.")
    question = rows[0]; correct = answer.selected_index == question["correct_index"]
    db.table("question_attempts").insert({"student_id": user["id"], "question_id": question_id, "selected_index": answer.selected_index, "correct": correct, "response_time_seconds": answer.response_time_seconds}).execute()
    attempts = (
        db.table("question_attempts")
        .select("correct,questions!inner(subject_id,topic)")
        .eq("student_id", user["id"])
        .eq("questions.subject_id", question["subject_id"])
        .eq("questions.topic", question["topic"])
        .execute()
        .data
    )
    accuracy = (sum(1 for item in attempts if item["correct"]) / len(attempts)) if attempts else 0
    next_level = "advanced" if accuracy >= .8 and len(attempts) >= 3 else "basic" if accuracy < .6 else "intermediate"
    accuracy_percent = round(accuracy * 100, 2)
    db.table("student_difficulties").upsert({"student_id": user["id"], "subject_id": question["subject_id"], "topic": question["topic"], "level": next_level, "accuracy": accuracy_percent, "attempts": len(attempts), "updated_at": datetime.now(timezone.utc).isoformat()}, on_conflict="student_id,subject_id,topic").execute()
    try:
        synchronize_difficulty_alert(
            db,
            student_id=user["id"],
            subject_id=question["subject_id"],
            subject_name=(question.get("subjects") or {}).get("name", "sua disciplina"),
            topic=question["topic"],
            accuracy_percent=accuracy_percent,
            attempts=len(attempts),
        )
    except Exception as error:
        # A resposta do aluno já foi salva; problema no aviso não pode apagar a atividade.
        logger.warning("Não foi possível sincronizar o alerta de dificuldade: %s", type(error).__name__)
    return {"correct": correct, "correct_index": question["correct_index"], "explanation": question["explanation"], "next_difficulty": next_level, "accuracy": round(accuracy_percent)}


def student_subject_catalog(db: Client, student_id: str) -> list[dict[str, Any]]:
    """Monta disciplina, módulos, aulas e progresso em um contrato único."""

    enrollments = (
        db.table("enrollments")
        .select("subject_id")
        .eq("student_id", student_id)
        .execute()
        .data
    )
    subject_ids = [row["subject_id"] for row in enrollments]
    if not subject_ids:
        return []
    subject_rows = (
        db.table("subjects")
        .select("id,name,description,category")
        .in_("id", subject_ids)
        .order("name")
        .execute()
        .data
    )
    module_rows = (
        db.table("modules")
        .select("id,subject_id,title,position")
        .in_("subject_id", subject_ids)
        .order("position")
        .execute()
        .data
    )
    module_ids = [row["id"] for row in module_rows]
    lesson_rows = (
        db.table("lessons")
        .select("id,module_id,title,position,estimated_minutes,summary,learning_objectives,published")
        .in_("module_id", module_ids)
        .eq("published", True)
        .order("position")
        .execute()
        .data
        if module_ids
        else []
    )
    lesson_ids = [row["id"] for row in lesson_rows]
    progress_rows = (
        db.table("lesson_progress")
        .select("lesson_id,completed,time_seconds,last_accessed_at")
        .eq("student_id", student_id)
        .in_("lesson_id", lesson_ids)
        .execute()
        .data
        if lesson_ids
        else []
    )
    difficulty_rows = (
        db.table("student_difficulties")
        .select("subject_id,topic,level,accuracy,attempts,updated_at")
        .eq("student_id", student_id)
        .in_("subject_id", subject_ids)
        .execute()
        .data
    )

    progress_by_lesson = {row["lesson_id"]: row for row in progress_rows}
    lessons_by_module: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for lesson in lesson_rows:
        progress = progress_by_lesson.get(lesson["id"], {})
        lessons_by_module[lesson["module_id"]].append(
            {
                **lesson,
                "completed": bool(progress.get("completed")),
                "time_seconds": int(progress.get("time_seconds", 0)),
                "last_accessed_at": progress.get("last_accessed_at"),
            }
        )
    modules_by_subject: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for module in module_rows:
        lessons = lessons_by_module[module["id"]]
        modules_by_subject[module["subject_id"]].append(
            {
                **module,
                "lessons": lessons,
                "completed_lessons": sum(1 for lesson in lessons if lesson["completed"]),
                "total_lessons": len(lessons),
            }
        )
    difficulties_by_subject: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for difficulty in difficulty_rows:
        difficulties_by_subject[difficulty["subject_id"]].append(difficulty)

    catalog = []
    for subject in subject_rows:
        modules = modules_by_subject[subject["id"]]
        lessons = [lesson for module in modules for lesson in module["lessons"]]
        difficulties = difficulties_by_subject[subject["id"]]
        difficulty = subject_difficulty(difficulties)
        catalog.append(
            {
                **subject,
                "category": infer_subject_category(subject["name"], subject.get("category")),
                "code": subject_code(subject["name"]),
                "modules": modules,
                "completed_lessons": sum(1 for lesson in lessons if lesson["completed"]),
                "total_lessons": len(lessons),
                "remaining_lessons": sum(1 for lesson in lessons if not lesson["completed"]),
                "difficulty": difficulty["label"],
                "tone": difficulty["tone"],
                "topics": sorted(difficulties, key=lambda item: (float(item["accuracy"]), -int(item["attempts"]))),
            }
        )
    return catalog


def student_mastery_data(db: Client, student_id: str) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Combina prática e diagnóstico para recomendar aulas do próprio catálogo."""

    questions = (
        db.table("questions")
        .select("id,subject_id,topic,subjects(name)")
        .limit(5000)
        .execute()
        .data
    )
    by_question = {row["id"]: row for row in questions}
    practice = (
        db.table("question_attempts")
        .select("question_id,correct,answered_at")
        .eq("student_id", student_id)
        .limit(10_000)
        .execute()
        .data
    )
    diagnostic = (
        db.table("diagnostic_answers")
        .select("question_id,correct,answered_at")
        .eq("student_id", student_id)
        .limit(1000)
        .execute()
        .data
    )
    normalized_attempts = []
    for attempt in [*practice, *diagnostic]:
        question = by_question.get(attempt["question_id"])
        if not question:
            continue
        normalized_attempts.append(
            {
                "subject_id": question["subject_id"],
                "subject": (question.get("subjects") or {}).get("name", "Disciplina"),
                "topic": question["topic"],
                "correct": attempt["correct"],
            }
        )
    mastery = build_topic_mastery(normalized_attempts)
    catalog = student_subject_catalog(db, student_id)
    lessons = [
        {
            "id": lesson["id"],
            "subject_id": subject["id"],
            "subject": subject["name"],
            "module": module["title"],
            "title": lesson["title"],
            "summary": lesson["summary"],
            "completed": lesson["completed"],
        }
        for subject in catalog
        for module in subject["modules"]
        for lesson in module["lessons"]
    ]
    return mastery, build_study_recommendations(mastery, lessons)


@app.get("/student/subjects")
def student_subjects(user: dict = Depends(require_role("student"))):
    """Entrega o catálogo real somente para o estudante autenticado."""

    if not supabase_configured():
        return [
            {
                "id": "demo-math",
                "name": "Matemática",
                "description": "Raciocínio lógico, números e resolução de problemas.",
                "category": "Ciências Exatas",
                "code": "MA",
                "completed_lessons": 1,
                "total_lessons": 2,
                "remaining_lessons": 1,
                "difficulty": "Alta",
                "tone": "high",
                "topics": [{"topic": "Frações", "accuracy": 40, "attempts": 5}],
                "modules": [
                    {
                        "id": "demo-module",
                        "title": "Frações e porcentagens",
                        "position": 1,
                        "completed_lessons": 1,
                        "total_lessons": 2,
                        "lessons": [
                            {"id": "demo-lesson-1", "title": "Conceito de fração", "position": 1, "estimated_minutes": 15, "summary": "Entenda as partes de uma fração.", "learning_objectives": [], "completed": True, "time_seconds": 900},
                            {"id": "demo-lesson-2", "title": "Frações equivalentes", "position": 2, "estimated_minutes": 15, "summary": "Compare frações com o mesmo valor.", "learning_objectives": [], "completed": False, "time_seconds": 0},
                        ],
                    }
                ],
            }
        ]
    return student_subject_catalog(database(), user["id"])


@app.get("/student/recommendations")
def student_recommendations(user: dict = Depends(require_role("student"))):
    """Explica tópicos dominados, frágeis e as próximas aulas indicadas."""

    if not supabase_configured():
        mastery = [
            {"subject_id": "demo-math", "subject": "Matemática", "topic": "Frações", "attempts": 5, "accuracy": 40, "status": "fragile"}
        ]
        return {"mastery": mastery, "recommendations": build_study_recommendations(mastery, [])}
    mastery, recommendations = student_mastery_data(database(), user["id"])
    return {"mastery": mastery, "recommendations": recommendations}


def open_diagnostic_session(db: Client, student_id: str) -> dict[str, Any] | None:
    """Busca só a avaliação em andamento da pessoa autenticada."""

    rows = (
        db.table("diagnostic_sessions")
        .select("id,student_id,question_ids,status,started_at")
        .eq("student_id", student_id)
        .eq("status", "open")
        .limit(1)
        .execute()
        .data
    )
    return rows[0] if rows else None


@app.get("/student/diagnostic")
def student_diagnostic(user: dict = Depends(require_role("student"))):
    """Cria a primeira medição com questões publicadas de várias disciplinas."""

    if not supabase_configured():
        return {
            "status": "open",
            "session_id": "demo-diagnostic",
            "answered_question_ids": [],
            "questions": [hide_question_solution(question) for question in SEED_QUESTIONS],
        }
    db = database()
    completed = (
        db.table("diagnostic_sessions")
        .select("id,completed_at")
        .eq("student_id", user["id"])
        .eq("status", "completed")
        .order("completed_at", desc=True)
        .limit(1)
        .execute()
        .data
    )
    if completed:
        mastery, recommendations = student_mastery_data(db, user["id"])
        return {
            "status": "completed",
            "session_id": completed[0]["id"],
            "completed_at": completed[0]["completed_at"],
            "mastery": mastery,
            "recommendations": recommendations,
        }

    session = open_diagnostic_session(db, user["id"])
    if not session:
        rows = (
            db.table("questions")
            .select("id,subject_id,topic,difficulty,question,options,correct_index,explanation,subjects(name)")
            .eq("status", "published")
            .order("created_at")
            .limit(200)
            .execute()
            .data
        )
        # Duas questões por disciplina deixam a avaliação curta e variada.
        per_subject: dict[str, int] = defaultdict(int)
        selected = []
        for row in rows:
            if per_subject[row["subject_id"]] >= 2:
                continue
            selected.append(row)
            per_subject[row["subject_id"]] += 1
            if len(selected) >= 8:
                break
        if not selected:
            raise HTTPException(status_code=409, detail="Ainda não há questões publicadas para a avaliação diagnóstica.")
        session = (
            db.table("diagnostic_sessions")
            .insert({"student_id": user["id"], "question_ids": [row["id"] for row in selected]})
            .execute()
            .data[0]
        )
        questions = selected
    else:
        question_ids = session.get("question_ids") or []
        questions = (
            db.table("questions")
            .select("id,subject_id,topic,difficulty,question,options,correct_index,explanation,subjects(name)")
            .in_("id", question_ids)
            .execute()
            .data
            if question_ids
            else []
        )
    answers = (
        db.table("diagnostic_answers")
        .select("question_id")
        .eq("session_id", session["id"])
        .eq("student_id", user["id"])
        .execute()
        .data
    )
    return {
        "status": "open",
        "session_id": session["id"],
        "answered_question_ids": [row["question_id"] for row in answers],
        "questions": [hide_question_solution(serialize_question(row)) for row in questions],
    }


@app.post("/student/diagnostic/{question_id}/answer")
def answer_student_diagnostic(
    question_id: uuid.UUID,
    payload: DiagnosticAnswerRequest,
    user: dict = Depends(require_role("student")),
):
    """Registra a medição sem entregar o gabarito durante a avaliação."""

    db = database()
    enforce_api_rate_limit(db, user["id"], "diagnostic_answer")
    session = open_diagnostic_session(db, user["id"])
    if not session or str(question_id) not in (session.get("question_ids") or []):
        raise HTTPException(status_code=404, detail="Questão não pertence à avaliação atual.")
    previous = (
        db.table("diagnostic_answers")
        .select("id")
        .eq("session_id", session["id"])
        .eq("question_id", str(question_id))
        .limit(1)
        .execute()
        .data
    )
    if previous:
        raise HTTPException(status_code=409, detail="Esta questão já foi respondida.")
    question_rows = (
        db.table("questions")
        .select("correct_index")
        .eq("id", str(question_id))
        .eq("status", "published")
        .limit(1)
        .execute()
        .data
    )
    if not question_rows:
        raise HTTPException(status_code=404, detail="Questão não encontrada.")
    db.table("diagnostic_answers").insert(
        {
            "session_id": session["id"],
            "student_id": user["id"],
            "question_id": str(question_id),
            "selected_index": payload.selected_index,
            "correct": payload.selected_index == question_rows[0]["correct_index"],
            "response_time_seconds": payload.response_time_seconds,
        }
    ).execute()
    answered = (
        db.table("diagnostic_answers")
        .select("id", count="exact")
        .eq("session_id", session["id"])
        .execute()
        .count
        or 0
    )
    return {"saved": True, "answered": answered, "total": len(session.get("question_ids") or [])}


@app.post("/student/diagnostic/complete")
def complete_student_diagnostic(user: dict = Depends(require_role("student"))):
    """Fecha a avaliação só depois de todas as respostas e devolve o mapa real."""

    db = database()
    session = open_diagnostic_session(db, user["id"])
    if not session:
        raise HTTPException(status_code=409, detail="Não existe avaliação diagnóstica em andamento.")
    answer_count = (
        db.table("diagnostic_answers")
        .select("id", count="exact")
        .eq("session_id", session["id"])
        .execute()
        .count
        or 0
    )
    question_count = len(session.get("question_ids") or [])
    if not question_count or answer_count < question_count:
        raise HTTPException(status_code=409, detail="Responda todas as questões antes de concluir.")
    completed_at = datetime.now(timezone.utc).isoformat()
    db.table("diagnostic_sessions").update(
        {"status": "completed", "completed_at": completed_at}
    ).eq("id", session["id"]).eq("student_id", user["id"]).execute()
    mastery, recommendations = student_mastery_data(db, user["id"])
    return {
        "status": "completed",
        "completed_at": completed_at,
        "mastery": mastery,
        "recommendations": recommendations,
    }


@app.get("/student/lessons/{lesson_id}")
def student_lesson(lesson_id: uuid.UUID, user: dict = Depends(require_role("student"))):
    """Abre uma aula somente quando a disciplina pertence ao estudante."""

    db = database()
    rows = (
        db.table("lessons")
        .select("id,module_id,title,position,estimated_minutes,summary,content,learning_objectives,published,modules!inner(subject_id,title,subjects(name))")
        .eq("id", str(lesson_id))
        .eq("published", True)
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Aula não encontrada.")
    subject_id = rows[0]["modules"]["subject_id"]
    enrollment = (
        db.table("enrollments")
        .select("student_id")
        .eq("student_id", user["id"])
        .eq("subject_id", subject_id)
        .limit(1)
        .execute()
        .data
    )
    if not enrollment:
        raise HTTPException(status_code=404, detail="Aula não encontrada.")
    progress = (
        db.table("lesson_progress")
        .select("completed,time_seconds,last_accessed_at")
        .eq("student_id", user["id"])
        .eq("lesson_id", str(lesson_id))
        .limit(1)
        .execute()
        .data
    )
    required_exercises = student_required_exercises(db, user["id"], str(lesson_id))
    return {
        **rows[0],
        "progress": progress[0] if progress else {"completed": False, "time_seconds": 0},
        "required_exercises": required_exercises,
    }


def student_required_exercises(db: Client, student_id: str, lesson_id: str) -> list[dict[str, Any]]:
    """Expõe a questão sem gabarito e o estado confirmado do checklist."""

    links = (
        db.table("lesson_required_exercises")
        .select("question_id,position,questions!inner(id,topic,difficulty,question,options,correct_index,explanation,status)")
        .eq("lesson_id", lesson_id)
        .eq("questions.status", "published")
        .order("position")
        .execute()
        .data
    )
    question_ids = [row["question_id"] for row in links]
    if not question_ids:
        return []
    attempted = {
        row["question_id"]
        for row in (
            db.table("question_attempts")
            .select("question_id")
            .eq("student_id", student_id)
            .in_("question_id", question_ids)
            .execute()
            .data
        )
    }
    completed = {
        row["question_id"]
        for row in (
            db.table("lesson_exercise_completions")
            .select("question_id")
            .eq("student_id", student_id)
            .eq("lesson_id", lesson_id)
            .in_("question_id", question_ids)
            .execute()
            .data
        )
    }
    return [
        {
            "id": row["question_id"],
            "position": row["position"],
            **hide_question_solution(serialize_question(row["questions"])),
            "answered": row["question_id"] in attempted,
            "checked": row["question_id"] in completed,
        }
        for row in links
    ]


def lesson_requirements_complete(required_exercises: list[dict[str, Any]]) -> bool:
    """A ausência de exercícios não bloqueia aulas antigas; os configurados bloqueiam."""

    return all(exercise.get("checked") for exercise in required_exercises)


@app.put("/student/lessons/{lesson_id}/progress")
def update_student_lesson_progress(
    lesson_id: uuid.UUID,
    payload: LessonProgressUpdate,
    user: dict = Depends(require_role("student")),
):
    """Salva apenas o progresso da pessoa dona da sessão."""

    db = database()
    enforce_api_rate_limit(db, user["id"], "lesson_progress")
    lesson = student_lesson(lesson_id, user)
    previous = lesson["progress"]
    if payload.completed and not lesson_requirements_complete(lesson["required_exercises"]):
        raise HTTPException(
            status_code=409,
            detail="Conclua e confirme todos os exercícios obrigatórios antes de avançar.",
        )
    values = {
        "student_id": user["id"],
        "lesson_id": str(lesson_id),
        "completed": bool(payload.completed or previous.get("completed")),
        "time_seconds": max(int(previous.get("time_seconds", 0)), payload.time_seconds),
        "last_accessed_at": datetime.now(timezone.utc).isoformat(),
    }
    return db.table("lesson_progress").upsert(values, on_conflict="student_id,lesson_id").execute().data[0]


@app.post("/student/lessons/{lesson_id}/required-exercises/{question_id}/complete")
def complete_required_exercise(
    lesson_id: uuid.UUID,
    question_id: uuid.UUID,
    user: dict = Depends(require_role("student")),
):
    """Confirma o check somente após encontrar uma tentativa real no banco."""

    db = database()
    enforce_api_rate_limit(db, user["id"], "lesson_progress")
    lesson = student_lesson(lesson_id, user)
    required = next((item for item in lesson["required_exercises"] if item["id"] == str(question_id)), None)
    if not required:
        raise HTTPException(status_code=404, detail="Exercício obrigatório não encontrado nesta aula.")
    if not required["answered"]:
        raise HTTPException(status_code=409, detail="Responda o exercício antes de marcá-lo como concluído.")
    saved = (
        db.table("lesson_exercise_completions")
        .upsert(
            {
                "student_id": user["id"],
                "lesson_id": str(lesson_id),
                "question_id": str(question_id),
                "completed_at": datetime.now(timezone.utc).isoformat(),
            },
            on_conflict="student_id,lesson_id,question_id",
        )
        .execute()
        .data[0]
    )
    updated = [{**item, "checked": item["checked"] or item["id"] == str(question_id)} for item in lesson["required_exercises"]]
    return {"completion": saved, "required_complete": lesson_requirements_complete(updated)}


@app.get("/student/gamification")
def student_gamification(response: Response, user: dict = Depends(require_role("student"))):
    """Calcula a jornada usando apenas a atividade do estudante autenticado."""

    response.headers["Cache-Control"] = "no-store"
    if not supabase_configured():
        return build_gamification_summary(
            completed_lessons=2,
            correct_answers=12,
            attempts=15,
            active_days=4,
            current_streak=3,
        )
    db = database()
    enforce_api_rate_limit(db, user["id"], "leaderboard_read")
    return build_student_gamification(db, user["id"])


def build_student_gamification(db: Client, student_id: str) -> dict[str, object]:
    """Centraliza o cálculo usado pelo painel e pela validação da insígnia."""
    return persistent_summary(db, student_id)


@app.put("/student/profile-personalization")
def update_student_profile_personalization(
    personalization: StudentProfilePersonalization,
    user: dict = Depends(require_role("student")),
):
    """Salva somente no perfil atual e recusa uma insígnia ainda bloqueada."""

    db = database()
    enforce_api_rate_limit(db, user["id"], "profile_personalization")
    summary = build_student_gamification(db, user["id"])
    if not can_feature_achievement(summary, personalization.featured_badge_id):
        raise HTTPException(
            status_code=400,
            detail="Essa insígnia ainda não foi desbloqueada.",
        )
    values = {
        "avatar_key": personalization.avatar_key,
        "featured_badge_id": personalization.featured_badge_id,
        "accent_theme": personalization.accent_theme,
        "profile_setup_complete": True,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    updated = (
        db.table("profiles")
        .update(values)
        .eq("id", user["id"])
        .execute()
        .data
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Perfil não encontrado.")
    return values


@app.get("/teacher/students")
def teacher_students(user: TeacherUser):
    """Lista apenas estudantes matriculados na disciplina do professor atual."""

    if not supabase_configured():
        return [{"name": "Ana Souza", "subject": "Matemática", "time_minutes": 155, "difficulty": "Alta"}]
    db = database()
    assignment = db.table("teacher_subjects").select("subject_id,subjects(name)").eq("teacher_id", user["id"]).limit(1).execute().data
    if not assignment:
        return []
    subject_id = assignment[0]["subject_id"]
    subject_name = (assignment[0].get("subjects") or {}).get("name", "Disciplina")
    enrollments = db.table("enrollments").select("student_id").eq("subject_id", subject_id).execute().data
    ids = [item["student_id"] for item in enrollments]
    if not ids:
        return []
    profiles = db.table("profiles").select("id,full_name,grade").in_("id", ids).execute().data
    return [{**profile, "subject": subject_name} for profile in profiles]


@app.get("/teacher/difficulty-alerts")
def teacher_difficulty_alerts(user: TeacherUser):
    """Devolve ao professor somente alertas ativos da própria disciplina."""

    if not supabase_configured():
        return [{"id": "demo-alert", "student_name": "Ana Souza", "subject": "Matemática", "topic": "Frações", "accuracy": 40, "attempts": 5, "status": "active"}]
    db = database()
    assignment = db.table("teacher_subjects").select("subject_id,subjects(name)").eq("teacher_id", user["id"]).limit(1).execute().data
    if not assignment:
        return []
    subject_id = assignment[0]["subject_id"]
    subject_name = (assignment[0].get("subjects") or {}).get("name", "Disciplina")
    alerts = (
        db.table("difficulty_alerts")
        .select("id,student_id,topic,accuracy,attempts,status,opened_at,updated_at")
        .eq("teacher_id", user["id"])
        .eq("subject_id", subject_id)
        .eq("status", "active")
        .order("updated_at", desc=True)
        .limit(100)
        .execute()
        .data
    )
    if not alerts:
        return []
    student_ids = list({alert["student_id"] for alert in alerts})
    profiles = db.table("profiles").select("id,full_name,grade").in_("id", student_ids).execute().data
    students_by_id = {profile["id"]: profile for profile in profiles}
    return [
        {
            **alert,
            "student_name": students_by_id.get(alert["student_id"], {}).get("full_name", "Estudante"),
            "student_grade": students_by_id.get(alert["student_id"], {}).get("grade", ""),
            "subject": subject_name,
        }
        for alert in alerts
    ]


@app.get("/teacher/overview")
def teacher_overview(user: TeacherUser):
    """Entrega os indicadores principais somente da disciplina atribuída."""

    db = database()
    assignment = teacher_assignment(db, user["id"])
    classes = db.table("classes").select("id").eq("teacher_id", user["id"]).execute().data
    class_ids = [row["id"] for row in classes]
    memberships = db.table("class_students").select("student_id").in_("class_id", class_ids).execute().data if class_ids else []
    student_ids = list({row["student_id"] for row in memberships})
    summaries = teacher_student_summaries(db, assignment["subject_id"], student_ids)
    attempts = sum(student["attempts"] for student in summaries)
    weighted_accuracy = round(
        sum(student["accuracy"] * student["attempts"] for student in summaries) / attempts,
        1,
    ) if attempts else 0
    alert_count = (
        db.table("difficulty_alerts")
        .select("id", count="exact")
        .eq("teacher_id", user["id"])
        .eq("subject_id", assignment["subject_id"])
        .eq("status", "active")
        .execute()
        .count
        or 0
    )
    return {
        "subject": assignment["subject"],
        "class_count": len(classes),
        "student_count": len(student_ids),
        "active_alerts": alert_count,
        "average_accuracy": weighted_accuracy,
    }


@app.get("/teacher/classes")
def list_teacher_classes(user: TeacherUser):
    """Lista apenas turmas criadas pelo professor atual."""

    db = database()
    assignment = teacher_assignment(db, user["id"])
    classes = (
        db.table("classes")
        .select("id,name,school_year,created_at")
        .eq("teacher_id", user["id"])
        .eq("subject_id", assignment["subject_id"])
        .order("created_at")
        .execute()
        .data
    )
    class_ids = [row["id"] for row in classes]
    memberships = db.table("class_students").select("class_id").in_("class_id", class_ids).execute().data if class_ids else []
    counts: dict[str, int] = defaultdict(int)
    for membership in memberships:
        counts[membership["class_id"]] += 1
    return [{**row, "subject": assignment["subject"], "student_count": counts[row["id"]]} for row in classes]


@app.post("/teacher/classes", status_code=201)
def create_teacher_class(request: Request, payload: TeacherClassCreate, user: TeacherUser):
    """Cria uma turma já presa à disciplina do professor autenticado."""

    db = database()
    assignment = teacher_assignment(db, user["id"])
    enforce_api_rate_limit(db, user["id"], "teacher_class_write")
    duplicate = (
        db.table("classes")
        .select("id")
        .eq("teacher_id", user["id"])
        .eq("name", payload.name)
        .eq("school_year", payload.school_year)
        .limit(1)
        .execute()
        .data
    )
    if duplicate:
        raise HTTPException(status_code=409, detail="Já existe uma turma com esse nome e ano.")
    created = (
        db.table("classes")
        .insert(
            {
                "teacher_id": user["id"],
                "subject_id": assignment["subject_id"],
                "name": payload.name,
                "school_year": payload.school_year,
            }
        )
        .execute()
        .data[0]
    )
    request.state.audit_resource_id = created["id"]
    return {**created, "subject": assignment["subject"], "student_count": 0}


@app.get("/teacher/classes/{class_id}")
def teacher_class_detail(class_id: str, user: TeacherUser):
    """Mostra estudantes e indicadores da turma, sempre em modo somente leitura."""

    db = database()
    classroom = owned_teacher_class(db, user["id"], class_id)
    memberships = db.table("class_students").select("student_id").eq("class_id", class_id).execute().data
    students = teacher_student_summaries(db, classroom["subject_id"], [row["student_id"] for row in memberships])
    class_attempts = [attempt for student in students for attempt in student["recent_attempts"]]
    return {
        "id": classroom["id"],
        "name": classroom["name"],
        "school_year": classroom["school_year"],
        "subject": (classroom.get("subjects") or {}).get("name", "Disciplina"),
        "student_count": len(students),
        "students": students,
        "trend": build_difficulty_trend(class_attempts),
    }


@app.post("/teacher/classes/{class_id}/students", status_code=201)
def add_class_student(request: Request, class_id: str, payload: ClassStudentCreate, user: TeacherUser):
    """Organiza a turma sem dar acesso para editar qualquer dado pedagógico."""

    db = database()
    classroom = owned_teacher_class(db, user["id"], class_id)
    enforce_api_rate_limit(db, user["id"], "teacher_class_write")
    profiles = (
        db.table("profiles")
        .select("id,full_name,grade,email,role")
        .eq("email", payload.student_email.lower())
        .eq("role", "student")
        .limit(1)
        .execute()
        .data
    )
    if not profiles:
        raise HTTPException(status_code=404, detail="Estudante não encontrado.")
    student = profiles[0]
    enrollment = (
        db.table("enrollments")
        .select("student_id")
        .eq("student_id", student["id"])
        .eq("subject_id", classroom["subject_id"])
        .limit(1)
        .execute()
        .data
    )
    if not enrollment:
        raise HTTPException(status_code=409, detail="Estudante não está matriculado nesta disciplina.")
    existing = db.table("class_students").select("student_id").eq("class_id", class_id).eq("student_id", student["id"]).limit(1).execute().data
    if existing:
        raise HTTPException(status_code=409, detail="Estudante já participa desta turma.")
    db.table("class_students").insert({"class_id": class_id, "student_id": student["id"]}).execute()
    request.state.audit_resource_id = student["id"]
    request.state.audit_metadata = {"class_id": class_id, "student_id": student["id"]}
    return {"id": student["id"], "full_name": student["full_name"], "grade": student["grade"]}


@app.delete("/teacher/classes/{class_id}/students/{student_id}", status_code=204)
def remove_class_student(class_id: str, student_id: str, user: TeacherUser):
    """Remove só o vínculo com a turma; histórico e perfil ficam intactos."""

    db = database()
    owned_teacher_class(db, user["id"], class_id)
    enforce_api_rate_limit(db, user["id"], "teacher_class_write")
    membership = db.table("class_students").select("student_id").eq("class_id", class_id).eq("student_id", student_id).limit(1).execute().data
    if not membership:
        raise HTTPException(status_code=404, detail="Estudante não está nesta turma.")
    db.table("class_students").delete().eq("class_id", class_id).eq("student_id", student_id).execute()
    return Response(status_code=204)


@app.get("/teacher/classes/{class_id}/students/{student_id}/history")
def teacher_student_history(class_id: str, student_id: str, user: TeacherUser):
    """Fecha a rota por turma e estudante antes de devolver qualquer histórico."""

    db = database()
    classroom = owned_teacher_class(db, user["id"], class_id)
    membership = db.table("class_students").select("student_id").eq("class_id", class_id).eq("student_id", student_id).limit(1).execute().data
    if not membership:
        raise HTTPException(status_code=404, detail="Estudante não encontrado nesta turma.")
    summaries = teacher_student_summaries(db, classroom["subject_id"], [student_id])
    if not summaries:
        raise HTTPException(status_code=404, detail="Estudante não encontrado.")
    return summaries[0]


@app.get("/teacher/reports/export")
def export_teacher_report(request: Request, class_id: str, user: TeacherUser, student_id: str | None = Query(default=None)):
    """Exporta a turma ou um aluno dela, sempre dentro da disciplina autorizada."""

    db = database()
    classroom = owned_teacher_class(db, user["id"], class_id)
    memberships = db.table("class_students").select("student_id").eq("class_id", class_id).execute().data
    member_ids = [row["student_id"] for row in memberships]
    if student_id and student_id not in member_ids:
        raise HTTPException(status_code=404, detail="Estudante não encontrado nesta turma.")
    request.state.audit_resource_id = student_id or class_id
    request.state.audit_metadata = {"class_id": class_id, "student_id": student_id}
    students = teacher_student_summaries(db, classroom["subject_id"], [student_id] if student_id else member_ids)
    subject_name = (classroom.get("subjects") or {}).get("name", "Disciplina")
    filename = re.sub(r"[^A-Za-z0-9_-]", "-", classroom["name"]).strip("-") or "turma"
    content = "\ufeff" + build_report_csv(subject_name, classroom["name"], students)
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="relatorio-{filename}.csv"'},
    )


@app.get("/teacher/contents")
def list_teacher_contents(user: TeacherUser):
    """Lista materiais cadastrados somente pelo professor atual."""

    db = database()
    assignment = teacher_assignment(db, user["id"])
    return (
        db.table("learning_contents")
        .select("id,title,description,content_type,source_url,created_at")
        .eq("teacher_id", user["id"])
        .eq("subject_id", assignment["subject_id"])
        .order("created_at", desc=True)
        .limit(200)
        .execute()
        .data
    )


@app.post("/teacher/contents", status_code=201)
def create_teacher_content(payload: TeacherContentCreate, user: TeacherUser):
    """Cria material na disciplina atribuída, ignorando qualquer matéria do cliente."""

    db = database()
    assignment = teacher_assignment(db, user["id"])
    enforce_api_rate_limit(db, user["id"], "teacher_content_write")
    return (
        db.table("learning_contents")
        .insert({"teacher_id": user["id"], "subject_id": assignment["subject_id"], **payload.model_dump()})
        .execute()
        .data[0]
    )


@app.post("/teacher/contents/import", status_code=201)
def import_teacher_contents(payload: TeacherContentImport, user: TeacherUser):
    """Importa lotes pequenos e validados, sem aceitar arquivos executáveis."""

    try:
        rows = parse_content_import(payload.content, payload.format)
    except (ValueError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    db = database()
    assignment = teacher_assignment(db, user["id"])
    enforce_api_rate_limit(db, user["id"], "teacher_content_import")
    records = [{"teacher_id": user["id"], "subject_id": assignment["subject_id"], **row} for row in rows]
    created = db.table("learning_contents").insert(records).execute().data
    return {"imported": len(created), "contents": created}


@app.post("/teacher/recommendations")
def generate_teacher_recommendation(payload: RecommendationRequest, user: TeacherUser):
    """Gera orientação pedagógica a partir de métricas, sem enviar dados pessoais."""

    db = database()
    classroom = owned_teacher_class(db, user["id"], payload.class_id)
    memberships = db.table("class_students").select("student_id").eq("class_id", payload.class_id).execute().data
    allowed_ids = [row["student_id"] for row in memberships]
    if payload.student_id and payload.student_id not in allowed_ids:
        raise HTTPException(status_code=404, detail="Estudante não encontrado nesta turma.")
    enforce_api_rate_limit(db, user["id"], "teacher_recommendation")
    selected_ids = [payload.student_id] if payload.student_id else allowed_ids
    summaries = teacher_student_summaries(db, classroom["subject_id"], selected_ids)
    metrics = [
        {
            "accuracy": student["accuracy"],
            "attempts": student["attempts"],
            "difficulty": student["difficulty"],
            "completed_lessons": student["completed_lessons"],
            "topics": [item["topic"] for item in student["difficulties"][:8]],
        }
        for student in summaries
    ]
    try:
        response = openai_client().responses.create(
            model=os.getenv("OPENAI_MODEL", "gpt-5-mini"),
            input=protected_ai_input(
                task="""Crie uma recomendação pedagógica prática, acolhedora e curta.
Não faça diagnóstico médico, não invente dados e não mencione nomes. Priorize intervenções aplicáveis em aula e um conteúdo de reforço.""",
                user_request="Analise as métricas anônimas e proponha a próxima intervenção pedagógica.",
                context={
                    "subject": (classroom.get("subjects") or {}).get("name", "Disciplina"),
                    "metrics": metrics,
                },
            ),
            store=False,
            text={"format": {"type": "json_schema", "name": "pedagogical_recommendation", "strict": True, "schema": RECOMMENDATION_SCHEMA}},
        )
        recommendation = json.loads(response.output_text)
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=502, detail="Não foi possível gerar a recomendação agora.") from error
    saved = (
        db.table("pedagogical_recommendations")
        .insert(
            {
                "teacher_id": user["id"],
                "subject_id": classroom["subject_id"],
                "class_id": payload.class_id,
                "student_id": payload.student_id,
                "recommendation": recommendation,
            }
        )
        .execute()
        .data[0]
    )
    return {**recommendation, "id": saved["id"], "created_at": saved["created_at"]}


@app.get("/admin/overview")
def admin_overview(_admin: dict = Depends(require_role("admin"))):
    """Resume o sistema sem incluir respostas ou dificuldades individuais."""

    db = database()
    profiles = db.table("profiles").select("role").limit(10_000).execute().data
    subjects = db.table("subjects").select("id", count="exact").execute()
    lessons = db.table("lessons").select("id", count="exact").execute()
    questions = db.table("questions").select("status").limit(10_000).execute().data
    return {
        "users": len(profiles),
        "students": sum(1 for row in profiles if row["role"] == "student"),
        "teachers": sum(1 for row in profiles if row["role"] == "teacher"),
        "admins": sum(1 for row in profiles if row["role"] == "admin"),
        "subjects": subjects.count or 0,
        "lessons": lessons.count or 0,
        "questions": len(questions),
        "draft_questions": sum(1 for row in questions if row.get("status") == "draft"),
    }


@app.get("/admin/users")
def list_admin_users(_admin: dict = Depends(require_role("admin"))):
    """Lista perfis operacionais sem consultar senhas ou tokens do Auth."""

    return (
        database()
        .table("profiles")
        .select("id,full_name,email,role,grade,registration_status,created_at")
        .order("created_at", desc=True)
        .limit(500)
        .execute()
        .data
    )


@app.get("/admin/audit-logs")
def list_access_audit_logs(
    days: int = Query(default=7, ge=1, le=7),
    role: Literal["student", "teacher", "admin", "service"] | None = Query(default=None),
    outcome: Literal["success", "denied", "error"] | None = Query(default=None),
    action: str | None = Query(default=None, min_length=3, max_length=100, pattern=r"^(?:[A-Z][A-Z0-9_]+|[a-z][a-z0-9_.]+)$"),
    user_id: uuid.UUID | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=200),
    admin: dict = Depends(require_role("admin")),
):
    """Entrega metadados de auditoria sem revelar rede, token ou payload."""

    db = database()
    enforce_api_rate_limit(db, admin["id"], "admin_audit_read")
    since = datetime.now(timezone.utc) - timedelta(days=days)
    query = (
        db.table("access_audit_logs")
        .select("id,user_id,role,action,resource,resource_id,created_at,metadata,actor_id,actor_role,request_method,route,status_code,outcome,request_id,occurred_at")
        .gte("created_at", since.isoformat())
    )
    if role:
        query = query.eq("role", role)
    if outcome:
        query = query.eq("outcome", outcome)
    if action:
        query = query.eq("action", action)
    if user_id:
        # Histórico de uma pessoa: o que ela fez, dentro da mesma retenção de 7 dias.
        query = query.eq("user_id", str(user_id))
    events = query.order("created_at", desc=True).limit(limit).execute().data

    actor_ids = list({row.get("user_id") or row.get("actor_id") for row in events if row.get("user_id") or row.get("actor_id")})
    profiles = (
        db.table("profiles").select("id,full_name,role").in_("id", actor_ids).execute().data
        if actor_ids
        else []
    )
    profiles_by_id = {row["id"]: row for row in profiles}
    return [
        {
            **event,
            "actor_id": event.get("user_id") or event.get("actor_id"),
            "actor_role": event.get("role") or event.get("actor_role"),
            "occurred_at": event.get("created_at") or event.get("occurred_at"),
            "actor_name": profiles_by_id.get(event.get("user_id") or event.get("actor_id"), {}).get(
                "full_name",
                "Sistema ou tentativa anônima",
            ),
            "actor_role": event.get("actor_role")
            or profiles_by_id.get(event.get("user_id") or event.get("actor_id"), {}).get("role"),
        }
        for event in events
    ]


def admin_subject_catalog(db: Client) -> list[dict[str, Any]]:
    """Carrega a árvore editorial completa para a administração."""

    subjects = db.table("subjects").select("id,name,description,category,created_at").order("name").execute().data
    subject_ids = [row["id"] for row in subjects]
    modules = db.table("modules").select("id,subject_id,title,position").in_("subject_id", subject_ids).order("position").execute().data if subject_ids else []
    module_ids = [row["id"] for row in modules]
    lessons = db.table("lessons").select("id,module_id,title,position,estimated_minutes,summary,content,learning_objectives,published").in_("module_id", module_ids).order("position").execute().data if module_ids else []
    lesson_ids = [row["id"] for row in lessons]
    required_rows = db.table("lesson_required_exercises").select("lesson_id").in_("lesson_id", lesson_ids).execute().data if lesson_ids else []
    required_counts: dict[str, int] = defaultdict(int)
    for required in required_rows:
        required_counts[required["lesson_id"]] += 1
    for lesson in lessons:
        lesson["required_exercise_count"] = required_counts[lesson["id"]]
    lessons_by_module: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for lesson in lessons:
        lessons_by_module[lesson["module_id"]].append(lesson)
    modules_by_subject: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for module in modules:
        modules_by_subject[module["subject_id"]].append({**module, "lessons": lessons_by_module[module["id"]]})
    return [{**subject, "modules": modules_by_subject[subject["id"]]} for subject in subjects]


@app.get("/admin/subjects")
def list_admin_subjects(_admin: dict = Depends(require_role("admin"))):
    return admin_subject_catalog(database())


@app.post("/admin/subjects", status_code=201)
def create_admin_subject(payload: AdminSubjectCreate, admin: dict = Depends(require_role("admin"))):
    """Cria uma disciplina e matricula estudantes pelo gatilho já existente."""

    db = database()
    enforce_api_rate_limit(db, admin["id"], "admin_content_write")
    duplicate = db.table("subjects").select("id").eq("name", payload.name).limit(1).execute().data
    if duplicate:
        raise HTTPException(status_code=409, detail="Já existe uma disciplina com esse nome.")
    return db.table("subjects").insert(payload.model_dump()).execute().data[0]


@app.put("/admin/subjects/{subject_id}")
def update_admin_subject(
    subject_id: uuid.UUID,
    payload: AdminSubjectCreate,
    admin: dict = Depends(require_role("admin")),
):
    db = database()
    enforce_api_rate_limit(db, admin["id"], "admin_content_write")
    updated = db.table("subjects").update(payload.model_dump()).eq("id", str(subject_id)).execute().data
    if not updated:
        raise HTTPException(status_code=404, detail="Disciplina não encontrada.")
    return updated[0]


@app.post("/admin/subjects/{subject_id}/modules", status_code=201)
def create_admin_module(
    subject_id: uuid.UUID,
    payload: AdminModuleCreate,
    admin: dict = Depends(require_role("admin")),
):
    db = database()
    enforce_api_rate_limit(db, admin["id"], "admin_content_write")
    subject = db.table("subjects").select("id").eq("id", str(subject_id)).limit(1).execute().data
    if not subject:
        raise HTTPException(status_code=404, detail="Disciplina não encontrada.")
    return db.table("modules").insert({"subject_id": str(subject_id), **payload.model_dump()}).execute().data[0]


@app.post("/admin/modules/{module_id}/lessons", status_code=201)
def create_admin_lesson(
    module_id: uuid.UUID,
    payload: AdminLessonCreate,
    admin: dict = Depends(require_role("admin")),
):
    db = database()
    enforce_api_rate_limit(db, admin["id"], "admin_content_write")
    module = db.table("modules").select("id").eq("id", str(module_id)).limit(1).execute().data
    if not module:
        raise HTTPException(status_code=404, detail="Módulo não encontrado.")
    return db.table("lessons").insert({"module_id": str(module_id), **payload.model_dump()}).execute().data[0]


@app.put("/admin/lessons/{lesson_id}")
def update_admin_lesson(
    lesson_id: uuid.UUID,
    payload: AdminLessonCreate,
    admin: dict = Depends(require_role("admin")),
):
    """Edita ou despublica a aula sem apagar histórico do estudante."""

    db = database()
    enforce_api_rate_limit(db, admin["id"], "admin_content_write")
    updated = db.table("lessons").update(payload.model_dump()).eq("id", str(lesson_id)).execute().data
    if not updated:
        raise HTTPException(status_code=404, detail="Aula não encontrada.")
    return updated[0]


def admin_lesson_required_exercises(db: Client, lesson_id: uuid.UUID) -> dict[str, Any]:
    """Carrega apenas questões publicadas da mesma disciplina da aula."""

    lesson_rows = (
        db.table("lessons")
        .select("id,modules!inner(subject_id)")
        .eq("id", str(lesson_id))
        .limit(1)
        .execute()
        .data
    )
    if not lesson_rows:
        raise HTTPException(status_code=404, detail="Aula não encontrada.")
    subject_id = lesson_rows[0]["modules"]["subject_id"]
    selected = (
        db.table("lesson_required_exercises")
        .select("question_id,position")
        .eq("lesson_id", str(lesson_id))
        .order("position")
        .execute()
        .data
    )
    questions = (
        db.table("questions")
        .select("id,topic,difficulty,question")
        .eq("subject_id", subject_id)
        .eq("status", "published")
        .order("created_at", desc=True)
        .limit(100)
        .execute()
        .data
    )
    return {"selected_question_ids": [row["question_id"] for row in selected], "questions": questions}


@app.get("/admin/lessons/{lesson_id}/mandatory-exercises")
def get_admin_lesson_required_exercises(lesson_id: uuid.UUID, _admin: dict = Depends(require_role("admin"))):
    return admin_lesson_required_exercises(database(), lesson_id)


@app.put("/admin/lessons/{lesson_id}/mandatory-exercises")
def set_admin_lesson_required_exercises(
    lesson_id: uuid.UUID,
    payload: MandatoryExercisesUpdate,
    admin: dict = Depends(require_role("admin")),
):
    """Substitui a lista, sempre dentro da disciplina que contém a aula."""

    db = database()
    enforce_api_rate_limit(db, admin["id"], "admin_content_write")
    configuration = admin_lesson_required_exercises(db, lesson_id)
    allowed_ids = {question["id"] for question in configuration["questions"]}
    requested_ids = [str(question_id) for question_id in payload.question_ids]
    if any(question_id not in allowed_ids for question_id in requested_ids):
        raise HTTPException(status_code=422, detail="Selecione apenas questões publicadas da disciplina desta aula.")
    db.table("lesson_required_exercises").delete().eq("lesson_id", str(lesson_id)).execute()
    if requested_ids:
        db.table("lesson_required_exercises").insert(
            [{"lesson_id": str(lesson_id), "question_id": question_id, "position": index + 1} for index, question_id in enumerate(requested_ids)]
        ).execute()
    return admin_lesson_required_exercises(db, lesson_id)


@app.get("/admin/contents")
def list_admin_contents(_admin: dict = Depends(require_role("admin"))):
    """Mostra aulas oficiais e materiais enviados por professores."""

    db = database()
    lessons = db.table("lessons").select("id,title,summary,published,modules(title,subjects(name))").order("title").limit(1000).execute().data
    materials = db.table("learning_contents").select("id,title,description,content_type,source_url,created_at,subjects(name),profiles!learning_contents_teacher_id_fkey(full_name)").order("created_at", desc=True).limit(1000).execute().data
    return {"lessons": lessons, "teacher_materials": materials}


@app.get("/admin/teacher-requests")
def list_teacher_registration_requests(_admin: dict = Depends(require_role("admin"))):
    """Lista solicitações sem expor senhas, tokens ou metadados de autenticação."""

    if not supabase_configured():
        return []
    return (
        database()
        .table("profiles")
        .select("id,email,full_name,requested_subject,created_at")
        .eq("requested_role", "teacher")
        .eq("registration_status", "pending_teacher")
        .order("created_at")
        .limit(100)
        .execute()
        .data
    )


@app.post("/admin/teacher-requests/{user_id}/approve")
def approve_teacher_registration(
    request: Request,
    user_id: uuid.UUID,
    payload: TeacherApproval,
    _admin: dict = Depends(require_role("admin")),
):
    """Promove a solicitação em uma transação que também prende a disciplina."""

    db = database()
    enforce_api_rate_limit(db, _admin["id"], "admin_user_write")
    request_rows = (
        db.table("profiles")
        .select("id,email,full_name,registration_status")
        .eq("id", str(user_id))
        .eq("requested_role", "teacher")
        .eq("registration_status", "pending_teacher")
        .limit(1)
        .execute()
        .data
    )
    if not request_rows:
        raise HTTPException(status_code=404, detail="Solicitação de professor não encontrada.")

    subject_rows = db.table("subjects").select("id").eq("name", payload.subject).limit(1).execute().data
    if not subject_rows:
        raise HTTPException(status_code=404, detail="Disciplina não encontrada.")
    assigned = db.table("teacher_subjects").select("teacher_id").eq("subject_id", subject_rows[0]["id"]).limit(1).execute().data
    if assigned:
        raise HTTPException(status_code=409, detail="Esta disciplina já possui professor.")

    try:
        # A função SQL atualiza perfil e vínculo juntos. Assim não sobra uma conta
        # de professor sem matéria se duas aprovações acontecerem ao mesmo tempo.
        approved = (
            db.rpc(
                "approve_teacher_registration",
                {"target_user_id": str(user_id), "approved_subject_name": payload.subject},
            )
            .execute()
            .data
        )
    except Exception as error:
        raise HTTPException(status_code=409, detail="Não foi possível aprovar esta solicitação.") from error
    if not approved:
        raise HTTPException(status_code=409, detail="Não foi possível aprovar esta solicitação.")
    request.state.audit_resource_id = str(user_id)
    return approved[0]


@app.post("/admin/users")
def create_user(request: Request, payload: UserCreate, _admin: dict = Depends(require_role("admin"))):
    """Cria uma conta e atribui a disciplina antes de liberar um professor."""

    if payload.role not in {"student", "teacher"}:
        raise HTTPException(status_code=400, detail="O cargo deve ser student ou teacher.")
    if not supabase_configured():
        return {"name": payload.name, "email": payload.email, "role": payload.role, "subject": payload.subject}
    db = database()
    enforce_api_rate_limit(db, _admin["id"], "admin_user_write")
    subject_id: str | None = None
    if payload.role == "teacher":
        subject_rows = db.table("subjects").select("id").eq("name", payload.subject).limit(1).execute().data
        if not subject_rows:
            raise HTTPException(status_code=404, detail="Disciplina não encontrada.")
        subject_id = subject_rows[0]["id"]
        assigned = db.table("teacher_subjects").select("teacher_id").eq("subject_id", subject_id).limit(1).execute().data
        if assigned:
            raise HTTPException(status_code=409, detail="Esta disciplina já possui professor.")
    created_user_id: str | None = None
    try:
        created = db.auth.admin.create_user({"email": str(payload.email), "password": payload.password, "email_confirm": True, "user_metadata": {"full_name": payload.name}, "app_metadata": {"account_origin": "admin_provisioned"}})
        if not created.user:
            raise ValueError("User was not created")
        created_user_id = str(created.user.id)
        request.state.audit_resource_id = created_user_id
        db.table("profiles").update({"full_name": payload.name, "role": payload.role}).eq("id", created_user_id).execute()
        if payload.role == "teacher" and subject_id:
            db.table("teacher_subjects").insert({"teacher_id": created_user_id, "subject_id": subject_id}).execute()
        return {"id": created_user_id, "name": payload.name, "email": payload.email, "role": payload.role, "subject": payload.subject}
    except Exception as error:
        if created_user_id:
            # Se algo falhar no vínculo, removemos a conta incompleta para ela não
            # virar uma estudante sem querer ou uma professora sem disciplina.
            try:
                db.auth.admin.delete_user(created_user_id)
            except Exception as cleanup_error:
                logger.error(
                    "Não foi possível remover a conta incompleta após falha no cadastro: %s",
                    type(cleanup_error).__name__,
                )
        raise HTTPException(status_code=400, detail="Não foi possível criar o usuário. Verifique se o e-mail já está cadastrado.") from error


@app.post("/internal/weekly-difficulty-summary")
def send_weekly_difficulty_summary(
    request: Request,
    _secret: None = Depends(require_weekly_summary_secret),
):
    """Processa a semana anterior antes de qualquer limpeza de retenção."""
    from email_delivery import run_weekly_summary

    if not supabase_configured():
        raise HTTPException(status_code=503, detail="Supabase ainda não está configurado no backend.")
    request.state.audit_actor_role = "service"
    try:
        result = run_weekly_summary(database(), panel_url=os.getenv("EMAIL_PANEL_URL", ""))
    except ValueError as error:
        raise HTTPException(status_code=503, detail="Configuração RF22 inválida no backend.") from error
    request.state.audit_metadata = result
    return result


register_admin_panel_routes(
    app,
    database=database,
    admin_dependency=require_role("admin"),
    enforce_limit=enforce_api_rate_limit,
    identity_hash=lambda email: rate_limit_hash("identity", normalize_login_email(email)),
)

# Direitos do titular continuam disponíveis mesmo antes do aceite da política.
register_notification_routes(
    app,
    database=database,
    teacher_dependency=require_role("teacher"),
    enforce_limit=enforce_api_rate_limit,
)

register_privacy_routes(
    app,
    database=database,
    user_dependency=current_user_pending_privacy,
    admin_dependency=require_role("admin"),
    enforce_limit=enforce_api_rate_limit,
    identity_hash=lambda email: rate_limit_hash("identity", normalize_login_email(email)),
)

register_lifecycle_routes(
    app,
    database=database,
    user_dependency=current_user_pending_privacy,
    admin_dependency=require_role("admin"),
    enforce_limit=enforce_api_rate_limit,
    retention_secret=lambda: os.getenv("ACCOUNT_RETENTION_CRON_SECRET"),
    retention_enabled=lambda: os.getenv("ACCOUNT_RETENTION_ENABLED", "false").lower() == "true",
)

register_leaderboard_routes(
    app,
    database=database,
    student_dependency=require_role("student"),
    teacher_dependency=require_role("teacher"),
    enforce_limit=enforce_api_rate_limit,
)
