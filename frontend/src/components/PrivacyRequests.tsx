import { FormEvent, useCallback, useEffect, useId, useRef, useState } from 'react';
import { apiError, apiFetch } from '../lib/api';
import { isSupabaseConfigured } from '../lib/supabase';

type Kind =
  | 'access'
  | 'correction'
  | 'anonymization'
  | 'deletion'
  | 'confirmation'
  | 'sharing'
  | 'opposition'
  | 'revocation'
  | 'portability'
  | 'automated_review';
type PrivacyRequest = {
  id: string;
  user_id?: string | null;
  kind: Kind;
  status: 'pending' | 'completed' | 'rejected' | 'cancelled';
  details: string;
  corrections?: Partial<Record<'full_name' | 'grade' | 'goal', string>> | null;
  response: string | null;
  created_at: string;
  resolved_at: string | null;
  expires_at: string | null;
};
const kinds: Record<Kind, string> = {
  access: 'Acesso aos dados',
  correction: 'Correção',
  anonymization: 'Anonimização',
  deletion: 'Exclusão',
  confirmation: 'Confirmação de tratamento',
  sharing: 'Informações sobre compartilhamento',
  opposition: 'Oposição ao tratamento',
  revocation: 'Revogação de consentimento',
  portability: 'Portabilidade',
  automated_review: 'Revisão de decisão automatizada',
};
const statuses = {
  pending: 'Pendente',
  completed: 'Concluído',
  rejected: 'Recusado',
  cancelled: 'Cancelado',
};

/** A consequência aparece antes do envio, pois abrir o pedido ainda não apaga dados. */
function Consequences({ kind }: { kind: Kind }) {
  if (
    [
      'confirmation',
      'sharing',
      'opposition',
      'revocation',
      'portability',
      'automated_review',
    ].includes(kind)
  ) {
    return (
      <p className="privacy-policy-review-note">
        Atendimento assistido: a administração analisa o pedido e registra a decisão e a resposta.
        {kind === 'portability' &&
          ' A portabilidade exige orientação sobre formato e entrega; o download JSON está disponível apenas para acesso concluído.'}
        {(kind === 'opposition' || kind === 'revocation') &&
          ' Abrir ou concluir o pedido não altera automaticamente o tratamento nem os consentimentos. Antes de concluir, a administração deve confirmar a medida adotada e descrever sua referência na resposta ao titular.'}
        {kind === 'automated_review' &&
          ' A revisão será analisada pela administração, sem alteração automática de decisões.'}
      </p>
    );
  }
  if (kind !== 'deletion' && kind !== 'anonymization') return null;
  return (
    <p className="privacy-policy-review-note">
      A conclusão deste pedido encerra a conta e remove o histórico identificável e as conversas.{' '}
      Turmas e materiais docentes permanecem sem vínculo com a conta encerrada; o histórico de
      outros estudantes permanece.
      {kind === 'anonymization' &&
        ' A anonimização preserva apenas totais globais não identificáveis.'}{' '}
      Abrir o pedido não executa essa ação. A administração precisa analisá-lo.
    </p>
  );
}

/** O diálogo nativo contém o foco e devolve a navegação ao botão após fechar. */
export function PrivacyRequests() {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  return (
    <>
      <button type="button" className="privacy-policy-trigger" onClick={() => setOpen(true)}>
        Meus dados
      </button>
      <dialog
        ref={dialog}
        className="privacy-policy-dialog"
        aria-labelledby={titleId}
        onCancel={() => setOpen(false)}
        onClose={() => setOpen(false)}
      >
        <div className="privacy-policy-heading">
          <h2 id={titleId}>Meus dados</h2>
          <button type="button" className="privacy-policy-close" onClick={() => setOpen(false)}>
            Fechar meus dados
          </button>
        </div>
        <div className="privacy-policy-content">{open && <RequestPanel />}</div>
      </dialog>
    </>
  );
}

/** A fila administrativa fica separada da auditoria e compartilha o contrato dos pedidos. */
export function AdminPrivacyRequests() {
  return (
    <section className="profile-panel audit-panel">
      <h2>Pedidos de privacidade</h2>
      <RequestPanel admin />
    </section>
  );
}

/** Atualiza a lista pelo servidor após cada operação, sem simular persistência no modo demo. */
function RequestPanel({ admin = false }: { admin?: boolean }) {
  const [requests, setRequests] = useState<PrivacyRequest[]>([]);
  const [ownIds, setOwnIds] = useState<string[]>([]);
  const [kind, setKind] = useState<Kind>('access');
  const [details, setDetails] = useState('');
  const [corrections, setCorrections] = useState({ full_name: '', grade: '', goal: '' });
  const [changedFields, setChangedFields] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const headingId = useId();
  const endpoint = admin ? '/admin/privacy-requests' : '/privacy/requests';

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!isSupabaseConfigured) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setLoaded(false);
      try {
        // A lista pessoal identifica pedidos próprios sem depender de campos fora do contrato.
        const responses = await Promise.all([
          apiFetch(endpoint, { signal }),
          ...(admin ? [apiFetch('/privacy/requests', { signal })] : []),
        ]);
        for (const response of responses) {
          if (!response.ok)
            throw new Error(await apiError(response, 'Não foi possível carregar os pedidos.'));
        }
        const items = (await responses[0].json()) as PrivacyRequest[];
        const own = admin ? ((await responses[1].json()) as PrivacyRequest[]) : [];
        if (signal?.aborted) return;
        setRequests(items);
        setOwnIds(own.map((item) => item.id));
        setLoaded(true);
      } catch (cause) {
        if (!signal?.aborted)
          setError(cause instanceof Error ? cause.message : 'Falha ao carregar os pedidos.');
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [admin, endpoint],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function mutate(path: string, body?: object) {
    if (busy || !isSupabaseConfigured) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await apiFetch(path, {
        method: 'POST',
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!response.ok)
        throw new Error(await apiError(response, 'Não foi possível concluir a operação.'));
      setMessage('Operação registrada.');
      if (path === '/privacy/requests') {
        setDetails('');
        setCorrections({ full_name: '', grade: '', goal: '' });
        setChangedFields([]);
      }
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha de conexão. Tente novamente.');
    } finally {
      setBusy(false);
    }
  }

  async function download(request: PrivacyRequest) {
    if (busy || !isSupabaseConfigured) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await apiFetch(`/privacy/requests/${encodeURIComponent(request.id)}/export`);
      if (!response.ok)
        throw new Error(await apiError(response, 'Não foi possível baixar os dados.'));
      // O arquivo recebe um nome fixo para não carregar dados pessoais no nome do download.
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'meus-dados.json';
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('Download iniciado.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao baixar os dados.');
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (details.length > 1000) return;
    const changed = Object.fromEntries(
      Object.entries(corrections).filter(([field]) => changedFields.includes(field)),
    );
    if (kind === 'correction' && !Object.keys(changed).length) {
      setError('Edite ao menos um campo para pedir a correção.');
      return;
    }
    if (kind === 'correction' && 'full_name' in changed && changed.full_name.trim().length < 2) {
      setError('O nome precisa de pelo menos dois caracteres.');
      return;
    }
    void mutate('/privacy/requests', {
      kind,
      details,
      ...(kind === 'correction' && Object.keys(changed).length ? { corrections: changed } : {}),
    });
  }

  return (
    <div className="privacy-requests" aria-busy={busy || loading}>
      {!isSupabaseConfigured && (
        <p role="status">Modo demonstração: persistência indisponível. Nenhum pedido será salvo.</p>
      )}
      <p>Pedidos e respostas detalhados ficam disponíveis por até 7 dias.</p>
      {admin ? (
        <p>
          Você não pode resolver pedidos próprios nem remover contas administrativas. A API valida
          essas permissões antes da conclusão.
        </p>
      ) : (
        <form onSubmit={submit} aria-label="Novo pedido de privacidade">
          <fieldset disabled={busy || !isSupabaseConfigured}>
            <legend>Novo pedido</legend>
            <label>
              Tipo de pedido
              <select value={kind} onChange={(event) => setKind(event.target.value as Kind)}>
                {Object.entries(kinds).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Detalhes (até 1000 caracteres)
              <textarea
                maxLength={1000}
                value={details}
                onChange={(event) => setDetails(event.target.value)}
              />
            </label>
            {kind === 'correction' && (
              <fieldset>
                <legend>Campos a corrigir (opcionais)</legend>
                {(['full_name', 'grade', 'goal'] as const).map((field, index) => (
                  <label key={field}>
                    {['Nome completo', 'Etapa escolar', 'Objetivo de estudo'][index]}
                    <input
                      value={corrections[field]}
                      maxLength={{ full_name: 120, grade: 60, goal: 500 }[field]}
                      onChange={(event) => {
                        setCorrections({ ...corrections, [field]: event.target.value });
                        setChangedFields((previous) => [...new Set([...previous, field])]);
                      }}
                    />
                  </label>
                ))}
              </fieldset>
            )}
            <Consequences kind={kind} />
            <button type="submit" className="primary-button">
              Enviar pedido
            </button>
          </fieldset>
        </form>
      )}
      {error && (
        <p role="alert" className="form-message">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="form-message">
          {message}
        </p>
      )}
      <div className="audit-heading">
        <h3 id={headingId}>{admin ? 'Fila de análise' : 'Histórico de pedidos'}</h3>
        <button
          type="button"
          className="outline-button"
          disabled={busy || loading || !isSupabaseConfigured}
          onClick={() => {
            setError('');
            void load();
          }}
        >
          Atualizar pedidos
        </button>
      </div>
      {loading && <p role="status">Carregando pedidos...</p>}
      {loaded && !requests.length && <p>Nenhum pedido registrado.</p>}
      <div aria-labelledby={headingId} className="privacy-request-list">
        {requests.map((request) => (
          <article key={request.id} className="privacy-request-card">
            <h4>
              {kinds[request.kind]} · {statuses[request.status]}
            </h4>
            <p>Protocolo: {request.id}</p>
            {admin && request.user_id && <p>Conta: {request.user_id}</p>}
            <p>{request.details}</p>
            {request.corrections && (
              <dl>
                {Object.entries(request.corrections).map(([field, value]) => (
                  <div key={field}>
                    <dt>
                      {
                        {
                          full_name: 'Nome completo',
                          grade: 'Etapa escolar',
                          goal: 'Objetivo de estudo',
                        }[field]
                      }
                    </dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            )}
            <p>Criado em: {new Date(request.created_at).toLocaleString('pt-BR')}</p>
            {request.resolved_at && (
              <p>Resolvido em: {new Date(request.resolved_at).toLocaleString('pt-BR')}</p>
            )}
            {request.expires_at && (
              <p>Expira em: {new Date(request.expires_at).toLocaleString('pt-BR')}</p>
            )}
            {request.response && <p>Resposta: {request.response}</p>}
            {!admin && request.status === 'pending' && (
              <button
                type="button"
                className="outline-button"
                disabled={busy || loading}
                onClick={() =>
                  void mutate(`/privacy/requests/${encodeURIComponent(request.id)}/cancel`)
                }
              >
                Cancelar pedido
              </button>
            )}
            {!admin && request.kind === 'access' && request.status === 'completed' && (
              <button
                type="button"
                className="outline-button"
                disabled={
                  busy ||
                  Boolean(request.expires_at && Date.parse(request.expires_at) <= Date.now())
                }
                onClick={() => void download(request)}
              >
                Baixar JSON
              </button>
            )}
            {admin &&
              request.status === 'pending' &&
              (ownIds.includes(request.id) ? (
                <p>Pedido próprio: análise bloqueada.</p>
              ) : (
                <Resolution
                  key={request.id}
                  request={request}
                  disabled={busy || loading || !loaded}
                  onResolve={(body) =>
                    void mutate(
                      `/admin/privacy-requests/${encodeURIComponent(request.id)}/resolve`,
                      body,
                    )
                  }
                />
              ))}
          </article>
        ))}
      </div>
    </div>
  );
}

/** A palavra exata impede que um clique isolado conclua operações que encerram a conta. */
function Resolution({
  request,
  disabled,
  onResolve,
}: {
  request: PrivacyRequest;
  disabled: boolean;
  onResolve: (body: {
    decision: 'complete' | 'reject';
    response: string;
    confirmation?: string;
  }) => void;
}) {
  const [decision, setDecision] = useState<'complete' | 'reject'>('complete');
  const [response, setResponse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const word =
    decision === 'complete'
      ? (
          {
            deletion: 'EXCLUIR',
            anonymization: 'ANONIMIZAR',
            opposition: 'MEDIDA CONFIRMADA',
            revocation: 'MEDIDA CONFIRMADA',
          } as Partial<Record<Kind, string>>
        )[request.kind]
      : undefined;
  return (
    <form
      aria-label="Analisar pedido"
      onSubmit={(event) => {
        event.preventDefault();
        if (disabled || response.trim().length < 2 || (word && confirmation !== word)) return;
        onResolve({ decision, response: response.trim(), ...(word ? { confirmation } : {}) });
      }}
    >
      <fieldset disabled={disabled}>
        <legend>Análise administrativa</legend>
        <label>
          Decisão
          <select
            value={decision}
            onChange={(event) => {
              setDecision(event.target.value as typeof decision);
              setConfirmation('');
            }}
          >
            <option value="complete">Concluir</option>
            <option value="reject">Recusar</option>
          </select>
        </label>
        <label>
          Resposta ao titular
          <textarea
            required
            minLength={2}
            maxLength={1000}
            value={response}
            onChange={(event) => setResponse(event.target.value)}
          />
        </label>
        {decision === 'complete' && <Consequences kind={request.kind} />}
        {decision === 'complete' &&
          (request.kind === 'opposition' || request.kind === 'revocation') && (
            <p>
              Na resposta ao titular, descreva a medida adotada e sua referência de atendimento.
            </p>
          )}
        {word && (
          <label>
            Digite {word} para confirmar
            <input
              autoComplete="off"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </label>
        )}
        <button
          type="submit"
          className="primary-button"
          disabled={response.trim().length < 2 || Boolean(word && confirmation !== word)}
        >
          Enviar decisão
        </button>
      </fieldset>
    </form>
  );
}
