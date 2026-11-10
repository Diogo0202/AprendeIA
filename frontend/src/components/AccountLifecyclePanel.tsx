import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { apiFetch } from '../lib/api';
import {
  InstitutionalAdmission,
  isAccountLifecycleStatus,
  type AccountLifecycleStatus,
  type AccountRole,
} from './InstitutionalAdmission';

export type AccountLifecyclePanelProps = {
  userId: string;
  role: AccountRole;
  children?: ReactNode;
};

/** Montar com key={userId} ao trocar a sessão. Toda liberação vem de GET /account/status. */
export function AccountLifecyclePanel({ userId, role, children }: AccountLifecyclePanelProps) {
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{
    userId: string;
    revision: number;
    status: AccountLifecycleStatus;
  } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const status = result?.userId === userId && result.revision === revision ? result.status : null;
  const refresh = () => setRevision((value) => value + 1);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    async function load() {
      try {
        if (!userId) throw new Error();
        const response = await apiFetch('/account/status', { signal: controller.signal });
        if (!response.ok) throw new Error();
        const data: unknown = await response.json();
        if (!isAccountLifecycleStatus(data)) throw new Error();
        if (!controller.signal.aborted) setResult({ userId, revision, status: data });
      } catch {
        if (!controller.signal.aborted)
          setError('Não foi possível consultar o estado da conta. Recursos bloqueados.');
      }
    }
    void load();
    return () => controller.abort();
  }, [userId, revision]);

  useEffect(() => {
    const visible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', visible);
    document.addEventListener('visibilitychange', visible);
    const timer = window.setInterval(visible, 30_000);
    return () => {
      window.removeEventListener('focus', visible);
      document.removeEventListener('visibilitychange', visible);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!status?.allowed || !status.expires_at) return;
    const remaining = Date.parse(status.expires_at) - Date.now();
    // Uma resposta com prazo já passado será revalidada pelo polling, sem loop de rede.
    if (remaining <= 0) return;
    const timer = window.setTimeout(refresh, Math.min(remaining, 2_147_483_647));
    return () => window.clearTimeout(timer);
  }, [status]);

  async function write(event: FormEvent<HTMLFormElement>, kind: 'age' | 'admission') {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload =
      kind === 'age'
        ? { age_band: data.get('age_band') }
        : {
            responsible_name: String(data.get('responsible_name') ?? '').trim(),
            responsible_contact: String(data.get('responsible_contact') ?? '').trim(),
            institutional_reference: String(data.get('institutional_reference') ?? '').trim(),
            version: '1',
          };
    if (
      kind === 'admission' &&
      Object.values(payload).some((value) => typeof value !== 'string' || value.length < 1)
    )
      return;
    setBusy(true);
    setMessage('');
    // Bloqueia enquanto a alteração é processada; não infere aprovação pela resposta de escrita.
    setResult(null);
    try {
      const response = await apiFetch(kind === 'age' ? '/account/age-band' : '/account/admission', {
        method: kind === 'age' ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error();
      setMessage(
        kind === 'age'
          ? 'Faixa etária enviada. Consultando a decisão do servidor.'
          : 'Pedido enviado para revisão administrativa. O envio não significa aprovação.',
      );
      form.reset();
    } catch {
      setMessage('Não foi possível registrar a solicitação. Nenhuma aprovação foi confirmada.');
    } finally {
      setBusy(false);
      refresh();
    }
  }

  return (
    <>
      {error && <p role="alert">{error}</p>}
      <InstitutionalAdmission role={role} status={status}>
        {!busy && children}
      </InstitutionalAdmission>
      <button type="button" disabled={busy} onClick={refresh}>
        Consultar estado da conta
      </button>
      {role !== 'admin' && (
        <>
          <form
            aria-label="Declaração de faixa etária"
            onSubmit={(event) => void write(event, 'age')}
          >
            <fieldset disabled={busy}>
              <legend>Declare sua faixa etária</legend>
              <label>
                Faixa etária
                <select name="age_band" required defaultValue="">
                  <option value="" disabled>
                    Selecione
                  </option>
                  <option value="adult">18 anos ou mais</option>
                  <option value="minor">Menos de 18 anos</option>
                  <option value="unknown">Não informado</option>
                </select>
              </label>
              <button type="submit">Enviar faixa etária</button>
            </fieldset>
          </form>
          {status?.age_band === 'minor' && (
            <form
              aria-label="Pedido de admissão"
              onSubmit={(event) => void write(event, 'admission')}
            >
              <fieldset disabled={busy}>
                <legend>Solicitar admissão institucional</legend>
                <p>
                  Informe a referência do registro institucional. Não envie documentos ou dados
                  sensíveis neste campo.
                </p>
                <label>
                  Nome do responsável
                  <input name="responsible_name" minLength={2} maxLength={120} required />
                </label>
                <label>
                  Contato do responsável
                  <input name="responsible_contact" minLength={3} maxLength={200} required />
                </label>
                <label>
                  Referência institucional
                  <input name="institutional_reference" minLength={2} maxLength={200} required />
                </label>
                <button type="submit">Enviar pedido de admissão</button>
              </fieldset>
            </form>
          )}
        </>
      )}
      {busy && <p role="status">Enviando solicitação.</p>}
      {message && <p role="status">{message}</p>}
    </>
  );
}
