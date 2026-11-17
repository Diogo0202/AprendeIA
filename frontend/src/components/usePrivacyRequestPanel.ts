import { FormEvent, useCallback, useEffect, useId, useState } from 'react';
import { gateways, isConnected } from '../application/gateways';
import { failureMessage } from '../application/result';
import type { PrivacyRequest, PrivacyRequestKind } from '../domain/privacy';

/** Estado e ações de RequestPanel; a tela só exibe o que este hook devolve. */
export function usePrivacyRequestPanel({ admin = false }: { admin?: boolean }) {
  const [requests, setRequests] = useState<PrivacyRequest[]>([]);
  const [ownIds, setOwnIds] = useState<string[]>([]);
  const [kind, setKind] = useState<PrivacyRequestKind>('access');
  const [details, setDetails] = useState('');
  const [corrections, setCorrections] = useState({ full_name: '', grade: '', goal: '' });
  const [changedFields, setChangedFields] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const headingId = useId();

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!isConnected()) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setLoaded(false);
      try {
        // A lista pessoal identifica pedidos próprios sem depender de campos fora do contrato.
        const { privacy } = gateways();
        const results = await Promise.all([
          privacy.requests<PrivacyRequest[]>(admin ? 'all' : 'own', signal),
          ...(admin ? [privacy.requests<PrivacyRequest[]>('own', signal)] : []),
        ]);
        const loaded = results.map((result) => {
          if (!result.ok)
            throw new Error(failureMessage(result, 'Não foi possível carregar os pedidos.'));
          return result.data;
        });
        const items = loaded[0];
        const own = admin ? loaded[1] : [];
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
    [admin],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function mutate(path: string, body?: object) {
    if (busy || !isConnected()) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const submitted = await gateways().privacy.submit(path, body);
      if (!submitted.ok)
        throw new Error(failureMessage(submitted, 'Não foi possível concluir a operação.'));
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
    if (busy || !isConnected()) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const exported = await gateways().privacy.exportData(request.id);
      if (!exported.ok)
        throw new Error(failureMessage(exported, 'Não foi possível baixar os dados.'));
      // O arquivo recebe um nome fixo para não carregar dados pessoais no nome do download.
      const url = URL.createObjectURL(exported.data);
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

  return {
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
  };
}
