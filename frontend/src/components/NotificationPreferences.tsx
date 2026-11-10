import { FormEvent, useEffect, useId, useState } from 'react';
import { apiError, apiFetch } from '../lib/api';
import { isSupabaseConfigured } from '../lib/supabase';

type Preferences = {
  email_difficulty_alerts: boolean;
  email_weekly_summary: boolean;
};
const defaults: Preferences = { email_difficulty_alerts: true, email_weekly_summary: true };

/** Desligar o e-mail não esconde o alerta: o painel continua sendo a fonte completa. */
export function NotificationPreferences() {
  const headingId = useId();
  const [preferences, setPreferences] = useState<Preferences>(defaults);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await apiFetch('/teacher/notification-preferences', {
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error(await apiError(response, 'Não foi possível carregar as preferências.'));
        const data = (await response.json()) as Preferences;
        if (controller.signal.aborted) return;
        setPreferences({
          email_difficulty_alerts: data.email_difficulty_alerts,
          email_weekly_summary: data.email_weekly_summary,
        });
        setLoaded(true);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error ? cause.message : 'Não foi possível carregar as preferências.',
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !loaded) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await apiFetch('/teacher/notification-preferences', {
        method: 'PUT',
        body: JSON.stringify(preferences),
      });
      if (!response.ok)
        throw new Error(await apiError(response, 'Não foi possível salvar as preferências.'));
      setMessage('Preferências salvas.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar as preferências.');
    } finally {
      setBusy(false);
    }
  }

  const toggle = (field: keyof Preferences) =>
    setPreferences((current) => ({ ...current, [field]: !current[field] }));

  return (
    <section className="teacher-surface" aria-labelledby={headingId} aria-busy={loading || busy}>
      <div className="report-copy">
        <h2 id={headingId}>Notificações por e-mail</h2>
        <p>
          Os alertas continuam no painel mesmo com o e-mail desligado. A mudança vale para os
          próximos envios.
        </p>
      </div>
      {!isSupabaseConfigured && (
        <p className="form-message">Conecte o Supabase para salvar suas preferências.</p>
      )}
      <form onSubmit={(event) => void save(event)}>
        <fieldset disabled={busy || loading || !loaded}>
          <label>
            <input
              type="checkbox"
              checked={preferences.email_difficulty_alerts}
              onChange={() => toggle('email_difficulty_alerts')}
            />{' '}
            Alerta imediato de dificuldade
          </label>
          <label>
            <input
              type="checkbox"
              checked={preferences.email_weekly_summary}
              onChange={() => toggle('email_weekly_summary')}
            />{' '}
            Resumo semanal da disciplina
          </label>
          <button type="submit" className="primary-button">
            {busy ? 'Salvando...' : 'Salvar preferências'}
          </button>
        </fieldset>
      </form>
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
    </section>
  );
}
