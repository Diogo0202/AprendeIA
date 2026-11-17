"""Adaptador OpenAI do tutor: saída estruturada e nenhum dado guardado no provedor."""

import json
import uuid
from typing import Any

from openai import OpenAI

from aprendeia.config import settings
from aprendeia.domain.ai_security import protected_ai_input
from aprendeia.domain.errors import ServiceUnavailable

Row = dict[str, Any]

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

QUESTION_TASK = """Crie uma questão objetiva de múltipla escolha para reforço escolar.
A questão deve ser pedagogicamente correta, apropriada para estudantes, ter quatro alternativas plausíveis e uma explicação curta. Não use dados pessoais."""

RECOMMENDATION_TASK = """Crie uma recomendação pedagógica prática, acolhedora e curta.
Não faça diagnóstico médico, não invente dados e não mencione nomes. Priorize intervenções aplicáveis em aula e um conteúdo de reforço."""


def openai_client() -> OpenAI:
    """Entrega o cliente OpenAI apenas quando a chave está configurada."""

    if not settings.openai_configured():
        raise ServiceUnavailable("A integração de IA ainda não está configurada.")
    return OpenAI()


def _structured_response(*, schema_name: str, schema: Row, prompt: Any) -> Row:
    """Uma chamada sem armazenamento no provedor, validada por JSON Schema estrito."""

    response = openai_client().responses.create(
        model=settings.openai_model(),
        input=prompt,
        store=False,
        text={"format": {"type": "json_schema", "name": schema_name, "strict": True, "schema": schema}},
    )
    return json.loads(response.output_text)


class OpenAITutor:
    def generate_question(self, *, subject: str, topic: str, difficulty: str) -> Row:
        parameters = {"subject": subject, "topic": topic, "difficulty": difficulty}
        generated = _structured_response(
            schema_name="educational_question",
            schema=QUESTION_SCHEMA,
            prompt=protected_ai_input(
                task=QUESTION_TASK,
                user_request="Gere uma questão usando os parâmetros pedagógicos informados.",
                context=parameters,
            ),
        )
        return {"id": str(uuid.uuid4()), **parameters, **generated}

    def answer(self, *, task: str, question: str, role: str, history: list[dict[str, str]]) -> Row:
        return _structured_response(
            schema_name="educational_assistant",
            schema=AI_ASSISTANT_SCHEMA,
            prompt=protected_ai_input(
                task=task, user_request=question, context={"perfil": role}, history=history
            ),
        )

    def recommend(self, *, subject: str, metrics: list[Row]) -> Row:
        return _structured_response(
            schema_name="pedagogical_recommendation",
            schema=RECOMMENDATION_SCHEMA,
            prompt=protected_ai_input(
                task=RECOMMENDATION_TASK,
                user_request="Analise as métricas anônimas e proponha a próxima intervenção pedagógica.",
                context={"subject": subject, "metrics": metrics},
            ),
        )
