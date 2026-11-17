import { useEffect, useId, useRef, useState } from 'react';
import { isConnected } from '../application/gateways';
import {
  privacyRequestKinds,
  privacyRequestStatuses,
  type PrivacyRequest,
  type PrivacyRequestKind,
} from '../domain/privacy';
import { usePrivacyRequestPanel } from './usePrivacyRequestPanel';

/** A consequência aparece antes do envio, pois abrir o pedido ainda não apaga dados. */
function Consequences({ kind }: { kind: PrivacyRequestKind }) {
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
function RequestPanel(props: { admin?: boolean }) {
  const { admin } = props;
  const {
    requests,
    ownIds,
    kind,
    setKind,
    details,
    setDetails,
    corrections,
    setCorrections,
    setChangedFields,
    message,
    error,
    setError,
    busy,
    loading,
    loaded,
    headingId,
    load,
    mutate,
    download,
    submit,
  } = usePrivacyRequestPanel(props);

  return (
    <div className="privacy-requests" aria-busy={busy || loading}>
      {!isConnected() && (
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
          <fieldset disabled={busy || !isConnected()}>
            <legend>Novo pedido</legend>
            <label>
              Tipo de pedido
              <select
                value={kind}
                onChange={(event) => setKind(event.target.value as PrivacyRequestKind)}
              >
                {Object.entries(privacyRequestKinds).map(([value, label]) => (
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
          disabled={busy || loading || !isConnected()}
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
              {privacyRequestKinds[request.kind]} · {privacyRequestStatuses[request.status]}
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
          } as Partial<Record<PrivacyRequestKind, string>>
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
