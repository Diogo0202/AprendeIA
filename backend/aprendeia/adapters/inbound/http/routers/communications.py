"""Rotas de conversas humanas e do tutor de IA."""

import uuid

from fastapi import APIRouter

from aprendeia.adapters.inbound.http.dependencies import AITutorUser, CommunicationUser, RequestServices
from aprendeia.adapters.inbound.http.schemas import (
    AICommunicationRequest,
    CommunicationMessageCreate,
    DirectConversationCreate,
)

router = APIRouter(prefix="/communications")


@router.get("/contacts")
def communication_contacts(user: CommunicationUser, services: RequestServices):
    """Lista somente pessoas com quem o cargo atual pode iniciar conversa."""

    return services.contacts.contacts_for(user)


@router.get("/conversations")
def communication_conversations(user: CommunicationUser, services: RequestServices):
    """Resume as conversas do usuario sem revelar membros de outras salas."""

    return services.conversations.list_for(user)


@router.post("/conversations", status_code=201)
def create_communication_conversation(
    payload: DirectConversationCreate, user: CommunicationUser, services: RequestServices
):
    """Cria conversa humana somente quando cargo e vinculo permitem."""

    return services.conversations.start_direct(user, str(payload.participant_id))


@router.get("/conversations/{conversation_id}/messages")
def communication_messages(conversation_id: uuid.UUID, user: CommunicationUser, services: RequestServices):
    """Entrega o historico somente a um membro autenticado da conversa."""

    return services.conversations.messages(user, str(conversation_id))


@router.post("/conversations/{conversation_id}/messages", status_code=201)
def send_communication_message(
    conversation_id: uuid.UUID,
    payload: CommunicationMessageCreate,
    user: CommunicationUser,
    services: RequestServices,
):
    """Envia texto a uma conversa humana; esta rota nunca chama a IA."""

    return services.conversations.send(user, str(conversation_id), payload.body)


@router.post("/ai/messages", status_code=201)
def send_ai_communication_message(payload: AICommunicationRequest, user: AITutorUser, services: RequestServices):
    """Mantem a conversa de IA separada das mensagens humanas e dos outros usuarios."""

    conversation_id = str(payload.conversation_id) if payload.conversation_id else None
    return services.tutor_conversations.ask(user, payload.body, conversation_id)
