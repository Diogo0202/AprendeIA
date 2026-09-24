import { FormEvent, useEffect, useMemo, useState } from 'react';
import { apiError, apiFetch } from '../lib/api';
import { isSupabaseConfigured } from '../lib/supabase';

type CommunicationRole = 'student' | 'teacher';
type CommunicationMode = 'direct' | 'ai';

type Contact = {
  id: string;
  full_name: string;
  role: CommunicationRole;
  context: string;
};

type Conversation = {
  id: string;
  kind: CommunicationMode;
  title: string;
  participant_id?: string | null;
  participant_role?: string | null;
  last_message?: { body: string; created_at: string } | null;
};

type Message = {
  id: string;
  sender_id?: string | null;
  sender_kind: 'user' | 'assistant';
  sender_name: string;
  body: string;
  created_at: string;
  is_mine: boolean;
};

type CommunicationCenterProps = {
  role: CommunicationRole;
  requestedMode?: CommunicationMode;
};

const demoContacts: Record<CommunicationRole, Contact[]> = {
  student: [
    { id: 'demo-teacher', full_name: 'Prof. Carlos Lima', role: 'teacher', context: 'Matematica' },
  ],
  teacher: [
    { id: 'demo-student', full_name: 'Ana Souza', role: 'student', context: 'Matematica' },
    {
      id: 'demo-colleague',
      full_name: 'Profa. Marina Alves',
      role: 'teacher',
      context: 'Professor',
    },
  ],
};

/** Centraliza conversa humana e IA sem misturar seus destinos no backend. */
export function CommunicationCenter({ role, requestedMode }: CommunicationCenterProps) {
  const [contacts, setContacts] = useState<Contact[]>(
    isSupabaseConfigured ? [] : demoContacts[role],
  );
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string>(requestedMode === 'ai' ? 'ai-new' : '');
  const [messages, setMessages] = useState<Message[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const selectedConversation = conversations.find((item) => item.id === selectedId);
  const currentMode: CommunicationMode =
    selectedId === 'ai-new' || selectedConversation?.kind === 'ai' ? 'ai' : 'direct';
  const title =
    selectedId === 'ai-new' ? 'Tutor IA' : (selectedConversation?.title ?? 'Escolha uma conversa');

  async function loadConversations(preferredId?: string) {
    if (!isSupabaseConfigured) return;
    const response = await apiFetch('/communications/conversations');
    if (!response.ok)
      throw new Error(await apiError(response, 'Nao foi possivel carregar as conversas.'));
    const next = (await response.json()) as Conversation[];
    setConversations(next);
    if (preferredId) setSelectedId(preferredId);
  }

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    Promise.all([apiFetch('/communications/contacts'), apiFetch('/communications/conversations')])
      .then(async ([contactsResponse, conversationsResponse]) => {
        if (!contactsResponse.ok)
          throw new Error(
            await apiError(contactsResponse, 'Nao foi possivel carregar os contatos.'),
          );
        if (!conversationsResponse.ok)
          throw new Error(
            await apiError(conversationsResponse, 'Nao foi possivel carregar as conversas.'),
          );
        return Promise.all([
          contactsResponse.json() as Promise<Contact[]>,
          conversationsResponse.json() as Promise<Conversation[]>,
        ]);
      })
      .then(([nextContacts, nextConversations]) => {
        if (!active) return;
        setContacts(nextContacts);
        setConversations(nextConversations);
      })
      .catch(
        (reason) =>
          active &&
          setError(reason instanceof Error ? reason.message : 'Comunicacao indisponivel.'),
      );
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!requestedMode) return;
    if (requestedMode === 'ai') {
      setSelectedId(conversations.find((item) => item.kind === 'ai')?.id ?? 'ai-new');
    } else {
      setSelectedId(conversations.find((item) => item.kind === 'direct')?.id ?? '');
    }
  }, [requestedMode, conversations]);

  useEffect(() => {
    if (!selectedId || selectedId === 'ai-new') {
      setMessages([]);
      return;
    }
    if (!isSupabaseConfigured) return;
    let active = true;
    apiFetch(`/communications/conversations/${selectedId}/messages`)
      .then(async (response) => {
        if (!response.ok)
          throw new Error(await apiError(response, 'Nao foi possivel abrir a conversa.'));
        return response.json() as Promise<Message[]>;
      })
      .then((nextMessages) => active && setMessages(nextMessages))
      .catch(
        (reason) =>
          active && setError(reason instanceof Error ? reason.message : 'Conversa indisponivel.'),
      );
    return () => {
      active = false;
    };
  }, [selectedId]);

  const directConversationByContact = useMemo(
    () =>
      new Map(
        conversations
          .filter((item) => item.kind === 'direct')
          .map((item) => [item.participant_id, item]),
      ),
    [conversations],
  );

  async function selectContact(contact: Contact) {
    const existing = directConversationByContact.get(contact.id);
    if (existing) {
      setSelectedId(existing.id);
      return;
    }
    if (!isSupabaseConfigured) {
      const conversation = {
        id: `demo-${contact.id}`,
        kind: 'direct' as const,
        title: contact.full_name,
        participant_id: contact.id,
      };
      setConversations((current) => [...current, conversation]);
      setSelectedId(conversation.id);
      setMessages([]);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await apiFetch('/communications/conversations', {
        method: 'POST',
        body: JSON.stringify({ participant_id: contact.id }),
      });
      if (!response.ok)
        throw new Error(await apiError(response, 'Nao foi possivel iniciar a conversa.'));
      const created = (await response.json()) as { id: string };
      await loadConversations(created.id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nao foi possivel iniciar a conversa.');
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || body.length > 2000 || (currentMode === 'direct' && !selectedId)) return;
    setBusy(true);
    setError('');
    try {
      if (!isSupabaseConfigured) {
        const now = new Date().toISOString();
        const mine: Message = {
          id: `demo-user-${Date.now()}`,
          sender_kind: 'user',
          sender_name: 'Voce',
          body,
          created_at: now,
          is_mine: true,
        };
        const reply: Message =
          currentMode === 'ai'
            ? {
                id: `demo-ai-${Date.now()}`,
                sender_kind: 'assistant',
                sender_name: 'Tutor IA',
                body: 'Vamos por partes: conte o que voce ja entendeu e em qual passo apareceu a duvida.',
                created_at: now,
                is_mine: false,
              }
            : mine;
        setMessages((current) =>
          currentMode === 'ai' ? [...current, mine, reply] : [...current, mine],
        );
        setDraft('');
        return;
      }
      if (currentMode === 'ai') {
        const response = await apiFetch('/communications/ai/messages', {
          method: 'POST',
          body: JSON.stringify({
            body,
            conversation_id: selectedId === 'ai-new' ? undefined : selectedId,
          }),
        });
        if (!response.ok)
          throw new Error(await apiError(response, 'O tutor nao conseguiu responder agora.'));
        const result = (await response.json()) as {
          conversation_id: string;
          user_message: Message;
          assistant_message: Message;
          suggested_questions: string[];
        };
        setMessages((current) => [...current, result.user_message, result.assistant_message]);
        setSuggestions(result.suggested_questions);
        setSelectedId(result.conversation_id);
        await loadConversations(result.conversation_id);
      } else {
        const response = await apiFetch(`/communications/conversations/${selectedId}/messages`, {
          method: 'POST',
          body: JSON.stringify({ body }),
        });
        if (!response.ok)
          throw new Error(await apiError(response, 'Nao foi possivel enviar a mensagem.'));
        const savedMessage = (await response.json()) as Message;
        setMessages((current) => [...current, savedMessage]);
        await loadConversations(selectedId);
      }
      setDraft('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Nao foi possivel enviar a mensagem.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="communication-center" aria-labelledby="communication-title">
      <aside className="communication-directory">
        <div>
          <p className="eyebrow">CONVERSAS</p>
          <h2 id="communication-title">Fale com seguranca</h2>
        </div>
        <button
          type="button"
          className={`communication-contact ai ${currentMode === 'ai' ? 'active' : ''}`}
          onClick={() =>
            setSelectedId(conversations.find((item) => item.kind === 'ai')?.id ?? 'ai-new')
          }
        >
          <span>IA</span>
          <strong>Tutor IA</strong>
          <small>Apoio educacional</small>
        </button>
        <div className="communication-contact-list">
          {contacts.map((contact) => (
            <button
              type="button"
              className={`communication-contact ${selectedConversation?.participant_id === contact.id ? 'active' : ''}`}
              key={contact.id}
              onClick={() => void selectContact(contact)}
              disabled={busy}
            >
              <span>{contact.full_name.slice(0, 1).toLocaleUpperCase('pt-BR')}</span>
              <strong>{contact.full_name}</strong>
              <small>
                {contact.role === 'teacher' ? 'Professor' : 'Estudante'} · {contact.context}
              </small>
            </button>
          ))}
        </div>
      </aside>
      <div className="communication-thread">
        <header>
          <div>
            <p className="eyebrow">{currentMode === 'ai' ? 'ASSISTENTE' : 'MENSAGEM DIRETA'}</p>
            <h3>{title}</h3>
          </div>
          <small>
            {currentMode === 'ai'
              ? 'Entradas protegidas contra manipulacao de prompt'
              : 'Somente participantes autorizados'}
          </small>
        </header>
        <div className="communication-messages" aria-live="polite">
          {messages.length ? (
            messages.map((message) => (
              <article
                className={`communication-message ${message.is_mine ? 'mine' : ''}`}
                key={message.id}
              >
                <strong>{message.sender_name}</strong>
                <p>{message.body}</p>
                <time dateTime={message.created_at}>
                  {new Date(message.created_at).toLocaleString('pt-BR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </time>
              </article>
            ))
          ) : (
            <div className="communication-empty">
              <strong>
                {currentMode === 'ai' ? 'Qual assunto vamos destravar?' : 'Comece uma conversa'}
              </strong>
              <p>
                {currentMode === 'ai'
                  ? 'Envie uma duvida educacional sem dados pessoais.'
                  : 'Escolha um contato permitido e envie a primeira mensagem.'}
              </p>
            </div>
          )}
        </div>
        {suggestions.length > 0 && (
          <div className="communication-suggestions">
            {suggestions.map((suggestion) => (
              <button type="button" key={suggestion} onClick={() => setDraft(suggestion)}>
                {suggestion}
              </button>
            ))}
          </div>
        )}
        <form className="communication-composer" onSubmit={sendMessage}>
          <label className="sr-only" htmlFor={`communication-${role}`}>
            Mensagem
          </label>
          <textarea
            id={`communication-${role}`}
            name="body"
            maxLength={2000}
            rows={2}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={
              currentMode === 'ai' ? 'Escreva sua duvida educacional...' : 'Escreva uma mensagem...'
            }
            disabled={busy || (currentMode === 'direct' && !selectedId)}
            required
          />
          <button
            className="primary-button"
            disabled={busy || (currentMode === 'direct' && !selectedId)}
          >
            {busy ? 'Enviando...' : 'Enviar'}
          </button>
        </form>
        {error && (
          <p className="form-message" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
