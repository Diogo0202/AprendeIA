import { useEffect, useRef, useState } from 'react';
import { isConnected } from '../../application/gateways';
import { failureMessage, type Result } from '../../application/result';

type Loader<T> = (signal: AbortSignal) => Promise<Result<T>>;

/**
 * Carrega um painel e mostra a mensagem segura do backend em caso de erro.
 * `key` muda quando os filtros mudam e dispara uma nova leitura.
 */
export function useAdminData<T>(key: string, load: Loader<T>, initial: T) {
  const [data, setData] = useState<T>(initial);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(isConnected());
  const [version, setVersion] = useState(0);
  const loader = useRef(load);
  loader.current = load;

  useEffect(() => {
    if (!isConnected()) return;
    const controller = new AbortController();
    setLoading(true);
    void (async () => {
      try {
        const loaded = await loader.current(controller.signal);
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
  }, [key, version]);

  return { data, error, loading, reload: () => setVersion((value) => value + 1) };
}
