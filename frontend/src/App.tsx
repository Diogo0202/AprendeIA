import { FormEvent, useEffect, useRef, useState } from 'react';
import { AccountLifecyclePanel } from './components/AccountLifecyclePanel';
import type { AvatarKey } from './components/FallbackAvatar';
import { PrivacyRequests } from './components/PrivacyRequests';
import { TermsOfUseAccess } from './components/LegalDocuments';
import { PrivacyConsentCheckbox, PrivacyPolicyAccess } from './components/PrivacyPolicyAccess';
import { apiError, apiFetch } from './lib/api';
import { clearAuthCallbackUrl } from './lib/recovery';
import {
  currentLegalDocuments,
  loadLegalDocuments,
  useCurrentLegalDocuments,
} from './lib/legalVersions';
import { apiUrl, isSupabaseConfigured, supabase } from './lib/supabase';
import type {
  View,
  Role,
  SignupRole,
  AccentTheme,
  LoginSessionPayload,
  UserProfile,
} from './types/app';
import { applyAccentTheme } from './lib/theme';
import { Brand, Header } from './components/layout/Chrome';
import { Login, Signup, ForgotPassword, ResetPassword } from './components/auth/AuthScreens';
import { StudentProfile } from './components/student/StudentProfile';
import { PracticeProfile } from './components/student/PracticeProfile';
import { TeacherProfile } from './components/teacher/TeacherProfile';
import { AdminProfile } from './components/admin/AdminProfile';

function passwordPolicyError(password: string) {
  if (password.length < 6) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (password.length > 128) return 'A senha pode ter no máximo 128 caracteres.';
  if (!/[A-Z]/.test(password)) return 'A senha precisa ter pelo menos uma letra maiúscula.';
  if (!/[a-z]/.test(password)) return 'A senha precisa ter pelo menos uma letra minúscula.';
  if (!/\d/.test(password)) return 'A senha precisa ter pelo menos um número.';
  return '';
}

// Dados de demonstração permitem apresentar o TCC sem serviços externos.
const initialProfile: UserProfile = {
  name: 'Diogo Mendes Baptista',
  email: 'diogo@email.com',
  grade: 'Graduação',
  goal: 'Reforçar meus estudos',
  role: 'student',
  avatarKey: 'orbit',
  featuredBadgeId: null,
  accentTheme: 'wine',
  profileSetupComplete: false,
};

/**
 * Coordena autenticação, restauração de sessão e troca entre os três perfis.
 * O cargo sempre é carregado de `profiles`; o formulário não decide permissões.
 */
export default function App() {
  const legalDocuments = useCurrentLegalDocuments();
  const PRIVACY_POLICY_VERSION = legalDocuments?.privacy.version ?? '';
  const TERMS_OF_USE_VERSION = legalDocuments?.terms.version ?? '';

  async function confirmDisplayedVersions(form: HTMLFormElement) {
    const displayed = currentLegalDocuments();
    const current = await loadLegalDocuments(apiUrl);
    if (
      !displayed ||
      !current ||
      displayed.privacy.version !== current.privacy.version ||
      displayed.terms.version !== current.terms.version
    ) {
      for (const name of ['privacy_policy_accepted', 'terms_of_use_accepted']) {
        const box = form.elements.namedItem(name);
        if (box instanceof HTMLInputElement) box.checked = false;
      }
      setAuthMessage(
        current
          ? 'Os documentos foram atualizados. Leia e confirme as versões vigentes.'
          : 'Não foi possível consultar as versões legais. Tente novamente.',
      );
      setAuthLoading(false);
      return false;
    }
    return true;
  }
  // O atalho de apresentação só existe sem Supabase; ele não cria sessão nem
  // atravessa as permissões do backend.
  const demoTeacher =
    import.meta.env.DEV &&
    !isSupabaseConfigured &&
    new URLSearchParams(window.location.search).get('demo') === 'teacher';
  const [view, setView] = useState<View>(demoTeacher ? 'teacher' : 'login');
  const [profile, setProfile] = useState<UserProfile>(
    demoTeacher ? { ...initialProfile, role: 'teacher' } : initialProfile,
  );
  const [practiceSubject, setPracticeSubject] = useState('Matemática');
  const [authMessage, setAuthMessage] = useState('');
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const recoveryActive = useRef(false);
  const enter = (role: Role) => setView(role);

  useEffect(() => applyAccentTheme(profile.accentTheme), [profile.accentTheme]);

  // Restaura a sessão ao recarregar a página e remove o listener ao desmontar.
  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      if (recoveryActive.current) return;
      if (data.session?.user.id) void loadProfile(data.session.user.id);
      else setAuthLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        recoveryActive.current = true;
        clearAuthCallbackUrl();
        setView('reset-password');
        setAuthLoading(false);
        return;
      }
      if (event === 'SIGNED_OUT') {
        recoveryActive.current = false;
        setView('login');
        setAuthLoading(false);
      }
      if (event === 'SIGNED_IN' && session?.user.id && !recoveryActive.current)
        void loadProfile(session.user.id);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  /** Carrega a identidade e direciona o usuário para sua área autorizada. */
  async function loadProfile(userId: string) {
    if (!supabase) return;
    setAuthLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select(
        'id,email,full_name,role,grade,goal,registration_status,requested_subject,avatar_key,featured_badge_id,accent_theme,profile_setup_complete,privacy_policy_version,terms_of_use_version',
      )
      .eq('id', userId)
      .single();
    if (error || !data) {
      setAuthMessage('Não foi possível carregar o perfil. Verifique a migração do Supabase.');
      setAuthLoading(false);
      return;
    }
    const role = data.role as Role;
    if (!['student', 'teacher', 'admin'].includes(role)) {
      setAuthMessage('Este usuário não possui um cargo válido.');
      setAuthLoading(false);
      return;
    }
    setProfile({
      id: data.id,
      name: data.full_name,
      email: data.email,
      grade: data.grade,
      goal: data.goal,
      role,
      registrationStatus: data.registration_status,
      requestedSubject: data.requested_subject || undefined,
      avatarKey: (data.avatar_key || 'orbit') as AvatarKey,
      featuredBadgeId: data.featured_badge_id || null,
      accentTheme: (data.accent_theme || 'wine') as AccentTheme,
      profileSetupComplete: Boolean(data.profile_setup_complete),
    });
    setView(
      data.privacy_policy_version !== currentLegalDocuments()?.privacy.version ||
        data.terms_of_use_version !== currentLegalDocuments()?.terms.version
        ? 'privacy-consent'
        : data.registration_status === 'pending_teacher'
          ? 'teacher-pending'
          : role,
    );
    setAuthMessage('');
    setAuthLoading(false);
  }

  /** Passa pelo backend para aplicar o limite antes de criar a sessão Supabase. */
  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setAuthMessage('');
    setAuthLoading(true);
    if (!supabase) {
      if (!import.meta.env.DEV) {
        setAuthMessage('O acesso está indisponível: a configuração da plataforma está incompleta.');
        setAuthLoading(false);
        return;
      }
      // A demonstração local fica somente como estudante; cargos reais exigem
      // sessão do Supabase e são definidos pelo perfil carregado no backend.
      setProfile(initialProfile);
      enter('student');
      setAuthLoading(false);
      return;
    }
    try {
      const loginResponse = await fetch(`${apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: String(data.get('email')),
          password: String(data.get('password')),
          captcha_token: String(data.get('captcha_token') || '') || undefined,
        }),
      });
      const payload = (await loginResponse.json().catch(() => ({}))) as LoginSessionPayload;
      if (!loginResponse.ok) {
        if (loginResponse.status === 429) {
          const seconds = Number(loginResponse.headers.get('Retry-After') || 300);
          const minutes = Math.max(1, Math.ceil(seconds / 60));
          setAuthMessage(
            `Limite de tentativas atingido. Tente novamente em ${minutes} minuto${minutes === 1 ? '' : 's'}.`,
          );
        } else if (loginResponse.status >= 500) {
          setAuthMessage('O login está temporariamente indisponível. Tente novamente mais tarde.');
        } else {
          setAuthMessage('E-mail ou senha inválidos.');
        }
        setAuthLoading(false);
        return;
      }
      if (!payload.access_token || !payload.refresh_token) {
        setAuthMessage('O login está temporariamente indisponível. Tente novamente mais tarde.');
        setAuthLoading(false);
        return;
      }
      const { error } = await supabase.auth.setSession({
        access_token: payload.access_token,
        refresh_token: payload.refresh_token,
      });
      if (error) {
        setAuthMessage('Não foi possível abrir sua sessão. Tente novamente.');
        setAuthLoading(false);
      }
    } catch {
      setAuthMessage('Não foi possível conectar ao servidor. Tente novamente.');
      setAuthLoading(false);
    }
  }

  /** Mantém professor como solicitação até a administradora confirmar a disciplina. */
  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setAuthMessage('');
    setAuthLoading(true);
    const requestedRole = String(data.get('role') || 'student') as SignupRole;
    const consentsAccepted =
      data.get('privacy_policy_accepted') === 'true' &&
      data.get('terms_of_use_accepted') === 'true';
    if (!consentsAccepted) {
      setAuthMessage(
        'Para criar a conta, leia e aceite os Termos de Uso e a Política de Privacidade.',
      );
      setAuthLoading(false);
      return;
    }
    const password = String(data.get('password'));
    const passwordError = passwordPolicyError(password);
    if (passwordError) {
      setAuthMessage(passwordError);
      setAuthLoading(false);
      return;
    }
    const requestedSubject = String(data.get('subject') || '');
    const nextProfile: UserProfile = {
      name: String(data.get('name') || initialProfile.name),
      email: String(data.get('email') || initialProfile.email),
      grade:
        requestedRole === 'student' ? String(data.get('grade') || 'Ensino Médio') : 'Professor',
      goal: 'Reforçar meus estudos',
      role: requestedRole,
      avatarKey: 'orbit',
      featuredBadgeId: null,
      accentTheme: 'wine',
      profileSetupComplete: requestedRole !== 'student',
    };
    if (!supabase) {
      if (!import.meta.env.DEV) {
        setAuthMessage(
          'O cadastro está indisponível: a configuração da plataforma está incompleta.',
        );
        setAuthLoading(false);
        return;
      }
      // O atalho de apresentação fica restrito ao desenvolvimento local.
      setProfile(nextProfile);
      setView(requestedRole);
      setAuthLoading(false);
      return;
    }
    if (!(await confirmDisplayedVersions(event.currentTarget))) return;
    const { data: signUpData, error } = await supabase.auth.signUp({
      email: nextProfile.email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        captchaToken: String(data.get('captcha_token') || '') || undefined,
        data: {
          full_name: nextProfile.name,
          grade: nextProfile.grade,
          requested_role: requestedRole === 'teacher' ? 'teacher' : undefined,
          requested_subject: requestedRole === 'teacher' ? requestedSubject : undefined,
          privacy_policy_accepted: true,
          privacy_policy_version: PRIVACY_POLICY_VERSION,
          terms_of_use_accepted: true,
          terms_of_use_version: TERMS_OF_USE_VERSION,
          account_origin: 'self_service',
        },
      },
    });
    if (error) {
      setAuthMessage(
        error.message.toLowerCase().includes('password')
          ? 'A senha deve ter 6 ou mais caracteres, com letra maiúscula, minúscula e número.'
          : 'Não foi possível criar a conta. Confira os dados e tente novamente.',
      );
      setAuthLoading(false);
      return;
    }
    if (requestedRole === 'teacher') {
      // Mesmo quando a confirmação de e-mail está desativada, a pessoa não fica
      // autenticada como estudante enquanto aguarda a análise do cadastro.
      if (signUpData.session) await supabase.auth.signOut();
      setAuthMessage(
        'Solicitação de professor enviada. Após a aprovação da administradora, entre com este e-mail e senha.',
      );
      setView('login');
      setAuthLoading(false);
      return;
    }
    if (!signUpData.session) {
      setAuthMessage('Cadastro criado. Confirme seu e-mail para entrar.');
      setView('login');
      setAuthLoading(false);
    }
  }

  /** Contas provisionadas ou antigas só entram na plataforma após seu próprio aceite. */
  async function handleExistingPrivacyConsent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    if (
      formData.get('privacy_policy_accepted') !== 'true' ||
      formData.get('terms_of_use_accepted') !== 'true'
    ) {
      setAuthMessage(
        'Marque as duas caixas para confirmar que leu e aceita os termos e a política.',
      );
      return;
    }
    setAuthLoading(true);
    if (!(await confirmDisplayedVersions(form))) return;
    const response = await apiFetch('/privacy/accept', {
      method: 'POST',
      body: JSON.stringify({
        policy_version: PRIVACY_POLICY_VERSION,
        terms_version: TERMS_OF_USE_VERSION,
      }),
    });
    if (!response.ok) {
      setAuthMessage(
        await apiError(response, 'Não foi possível salvar seu aceite. Tente novamente.'),
      );
      setAuthLoading(false);
      return;
    }
    setAuthMessage('');
    setView(profile.registrationStatus === 'pending_teacher' ? 'teacher-pending' : profile.role);
    setAuthLoading(false);
  }

  /** Envia o link pelo Supabase sem revelar se o e-mail está cadastrado. */
  async function handlePasswordRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      setAuthMessage('A recuperação precisa do Supabase configurado.');
      return;
    }
    const data = new FormData(event.currentTarget);
    setAuthLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(String(data.get('email')), {
      redirectTo: window.location.origin,
      captchaToken: String(data.get('captcha_token') || '') || undefined,
    });
    setAuthMessage(
      error
        ? 'Não foi possível enviar o link agora.'
        : 'Se o e-mail estiver cadastrado, você receberá um link de recuperação.',
    );
    setAuthLoading(false);
  }

  /** Troca a senha somente dentro da sessão curta aberta pelo link recebido. */
  async function handlePasswordUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const data = new FormData(event.currentTarget);
    const password = String(data.get('password'));
    const confirmation = String(data.get('confirmation'));
    const passwordError = passwordPolicyError(password);
    if (passwordError) {
      setAuthMessage(passwordError);
      return;
    }
    if (password !== confirmation) {
      setAuthMessage('As senhas precisam ser iguais.');
      return;
    }
    setAuthLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setAuthMessage('Não foi possível atualizar a senha. Abra o link novamente.');
    } else {
      await supabase.auth.signOut();
      setAuthMessage('Senha atualizada. Entre novamente.');
      setView('login');
    }
    setAuthLoading(false);
  }

  // Encerra também a sessão remota para invalidar o estado persistido no navegador.
  const logout = async () => {
    if (supabase) await supabase.auth.signOut();
    setProfile(initialProfile);
    applyAccentTheme('wine');
    setView('login');
  };
  if (view === 'privacy-consent')
    return (
      <main id="main-content" tabIndex={-1} className="page-shell">
        <section className="auth-card privacy-consent-page">
          <Brand />
          <p className="eyebrow">ANTES DE CONTINUAR</p>
          <h1>Leia e aceite os termos e a política</h1>
          <p className="subtitle">
            Precisamos do seu aceite para liberar o uso da plataforma. O registro fica associado à
            sua conta.
          </p>
          <div className="privacy-consent-link">
            <TermsOfUseAccess label="Ler os Termos de Uso" />
            <PrivacyPolicyAccess label="Ler a Política de Privacidade" />
          </div>
          {/* O titular pode abrir pedidos antes de aceitar a versão vigente. */}
          <PrivacyRequests />
          <form className="auth-form" onSubmit={handleExistingPrivacyConsent}>
            <PrivacyConsentCheckbox
              name="terms_of_use_accepted"
              label={`Li e concordo com os Termos de Uso do AprendeIA, versão ${TERMS_OF_USE_VERSION}.`}
            />
            <PrivacyConsentCheckbox
              label={`Li e estou ciente da Política de Privacidade do AprendeIA, versão ${PRIVACY_POLICY_VERSION}.`}
            />
            {authMessage && (
              <p className="form-message" role="alert">
                {authMessage}
              </p>
            )}
            <button className="primary-button" type="submit" disabled={authLoading}>
              {authLoading ? 'Salvando...' : 'Aceitar e continuar'}
            </button>
            <button className="text-button" type="button" onClick={() => void logout()}>
              Sair da conta
            </button>
          </form>
        </section>
      </main>
    );
  if (authLoading && view === 'login')
    return (
      <main id="main-content" tabIndex={-1} className="page-shell">
        <section className="auth-card">
          <Brand />
          <p className="subtitle">Carregando sua sessão...</p>
        </section>
      </main>
    );
  if (view === 'student')
    return (
      <AccountLifecyclePanel key={profile.id} userId={profile.id || ''} role={profile.role}>
        <StudentProfile
          profile={profile}
          onProfileChange={setProfile}
          onLogout={logout}
          onChangePassword={() => setView('forgot-password')}
          onPractice={(subject = 'Matemática') => {
            setPracticeSubject(subject);
            setView('practice');
          }}
        />
      </AccountLifecyclePanel>
    );
  if (view === 'practice')
    if (profile.role !== 'student') return <AccessDenied onLogout={logout} />;
  if (view === 'practice')
    return (
      <PracticeProfile
        initialSubject={practiceSubject}
        onBack={() => setView('student')}
        onLogout={logout}
      />
    );
  if (view === 'teacher')
    return profile.role === 'teacher' ? (
      <AccountLifecyclePanel key={profile.id} userId={profile.id || ''} role={profile.role}>
        <TeacherProfile onLogout={logout} />
      </AccountLifecyclePanel>
    ) : (
      <AccessDenied onLogout={logout} />
    );
  if (view === 'teacher-pending')
    return profile.registrationStatus === 'pending_teacher' ? (
      <TeacherPending profile={profile} onLogout={logout} />
    ) : (
      <AccessDenied onLogout={logout} />
    );
  if (view === 'admin')
    return profile.role === 'admin' ? (
      <AdminProfile onLogout={logout} />
    ) : (
      <AccessDenied onLogout={logout} />
    );
  return (
    <main id="main-content" tabIndex={-1} className="page-shell">
      <section className="auth-card">
        <Brand />
        {view === 'login' ? (
          <Login
            onSubmit={handleLogin}
            onSignup={() => setView('signup')}
            onForgot={() => setView('forgot-password')}
            message={authMessage}
            loading={authLoading}
          />
        ) : view === 'signup' ? (
          <Signup
            onSubmit={handleSignup}
            onLogin={() => setView('login')}
            message={authMessage}
            loading={authLoading}
          />
        ) : view === 'forgot-password' ? (
          <ForgotPassword
            onSubmit={handlePasswordRecovery}
            onLogin={() => setView('login')}
            message={authMessage}
            loading={authLoading}
          />
        ) : (
          <ResetPassword
            onSubmit={handlePasswordUpdate}
            message={authMessage}
            loading={authLoading}
          />
        )}
        <div className="auth-policy-access">
          <PrivacyPolicyAccess label="Consultar a Política de Privacidade" />
        </div>
      </section>
    </main>
  );
}

/** Evita que uma navegação manipulada no cliente revele a área de outro cargo. */
function AccessDenied({ onLogout }: { onLogout: () => void }) {
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
function TeacherPending({ profile, onLogout }: { profile: UserProfile; onLogout: () => void }) {
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
