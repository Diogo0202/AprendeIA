import { useEffect, useState } from 'react';
import { gateways, isConnected } from '../../application/gateways';
import { failureMessage } from '../../application/result';

/** Carrega uma rota do painel e mostra a mensagem segura do backend em caso de erro. */
export function useAdminData<T>(path: string, initial: T) {
  const [data, setData] = useState<T>(initial);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(isConnected());
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!isConnected()) return;
    const controller = new AbortController();
    setLoading(true);
    void (async () => {
      try {
        const loaded = await gateways().admin.panel<T>(path, controller.signal);
        if (!loaded.ok)
          throw new Error(failureMessage(loaded, 'Não foi possível carregar os dados.'));
        const body = loaded.data;
        if (!controller.signal.aborted) {
          setData(body);
          setError('');
        }
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os dados.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [path, version]);

  return { data, error, loading, reload: () => setVersion((value) => value + 1) };
}
