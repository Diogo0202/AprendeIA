"""Apresentação de conversas e mensagens a partir de linhas já carregadas."""

import uuid
from collections import defaultdict
from typing import Any

from aprendeia.domain.errors import ServiceUnavailable

Row = dict[str, Any]

AI_TUTOR_NAME = "Tutor IA"
AI_KIND = "ai"
DIRECT_KIND = "direct"
ASSISTANT_SENDER = "assistant"
AI_HISTORY_LIMIT = 10
AI_ANSWER_MAX_LENGTH = 4000
AI_SUGGESTION_MAX_LENGTH = 160
AI_MAX_SUGGESTIONS = 3


def _other_participant(member_ids: list[str], user_id: str, profiles_by_id: dict[str, Row]) -> Row:
    for participant_id in member_ids:
        if participant_id != user_id:
            return profiles_by_id.get(participant_id) or {}
    return {}


def _latest_message_by_conversation(recent_messages: list[Row]) -> dict[str, Row]:
    latest: dict[str, Row] = {}
    for message in recent_messages:
        latest.setdefault(message["conversation_id"], message)
    return latest


def summarize_conversations(
    user_id: str,
    conversations: list[Row],
    members: list[Row],
    profiles: list[Row],
    recent_messages: list[Row],
) -> list[Row]:
    """Resume as conversas do usuário sem revelar membros de outras salas."""

    profiles_by_id = {profile["id"]: profile for profile in profiles}
    members_by_conversation: dict[str, list[str]] = defaultdict(list)
    for member in members:
        members_by_conversation[member["conversation_id"]].append(member["user_id"])
    latest = _latest_message_by_conversation(recent_messages)

    summaries = []
    for conversation in conversations:
        is_ai = conversation["kind"] == AI_KIND
        participant = _other_participant(members_by_conversation[conversation["id"]], user_id, profiles_by_id)
        summaries.append({
            **conversation,
            "title": AI_TUTOR_NAME if is_ai else participant.get("full_name", "Conversa"),
            "participant_id": participant.get("id"),
            "participant_role": ASSISTANT_SENDER if is_ai else participant.get("role"),
            "last_message": latest.get(conversation["id"]),
        })
    return summaries


def other_participant_ids(members: list[Row], user_id: str) -> list[str]:
    return list({row["user_id"] for row in members if row["user_id"] != user_id})


def describe_messages(rows: list[Row], profiles: list[Row], user_id: str) -> list[Row]:
    """Acrescenta o nome de quem enviou e marca as mensagens da própria pessoa."""

    profiles_by_id = {profile["id"]: profile for profile in profiles}
    return [
        {
            **row,
            "sender_name": AI_TUTOR_NAME
            if row["sender_kind"] == ASSISTANT_SENDER
            else profiles_by_id.get(row.get("sender_id"), {}).get("full_name", "Usuario"),
            "is_mine": row.get("sender_id") == user_id,
        }
        for row in rows
    ]


def ai_history(recent_messages_newest_first: list[Row]) -> list[dict[str, str]]:
    """Devolve as últimas trocas concluídas, da mais antiga para a mais recente."""

    return [
        {
            "role": ASSISTANT_SENDER if row["sender_kind"] == ASSISTANT_SENDER else "user",
            "content": row["body"],
        }
        for row in reversed(recent_messages_newest_first)
    ]


def tutor_task(role: str) -> str:
    if role == "student":
        return "Explique o conteudo como tutor. Ajude o estudante a raciocinar sem fazer atividades avaliativas por ele."
    return "Ajude o professor com planejamento, explicacoes e estrategias pedagogicas, sem inventar dados de estudantes."


def parse_conversation_id(value: Any) -> str:
    """Normaliza o UUID escalar devolvido pelas funcoes RPC do banco."""

    candidate = value[0] if isinstance(value, list) and value else value
    if isinstance(candidate, dict):
        candidate = next(iter(candidate.values()), None)
    try:
        return str(uuid.UUID(str(candidate)))
    except (ValueError, TypeError, AttributeError) as error:
        raise ServiceUnavailable("O banco devolveu uma conversa invalida.") from error


def parse_ai_exchange(exchange: Any) -> tuple[Row, Row]:
    """O recibo precisa trazer as duas mensagens gravadas na mesma transação."""

    if not isinstance(exchange, dict) or not all(
        isinstance(exchange.get(key), dict) for key in ("user_message", "assistant_message")
    ):
        raise ValueError("Invalid exchange receipt")
    return exchange["user_message"], exchange["assistant_message"]
