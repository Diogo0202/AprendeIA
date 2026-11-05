import { useEffect, useId, useRef, useState } from 'react';
import { turnstileSiteKey } from '../lib/supabase';

type TurnstileApi = {
  ready: (callback: () => void) => void;
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}
let turnstileScript: Promise<void> | null = null;

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve();
  if (turnstileScript) return turnstileScript;
  turnstileScript = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.turnstile) resolve();
      else {
        script.remove();
        turnstileScript = null;
        reject(new Error('turnstile unavailable'));
      }
    };
    script.onerror = () => {
      script.remove();
      turnstileScript = null;
      reject(new Error('turnstile unavailable'));
    };
    document.head.appendChild(script);
  });
  return turnstileScript;
}

/** O token fica no formulário e nunca é tratado como uma credencial duradoura. */
export function TurnstileWidget({ action }: { action: 'login' | 'signup' | 'recovery' }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const tokenRef = useRef('');
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [token, setToken] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const form = inputRef.current?.form;
    const submit = (event: Event) => {
      if (!turnstileSiteKey && !import.meta.env.PROD) return;
      if (!tokenRef.current) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setError('Conclua a verificação de segurança antes de enviar.');
        return;
      }
      // O handler do formulário lê FormData no mesmo evento, antes desta microtask.
      tokenRef.current = '';
      queueMicrotask(() => {
        setToken('');
        if (inputRef.current) inputRef.current.value = '';
        if (widgetIdRef.current !== null) window.turnstile?.reset(widgetIdRef.current);
      });
    };
    form?.addEventListener('submit', submit);
    return () => form?.removeEventListener('submit', submit);
  }, []);

  useEffect(() => {
    tokenRef.current = '';
    setToken('');
    setError('');
    if (!turnstileSiteKey || !containerRef.current) return;
    let active = true;
    const clearToken = () => {
      if (!active) return;
      tokenRef.current = '';
      setToken('');
      if (inputRef.current) inputRef.current.value = '';
    };
    loadTurnstile()
      .then(() => {
        window.turnstile?.ready(() => {
          if (!active || !containerRef.current || !window.turnstile) return;
          widgetIdRef.current = window.turnstile.render(containerRef.current, {
            sitekey: turnstileSiteKey,
            action,
            theme: 'auto',
            'response-field': false,
            callback: (value: string) => {
              if (!active) return;
              tokenRef.current = value;
              if (inputRef.current) inputRef.current.value = value;
              setToken(value);
              setError('');
            },
            'expired-callback': clearToken,
            'timeout-callback': clearToken,
            'error-callback': () => {
              if (!active) return;
              clearToken();
              setError('Não foi possível carregar a verificação.');
            },
          });
        });
      })
      .catch(() => {
        if (active) setError('Não foi possível carregar a verificação.');
      });
    return () => {
      active = false;
      tokenRef.current = '';
      if (widgetIdRef.current !== null && window.turnstile)
        window.turnstile.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    };
  }, [action]);

  if (!turnstileSiteKey && !import.meta.env.PROD) return null;
  return (
    <div className="captcha-field">
      <div ref={containerRef} aria-describedby={`${inputId}-error`} />
      <input ref={inputRef} id={inputId} type="hidden" name="captcha_token" value={token} />
      {(error || !turnstileSiteKey) && (
        <small role="status" id={`${inputId}-error`}>
          {error || 'A verificação de segurança está indisponível.'}
        </small>
      )}
    </div>
  );
}
