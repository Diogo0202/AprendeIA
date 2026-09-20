import { useEffect, useId, useRef, useState } from "react";
import { turnstileSiteKey } from "../lib/supabase";

type TurnstileApi = {
  ready: (callback: () => void) => void;
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
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
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("turnstile unavailable"));
    document.head.appendChild(script);
  });
  return turnstileScript;
}

/** O token fica no formulário e nunca é tratado como uma credencial duradoura. */
export function TurnstileWidget({ action }: { action: "login" | "signup" | "recovery" }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const inputId = useId();
  const [token, setToken] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!turnstileSiteKey || !containerRef.current) return;
    let active = true;
    loadTurnstile()
      .then(() => {
        window.turnstile?.ready(() => {
          if (!active || !containerRef.current || !window.turnstile) return;
          widgetIdRef.current = window.turnstile.render(containerRef.current, {
            sitekey: turnstileSiteKey,
            action,
            theme: "auto",
            callback: (value: string) => {
              setToken(value);
              setError("");
            },
            "expired-callback": () => setToken(""),
            "error-callback": () => setError("Não foi possível carregar a verificação."),
          });
        });
      })
      .catch(() => {
        if (active) setError("Não foi possível carregar a verificação.");
      });
    return () => {
      active = false;
      if (widgetIdRef.current && window.turnstile) window.turnstile.remove(widgetIdRef.current);
    };
  }, [action]);

  if (!turnstileSiteKey) return null;
  return (
    <div className="captcha-field">
      <div ref={containerRef} aria-describedby={`${inputId}-error`} />
      <input id={inputId} type="hidden" name="captcha_token" value={token} />
      {error && <small id={`${inputId}-error`}>{error}</small>}
    </div>
  );
}
