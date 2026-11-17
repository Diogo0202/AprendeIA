import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { CookieConsent } from './components/CookieConsent';
import { AboutPage } from './components/AboutPage';
import { verifyPublicGuest } from './adapters/browser/tracking';
import { apiUrl, supabase } from './adapters/supabase/client';
import { loadLegalDocuments } from './adapters/http/legalVersions';
import { createHttpGateways } from './adapters/http/gateways';
import { provideGateways } from './application/gateways';

// Raiz de composição: as telas recebem as portas já ligadas ao adaptador HTTP.
provideGateways(createHttpGateways());
void loadLegalDocuments(apiUrl);

const about = window.location.pathname === '/sobre';
if (about) {
  if (supabase) {
    supabase.auth
      .getSession()
      .then(({ data, error }) => verifyPublicGuest(!error && !data.session))
      .catch(() => verifyPublicGuest(false));
    supabase.auth.onAuthStateChange((_event, session) => verifyPublicGuest(!session));
  } else verifyPublicGuest(true);
}

// StrictMode ajuda a detectar efeitos sem limpeza durante o desenvolvimento.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <a
      className="skip-link"
      href="#main-content"
      onClick={(event) => {
        event.preventDefault();
        const main = document.getElementById('main-content');
        main?.focus();
        main?.scrollIntoView({ block: 'start' });
      }}
    >
      Pular para o conteúdo principal
    </a>
    {about ? <AboutPage /> : <App />}
    <CookieConsent />
  </StrictMode>,
);
