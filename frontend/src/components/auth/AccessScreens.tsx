import type { UserProfile } from '../../domain/app';
import { Header } from '../layout/Chrome';

/** Evita que uma navegação manipulada no cliente revele a área de outro cargo. */
export function AccessDenied({ onLogout }: { onLogout: () => void }) {
  return (
    <main id="main-content" tabIndex={-1} className="profile-page">
      <Header area="ACESSO RESTRITO" onLogout={onLogout} />
      <section className="profile-content narrow">
        <p className="eyebrow">PERMISSÃO NECESSÁRIA</p>
        <h1>Essa área não está disponível para seu perfil.</h1>
        <p className="subtitle">
          Sua sessão continua protegida. Saia e entre com uma conta autorizada.
        </p>
      </section>
    </main>
  );
}

/** Explica o próximo passo sem liberar ferramentas docentes antes da aprovação. */
export function TeacherPending({
  profile,
  onLogout,
}: {
  profile: UserProfile;
  onLogout: () => void;
}) {
  return (
    <main id="main-content" tabIndex={-1} className="profile-page">
      <Header area="CADASTRO DE PROFESSOR" onLogout={onLogout} />
      <section className="profile-content narrow pending-teacher-page">
        <span className="pending-seal" aria-hidden="true">
          P
        </span>
        <p className="eyebrow">SOLICITAÇÃO RECEBIDA</p>
        <h1>Seu espaço docente está quase pronto.</h1>
        <p className="subtitle">
          A administradora precisa confirmar seu cadastro em{' '}
          {profile.requestedSubject || 'sua disciplina'}. Depois disso, este mesmo login abre o
          painel de turmas, conteúdos e relatórios.
        </p>
        <div className="pending-steps" aria-label="Etapas do cadastro de professor">
          <span className="done">
            <strong>1</strong> Solicitação enviada
          </span>
          <span className="current">
            <strong>2</strong> Validação da disciplina
          </span>
          <span>
            <strong>3</strong> Painel liberado
          </span>
        </div>
      </section>
    </main>
  );
}
