import { useEffect, useId, useRef, useState } from 'react';
import {
  deniedCookieChoice,
  readCookieConsent,
  saveCookieConsent,
  trackingConfiguration,
  watchCookieConsent,
  type CookieChoice,
} from '../lib/tracking';
import './cookies.css';

/** Preferências opcionais são separadas do aceite necessário para a conta. */
export function CookieConsent() {
  const [missing, setMissing] = useState(() => readCookieConsent() === null);
  const [error, setError] = useState('');
  const [choice, setChoice] = useState<CookieChoice>(deniedCookieChoice);
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  useEffect(() => {
    const update = () => setMissing(readCookieConsent() === null);
    const unwatch = watchCookieConsent();
    window.addEventListener('storage', update);
    window.addEventListener('aprendeia:cookie-choice', update);
    window.addEventListener('aprendeia:cookie-expired', update);
    return () => {
      unwatch();
      window.removeEventListener('storage', update);
      window.removeEventListener('aprendeia:cookie-choice', update);
      window.removeEventListener('aprendeia:cookie-expired', update);
    };
  }, []);
  function choose(value: CookieChoice) {
    if (!saveCookieConsent(value)) {
      setError('O navegador não permitiu salvar a escolha. Os opcionais permanecem bloqueados.');
      return;
    }
    setError('');
    setMissing(false);
    dialog.current?.close();
  }
  function personalize() {
    setChoice(readCookieConsent() || deniedCookieChoice);
    dialog.current?.showModal();
  }
  const configured = trackingConfiguration();
  return (
    <>
      {missing && (
        <section className="cookie-banner" aria-label="Aviso de cookies">
          <h2>Suas escolhas de privacidade</h2>
          <p>
            Autenticação e segurança precisam de recursos necessários. Estatísticas e gravação de
            sessão são opcionais, separados e permitidos somente na página Sobre, após sua escolha.
          </p>
          <div className="cookie-actions">
            <button
              className="cookie-choice"
              onClick={() => choose({ statistics: true, recording: true })}
            >
              Aceitar opcionais
            </button>
            <button className="cookie-choice" onClick={() => choose(deniedCookieChoice)}>
              Recusar opcionais
            </button>
            <button className="cookie-choice" onClick={personalize}>
              Personalizar
            </button>
          </div>
        </section>
      )}
      <footer className="cookie-footer">
        <button type="button" className="cookie-choice" onClick={personalize}>
          Preferências de cookies
        </button>
        <a href="/sobre">Sobre e canais de privacidade</a>
      </footer>
      <dialog
        ref={dialog}
        className="cookie-dialog"
        aria-labelledby={title}
        onCancel={() => setError('')}
      >
        <h2 id={title}>Preferências de cookies</h2>
        <p>
          A escolha vale por até sete dias neste navegador e pode ser alterada aqui. Recusar os
          opcionais preserva o acesso à plataforma.
        </p>
        <dl>
          <dt>Necessários</dt>
          <dd>
            Supabase mantém a sessão. Turnstile verifica segurança quando configurado. Preferências
            visuais e sua escolha de cookies ficam no navegador.
          </dd>
          <dt>Estatísticas (Google Analytics 4)</dt>
          <dd>
            Visitas à página Sobre. Não enviamos dados da conta ou conteúdo acadêmico. A retenção
            externa depende da configuração do fornecedor.
          </dd>
          <dt>Gravação de sessão (Microsoft Clarity)</dt>
          <dd>
            Interações na página Sobre, com conteúdo mascarado. Não há gravação nos formulários de
            acesso nem nos painéis.
          </dd>
        </dl>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            choose(choice);
          }}
        >
          <label>
            <input
              type="checkbox"
              checked={choice.statistics}
              onChange={(e) => setChoice({ ...choice, statistics: e.target.checked })}
            />{' '}
            Permitir estatísticas
          </label>
          {!configured.statistics && (
            <p>
              GA4 está desativado nesta instalação. Sua escolha não ativa um fornecedor sem
              configuração aprovada.
            </p>
          )}
          <label>
            <input
              type="checkbox"
              checked={choice.recording}
              onChange={(e) => setChoice({ ...choice, recording: e.target.checked })}
            />{' '}
            Permitir gravação de sessão
          </label>
          {!configured.recording && <p>Clarity está desativado nesta instalação.</p>}
          <div className="cookie-actions">
            <button className="cookie-choice" type="submit">
              Salvar escolhas
            </button>
            <button
              className="cookie-choice"
              type="button"
              onClick={() => choose(deniedCookieChoice)}
            >
              Recusar opcionais
            </button>
            <button className="cookie-choice" type="button" onClick={() => dialog.current?.close()}>
              Fechar
            </button>
          </div>
        </form>
        {error && <p role="alert">{error}</p>}
      </dialog>
      {error && !dialog.current?.open && <p role="alert">{error}</p>}
    </>
  );
}
