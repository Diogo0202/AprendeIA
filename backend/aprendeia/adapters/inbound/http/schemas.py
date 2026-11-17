"""Contratos de entrada da API: formato e limites de cada corpo de requisição."""

import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from aprendeia.domain.ai_security import guard_ai_text
from aprendeia.domain.communication_rules import validate_message_body
from aprendeia.domain.legal_documents import validate_legal_document_version
from aprendeia.domain.login_protection import normalize_login_email, password_policy_error
from aprendeia.domain.text import sanitize_prompt_value

EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
Difficulty = Literal["basic", "intermediate", "advanced"]


def _has_control_characters(value: str, *, allowed: str = "") -> bool:
    return any(ord(character) < 32 and character not in allowed for character in value)


class LoginRequest(BaseModel):
    """Credenciais curtas aceitas somente pelo endpoint protegido de login."""

    email: str = Field(min_length=5, max_length=254, pattern=EMAIL_PATTERN)
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
    email: str = Field(min_length=5, max_length=254, pattern=EMAIL_PATTERN)
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

    policy_version: str
    terms_version: str

    @field_validator("policy_version", "terms_version")
    @classmethod
    def legal_version_format(cls, value: str) -> str:
        return validate_legal_document_version(value)


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


class DiagnosticAnswerRequest(AnswerRequest):
    """Resposta diagnóstica com o mesmo limite usado na prática comum."""


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

    student_email: str = Field(min_length=5, max_length=254, pattern=EMAIL_PATTERN)


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


class TeacherQuestionReview(BaseModel):
    """Campos que o professor pode revisar antes de publicar uma questão."""

    topic: str = Field(min_length=2, max_length=100)
    difficulty: Difficulty
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


class AdminAccountDeletion(BaseModel):
    """A confirmação digitada e o motivo evitam exclusão por clique acidental."""

    model_config = ConfigDict(extra="forbid")

    confirmation: Literal["EXCLUIR"]
    reason: str = Field(min_length=5, max_length=300)

    @field_validator("reason")
    @classmethod
    def strip_reason(cls, value: str) -> str:
        value = " ".join(value.split())
        if len(value) < 5:
            raise ValueError("Informe o motivo com pelo menos 5 caracteres.")
        return value


class NotificationPreferences(BaseModel):
    """As duas escolhas são obrigatórias para evitar desligar algo por omissão."""

    model_config = ConfigDict(extra="forbid")

    email_difficulty_alerts: bool
    email_weekly_summary: bool


class ProfileCorrections(BaseModel):
    """Só campos de apresentação podem ser corrigidos por este fluxo."""

    model_config = ConfigDict(extra="forbid")
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    grade: str | None = Field(default=None, max_length=60)
    goal: str | None = Field(default=None, max_length=500)

    @field_validator("full_name", "grade", "goal")
    @classmethod
    def clean_text(cls, value: str | None) -> str | None:
        if value is not None and _has_control_characters(value):
            raise ValueError("Não inclua caracteres de controle.")
        return value.strip() if value is not None else None

    @field_validator("full_name")
    @classmethod
    def valid_name(cls, value: str | None) -> str | None:
        if value is not None and len(value) < 2:
            raise ValueError("O nome precisa de pelo menos dois caracteres.")
        return value


class PrivacyRequestCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal[
        "access", "correction", "anonymization", "deletion",
        "confirmation", "sharing", "opposition", "revocation", "portability", "automated_review",
    ]
    details: str = Field(default="", max_length=1000)
    corrections: ProfileCorrections | None = None

    @model_validator(mode="after")
    def validate_corrections(self):
        if (self.kind == "correction") != bool(self.correction_values()):
            raise ValueError("Informe campos de perfil somente em um pedido de correção.")
        if _has_control_characters(self.details, allowed="\n\t"):
            raise ValueError("Detalhamento contém caracteres de controle.")
        return self

    def correction_values(self) -> dict:
        return self.corrections.model_dump(exclude_none=True) if self.corrections else {}


class PrivacyRequestResolve(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decision: Literal["complete", "reject"]
    response: str = Field(min_length=2, max_length=1000)
    confirmation: str = Field(default="", max_length=20)

    @field_validator("response")
    @classmethod
    def valid_response(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 2 or _has_control_characters(value, allowed="\n\t"):
            raise ValueError("Escreva uma resposta válida para o titular.")
        return value


class AgeDeclaration(BaseModel):
    model_config = ConfigDict(extra="forbid")
    age_band: Literal["adult", "minor", "unknown"]


class AdmissionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    responsible_name: str = Field(min_length=2, max_length=120)
    responsible_contact: str = Field(min_length=3, max_length=200)
    institutional_reference: str = Field(min_length=2, max_length=200)
    version: Literal["1"]

    @field_validator("responsible_name", "responsible_contact", "institutional_reference")
    @classmethod
    def clean(cls, value: str) -> str:
        if _has_control_characters(value):
            raise ValueError("Caracteres de controle não são aceitos.")
        return value


class AdmissionReview(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    decision: Literal["approved", "rejected"]
    version: Literal["1"]
    note: str = Field(min_length=2, max_length=500)
