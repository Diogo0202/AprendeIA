import { FormEvent, useEffect, useMemo, useState } from 'react';
import { gateways, isConnected } from '../application/gateways';
import { failureMessage } from '../application/result';

type CommunicationRole = 'student' | 'teacher' | 'admin';
type CommunicationMode = 'direct' | 'ai';

const contactRoleLabels: Record<CommunicationRole, string> = {
  student: 'Estudante',
  teacher: 'Professor',
  admin: 'Administração',
};

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
  admin: [
    { id: 'demo-teacher', full_name: 'Prof. Carlos Lima', role: 'teacher', context: 'Professor' },
  ],
};

/** Centraliza conversa humana e IA sem misturar seus destinos no backend. */
export function CommunicationCenter({ role, requestedMode }: CommunicationCenterProps) {
  const [contacts, setContacts] = useState<Contact[]>(isConnected() ? [] : demoContacts[role]);
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
    if (!isConnected()) return;
    const loaded = await gateways().communication.conversations<Conversation[]>();
    if (!loaded.ok)
      throw new Error(failureMessage(loaded, 'Nao foi possivel carregar as conversas.'));
    const next = loaded.data;
    setConversations(next);
    if (preferredId) setSelectedId(preferredId);
  }

  useEffect(() => {
    if (!isConnected()) return;
    let active = true;
    const { communication } = gateways();
    Promise.all([
      communication.contacts<Contact[]>(),
      communication.conversations<Conversation[]>(),
    ])
      .then(([loadedContacts, loadedConversations]) => {
        if (!loadedContacts.ok)
          throw new Error(failureMessage(loadedContacts, 'Nao foi possivel carregar os contatos.'));
        if (!loadedConversations.ok)
          throw new Error(
            failureMessage(loadedConversations, 'Nao foi possivel carregar as conversas.'),
          );
        return [loadedContacts.data, loadedConversations.data] as const;
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
    if (!isConnected()) return;
    let active = true;
    gateways()
      .communication.messages<Message[]>(selectedId)
      .then((result) => {
        if (!result.ok)
          throw new Error(failureMessage(result, 'Nao foi possivel abrir a conversa.'));
        return result.data;
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
    if (!isConnected()) {
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
      const created = await gateways().communication.startConversation<{ id: string }>(contact.id);
      if (!created.ok)
        throw new Error(failureMessage(created, 'Nao foi possivel iniciar a conversa.'));
      await loadConversations(created.data.id);
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
      if (!isConnected()) {
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
        const answered = await gateways().communication.askTutor<{
          conversation_id: string;
          user_message: Message;
          assistant_message: Message;
          suggested_questions: string[];
        }>(body, selectedId === 'ai-new' ? undefined : selectedId);
        if (!answered.ok)
          throw new Error(failureMessage(answered, 'O tutor nao conseguiu responder agora.'));
        const result = answered.data;
        setMessages((current) => [...current, result.user_message, result.assistant_message]);
        setSuggestions(result.suggested_questions);
        setSelectedId(result.conversation_id);
        await loadConversations(result.conversation_id);
      } else {
        const sent = await gateways().communication.sendMessage<Message>(selectedId, body);
        if (!sent.ok) throw new Error(failureMessage(sent, 'Nao foi possivel enviar a mensagem.'));
        const savedMessage = sent.data;
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
        {/* O tutor de IA é só para quem estuda ou ensina; a API recusa a administração. */}
        {role !== 'admin' && (
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
        )}
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
                {contactRoleLabels[contact.role] ?? 'Contato'} · {contact.context}
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
