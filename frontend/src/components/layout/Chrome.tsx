import { useEffect, useState } from 'react';
import FallbackAvatar, { type AvatarKey } from '../FallbackAvatar';
import { PrivacyRequests } from '../PrivacyRequests';
import { PrivacyPolicyAccess } from '../PrivacyPolicyAccess';
import { applyInterfaceTheme } from '../../lib/theme';

/** Identidade visual compartilhada entre autenticação e painéis. */
export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <span />
      </span>
      <span>aprendeIA</span>
    </div>
  );
}

/** Cabeçalho comum que identifica a área atual e oferece saída explícita. */
export function Header({ onLogout, area }: { onLogout: () => void; area: string }) {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      return window.localStorage.getItem('aprendeia-interface-theme') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  useEffect(() => applyInterfaceTheme(theme), [theme]);

  return (
    <header className="topbar">
      <Brand />
      <span className="area-name">{area}</span>
      <PrivacyPolicyAccess label="Privacidade" />
      {/* O acesso comum inclui contas docentes ainda aguardando aprovação. */}
      <PrivacyRequests />
      <button
        className="theme-toggle"
        type="button"
        aria-pressed={theme === 'dark'}
        onClick={() => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20.6 15.2A8.7 8.7 0 0 1 8.8 3.4 8.7 8.7 0 1 0 20.6 15.2Z" />
        </svg>
        {theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
      </button>
      <button className="logout" onClick={onLogout}>
        Sair
      </button>
    </header>
  );
}

/** Gera iniciais previsíveis enquanto o avatar ilustrado não foi escolhido. */
export function Avatar({
  name,
  className = '',
  avatarKey = 'orbit',
  size = 38,
}: {
  name: string;
  className?: string;
  avatarKey?: AvatarKey;
  size?: number;
}) {
  return <FallbackAvatar name={name} avatarKey={avatarKey} className={className} size={size} />;
}

/** Converte o nível pedagógico em uma indicação visual consistente. */
export function Difficulty({ level, tone }: { level: string; tone: string }) {
  return <span className={`difficulty ${tone}`}>{level}</span>;
}
