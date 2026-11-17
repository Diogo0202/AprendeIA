"""Casos de uso das conversas humanas e do tutor de IA."""

from datetime import datetime, timezone
from typing import Any

from aprendeia.application.ports.learning import ConversationRepository, TutorModel
from aprendeia.application.ports.security import RateLimiter
from aprendeia.application.services.teaching_scope import require_assignment
from aprendeia.domain.communication_rules import can_start_direct_conversation, validate_message_body
from aprendeia.domain.conversations import (
    AI_ANSWER_MAX_LENGTH,
    AI_HISTORY_LIMIT,
    AI_KIND,
    AI_MAX_SUGGESTIONS,
    AI_SUGGESTION_MAX_LENGTH,
    AI_TUTOR_NAME,
    DIRECT_KIND,
    ai_history,
    describe_messages,
    other_participant_ids,
    parse_ai_exchange,
    parse_conversation_id,
    summarize_conversations,
    tutor_task,
)
from aprendeia.domain.errors import (
    ApplicationError,
    Conflict,
    Forbidden,
    NotFound,
    ServiceUnavailable,
    UpstreamFailure,
)

Row = dict[str, Any]
Contacts = dict[str, Row]
CONVERSATION_NOT_FOUND = "Conversa nao encontrada."


def _by_name(rows: list[Row]) -> list[Row]:
    return sorted(rows, key=lambda item: item["full_name"].casefold())


class ContactDirectory:
    """Lista somente pessoas com quem o cargo atual pode iniciar conversa."""

    def __init__(self, conversations: ConversationRepository) -> None:
        self._conversations = conversations

    def contacts_for(self, user: Row) -> list[Row]:
        if user["role"] == "student":
            contacts = self.student_contacts(user)
        elif user["role"] == "admin":
            contacts = self.admin_contacts()
        else:
            contacts = self.teacher_contacts(user)
        return _by_name(list(contacts.values()))

    def student_contacts(self, user: Row) -> Contacts:
        """Aluno conversa com os professores das disciplinas em que está matriculado."""

        enrollments = self._conversations.enrollments_with_subject(user["id"])
        subject_ids = [row["subject_id"] for row in enrollments]
        subject_names = {
            row["subject_id"]: (row.get("subjects") or {}).get("name", "Disciplina")
            for row in enrollments
        }
        assignments = self._conversations.teacher_assignments_for(subject_ids) if subject_ids else []
        teacher_ids = list({row["teacher_id"] for row in assignments})
        teachers_by_id = {
            profile["id"]: profile
            for profile in self._conversations.active_profiles("teacher", teacher_ids)
        }
        contacts: Contacts = {}
        for assignment in assignments:
            profile = teachers_by_id.get(assignment["teacher_id"])
            if profile:
                contacts[profile["id"]] = {
                    **profile,
                    "context": subject_names.get(assignment["subject_id"], "Disciplina"),
                }
        return contacts

    def admin_contacts(self) -> Contacts:
        """A administração conversa só com professores ativos, nunca com alunos."""

        return {
            profile["id"]: {**profile, "context": "Professor"}
            for profile in self._conversations.active_profiles("teacher")
        }

    def teacher_contacts(self, user: Row) -> Contacts:
        """Professor conversa com alunos da própria disciplina, colegas e administração."""

        assignment = require_assignment(self._conversations, user["id"])
        student_ids = list(set(self._conversations.students_enrolled_in(assignment["subject_id"])))
        contacts: Contacts = {}
        for profile in self._conversations.active_profiles("student", student_ids):
            contacts[profile["id"]] = {**profile, "context": assignment["subject"]}
        # A troca entre professores nao abre dados das disciplinas dos colegas.
        for profile in self._conversations.active_profiles("teacher"):
            if profile["id"] != user["id"]:
                contacts[profile["id"]] = {**profile, "context": "Professor"}
        for profile in self._conversations.active_profiles("admin"):
            contacts[profile["id"]] = {**profile, "context": "Administração"}
        return contacts


class ConversationService:
    """Conversas humanas: esta parte nunca encaminha texto à IA."""

    def __init__(self, *, conversations: ConversationRepository, limiter: RateLimiter) -> None:
        self._conversations = conversations
        self._limiter = limiter

    def list_for(self, user: Row) -> list[Row]:
        conversation_ids = self._conversations.conversation_ids_of(user["id"])
        if not conversation_ids:
            return []
        conversations = self._conversations.conversations(conversation_ids)
        members = self._conversations.members(conversation_ids)
        participant_ids = other_participant_ids(members, user["id"])
        profiles = self._conversations.profiles(participant_ids) if participant_ids else []
        recent_messages = self._conversations.recent_messages(conversation_ids)
        return summarize_conversations(user["id"], conversations, members, profiles, recent_messages)

    def owned_conversation(self, user_id: str, conversation_id: str, *, expected_kind: str | None = None) -> Row:
        """Confirma a participacao antes de ler qualquer detalhe da conversa."""

        if not self._conversations.is_member(conversation_id, user_id):
            # O mesmo 404 vale para conversa inexistente ou alheia, evitando enumeracao.
            raise NotFound(CONVERSATION_NOT_FOUND)
        conversation = self._conversations.find_conversation(conversation_id)
        if not conversation:
            raise NotFound(CONVERSATION_NOT_FOUND)
        if expected_kind and conversation["kind"] != expected_kind:
            raise Conflict("Tipo de conversa incompativel com esta acao.")
        return conversation

    def start_direct(self, user: Row, participant_id: str) -> Row:
        """Cria conversa humana somente quando cargo e vinculo permitem."""

        recipient = self._conversations.find_recipient(participant_id)
        if not recipient or recipient.get("registration_status") != "active":
            raise NotFound("Contato nao encontrado.")
        if not can_start_direct_conversation(user["role"], recipient["role"]):
            raise Forbidden("Este tipo de conversa nao e permitido.")
        self._limiter.enforce(user["id"], "communication_write")
        try:
            created = self._conversations.open_direct_conversation(user["id"], recipient["id"])
            return {"id": parse_conversation_id(created), "kind": DIRECT_KIND}
        except ApplicationError:
            raise
        except Exception as error:
            # A RPC repete a autorizacao e impede contornar o vinculo pelo endpoint.
            raise Forbidden("Nao foi possivel iniciar esta conversa.") from error

    def messages(self, user: Row, conversation_id: str) -> list[Row]:
        """Entrega o historico somente a um membro autenticado da conversa."""

        self.owned_conversation(user["id"], conversation_id)
        rows = self._conversations.messages(conversation_id)
        sender_ids = list({row["sender_id"] for row in rows if row.get("sender_id")})
        profiles = self._conversations.profiles(sender_ids) if sender_ids else []
        return describe_messages(rows, profiles, user["id"])

    def send(self, user: Row, conversation_id: str, body: str) -> Row:
        self.owned_conversation(user["id"], conversation_id, expected_kind=DIRECT_KIND)
        self._limiter.enforce(user["id"], "communication_write")
        sent_at = datetime.now(timezone.utc).isoformat()
        saved = self._conversations.add_message(conversation_id, user["id"], body, sent_at)
        return {**saved, "sender_name": user["full_name"], "is_mine": True}


class TutorConversationService:
    """Mantem a conversa de IA separada das mensagens humanas e dos outros usuarios."""

    def __init__(
        self,
        *,
        conversations: ConversationRepository,
        ownership: ConversationService,
        tutor: TutorModel,
        limiter: RateLimiter,
    ) -> None:
        self._conversations = conversations
        self._ownership = ownership
        self._tutor = tutor
        self._limiter = limiter

    def ask(self, user: Row, body: str, conversation_id: str | None) -> Row:
        self._limiter.enforce(user["id"], "ai_communication")
        conversation_id = conversation_id or self._open_conversation(user["id"])
        self._ownership.owned_conversation(user["id"], conversation_id, expected_kind=AI_KIND)
        # A pergunta atual entra somente em user_request. O histórico contém apenas
        # trocas já concluídas; uma falha do provedor não deixa mensagem pendente.
        history = ai_history(self._conversations.latest_bodies(conversation_id, AI_HISTORY_LIMIT))
        answer, suggestions = self._generate_answer(user, body, history)
        user_message, assistant_message = self._save_exchange(user["id"], conversation_id, body, answer)
        return {
            "conversation_id": conversation_id,
            "user_message": {**user_message, "sender_name": user["full_name"], "is_mine": True},
            "assistant_message": {**assistant_message, "sender_name": AI_TUTOR_NAME, "is_mine": False},
            "suggested_questions": suggestions,
        }

    def _open_conversation(self, user_id: str) -> str:
        """Abre uma unica conversa de IA por usuario usando uma operacao atomica."""

        try:
            return parse_conversation_id(self._conversations.open_ai_conversation(user_id))
        except ApplicationError:
            raise
        except Exception as error:
            raise ServiceUnavailable("Nao foi possivel abrir o assistente agora.") from error

    def _generate_answer(self, user: Row, body: str, history: list[dict[str, str]]) -> tuple[str, list[str]]:
        """Pede a resposta ao provedor e valida resposta e sugestões antes de gravar."""

        try:
            generated = self._tutor.answer(
                task=tutor_task(user["role"]), question=body, role=user["role"], history=history
            )
            answer = validate_message_body(str(generated["answer"]), max_length=AI_ANSWER_MAX_LENGTH)
            suggestions = _valid_suggestions(generated.get("suggested_questions", []))
        except ApplicationError:
            raise
        except Exception as error:
            raise UpstreamFailure("O assistente nao conseguiu responder agora.") from error
        return answer, suggestions

    def _save_exchange(self, user_id: str, conversation_id: str, question: str, answer: str) -> tuple[Row, Row]:
        """Grava pergunta e resposta juntas e devolve as duas mensagens salvas."""

        try:
            # Uma transação grava o par e o horário da conversa. Não há janela entre
            # dois INSERTs HTTP em que apenas a pergunta ficaria persistida.
            receipt = self._conversations.append_ai_exchange(user_id, conversation_id, question, answer)
            return parse_ai_exchange(receipt)
        except Exception as error:
            raise ServiceUnavailable("Não foi possível salvar a resposta do assistente.") from error


def _valid_suggestions(raw_suggestions: list[Any]) -> list[str]:
    suggestions = []
    for suggestion in raw_suggestions[:AI_MAX_SUGGESTIONS]:
        try:
            suggestions.append(validate_message_body(str(suggestion), max_length=AI_SUGGESTION_MAX_LENGTH))
        except ValueError:
            continue
    return suggestions
