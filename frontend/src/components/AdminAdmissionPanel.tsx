import { useEffect, useState, type FormEvent } from 'react';
import { apiFetch } from '../lib/api';

type AdmissionRequest = {
  id: string;
  user_id: string;
  responsible_name: string;
  responsible_contact: string;
  institutional_reference: string;
  decision: string;
  version: string;
};

function isRequest(value: unknown): value is AdmissionRequest {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return [
    'id',
    'user_id',
    'responsible_name',
    'responsible_contact',
    'institutional_reference',
    'decision',
    'version',
  ].every((field) => typeof row[field] === 'string');
}

/** A área administrativa e a API devem conferir o papel admin. */
export function AdminAdmissionPanel() {
  const [rows, setRows] = useState<AdmissionRequest[]>([]);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setRows([]);
    async function load() {
      try {
        const response = await apiFetch('/admin/account-admissions', { signal: controller.signal });
        if (!response.ok) throw new Error();
        const data: unknown = await response.json();
        if (!Array.isArray(data) || !data.every(isRequest)) throw new Error();
        if (!controller.signal.aborted) setRows(data);
      } catch {
        if (!controller.signal.aborted)
          setMessage('Não foi possível consultar os pedidos de admissão.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [revision]);

  async function review(event: FormEvent<HTMLFormElement>, row: AdmissionRequest) {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(event.currentTarget);
    const decision = data.get('decision');
    const note = String(data.get('note') ?? '').trim();
    if (
      (decision !== 'approved' && decision !== 'rejected') ||
      note.length < 2 ||
      row.version !== '1'
    ) {
      setMessage('Informe uma decisão e uma justificativa válida para a versão 1.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const response = await apiFetch(
        `/admin/account-admissions/${encodeURIComponent(row.id)}/review`,
        {
          method: 'POST',
          body: JSON.stringify({ decision, version: '1', note }),
        },
      );
      if (!response.ok) throw new Error();
      setMessage('Revisão registrada pelo servidor. Atualizando pedidos.');
      setRevision((value) => value + 1);
    } catch {
      setMessage('Revisão recusada ou indisponível. Nenhuma aprovação foi confirmada.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Revisão administrativa de admissões">
      <h2>Admissão de menores</h2>
      <p>
        Confira o registro institucional antes de decidir. E-mail recebido não comprova admissão.
      </p>
      <button
        disabled={busy || loading}
        type="button"
        onClick={() => {
          setMessage('');
          setRevision((value) => value + 1);
        }}
      >
        Atualizar pedidos
      </button>
      {loading ? (
        <p role="status">Consultando pedidos.</p>
      ) : (
        rows.length === 0 && <p>Nenhum pedido disponível.</p>
      )}
      {!loading &&
        rows.map((row) => (
          <form
            key={row.id}
            aria-label={`Revisar pedido ${row.id}`}
            onSubmit={(event) => void review(event, row)}
          >
            <h3>Pedido {row.id}</h3>
            <p>
              Conta: {row.user_id}. Estado: {row.decision}. Versão: {row.version}.
            </p>
            <p>
              Responsável: {row.responsible_name}. Contato: {row.responsible_contact}.
            </p>
            <p>Referência institucional: {row.institutional_reference}.</p>
            <fieldset disabled={busy || row.decision !== 'pending' || row.version !== '1'}>
              <label>
                Decisão
                <select name="decision" required defaultValue="">
                  <option value="" disabled>
                    Selecione
                  </option>
                  <option value="approved">Aprovar admissão</option>
                  <option value="rejected">Recusar admissão</option>
                </select>
              </label>
              <label>
                Justificativa da revisão
                <textarea name="note" required minLength={2} maxLength={500} />
              </label>
              <button type="submit">Registrar revisão</button>
            </fieldset>
          </form>
        ))}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
