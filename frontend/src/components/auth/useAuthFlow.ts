import { FormEvent, useEffect, useRef, useState } from 'react';
import type { AvatarKey } from '../../components/FallbackAvatar';
import { gateways, isConnected } from '../../application/gateways';
import { failureMessage } from '../../application/result';
import { clearAuthCallbackUrl } from '../../adapters/browser/recovery';
import {
  currentLegalDocuments,
  loadLegalDocuments,
  useCurrentLegalDocuments,
} from '../../adapters/http/legalVersions';
import { apiUrl } from '../../adapters/supabase/client';
import type { View, Role, SignupRole, AccentTheme, UserProfile } from '../../domain/app';
import { applyAccentTheme } from '../../adapters/browser/theme';
import { initialProfile } from '../../components/auth/demoProfile';
import { passwordPolicyError } from '../../domain/password';

/** Estado e ações de App; a tela só exibe o que este hook devolve. */
export function useAuthFlow() {
  const legalDocuments = useCurrentLegalDocuments();
  const privacyPolicyVersion = legalDocuments?.privacy.version ?? '';
  const termsOfUseVersion = legalDocuments?.terms.version ?? '';

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
    !isConnected() &&
    new URLSearchParams(window.location.search).get('demo') === 'teacher';
  const [view, setView] = useState<View>(demoTeacher ? 'teacher' : 'login');
  const [profile, setProfile] = useState<UserProfile>(
    demoTeacher ? { ...initialProfile, role: 'teacher' } : initialProfile,
  );
  const [practiceSubject, setPracticeSubject] = useState('Matemática');
  const [authMessage, setAuthMessage] = useState('');
  const [authLoading, setAuthLoading] = useState(isConnected);
  const recoveryActive = useRef(false);
  const enter = (role: Role) => setView(role);

  useEffect(() => applyAccentTheme(profile.accentTheme), [profile.accentTheme]);

  // Restaura a sessão ao recarregar a página e remove o listener ao desmontar.
  useEffect(() => {
    if (!isConnected()) {
      setAuthLoading(false);
      return;
    }
    const { session } = gateways();
    session.currentUserId().then((userId) => {
      if (recoveryActive.current) return;
      if (userId) void loadProfile(userId);
      else setAuthLoading(false);
    });
    return session.onChange((event, userId) => {
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
      if (event === 'SIGNED_IN' && userId && !recoveryActive.current) void loadProfile(userId);
    });
  }, []);

  /** Carrega a identidade e direciona o usuário para sua área autorizada. */
  async function loadProfile(userId: string) {
    if (!isConnected()) return;
    setAuthLoading(true);
    const data = await gateways().session.profile(userId);
    if (!data) {
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
    if (!isConnected()) {
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
      const login = await gateways().account.login({
        email: String(data.get('email')),
        password: String(data.get('password')),
        captcha_token: String(data.get('captcha_token') || '') || undefined,
      });
      if (!login.ok) {
        if (login.status === 429) {
          const minutes = Math.max(1, Math.ceil(login.retryAfterSeconds / 60));
          setAuthMessage(
            `Limite de tentativas atingido. Tente novamente em ${minutes} minuto${minutes === 1 ? '' : 's'}.`,
          );
        } else if (login.status >= 500) {
          setAuthMessage('O login está temporariamente indisponível. Tente novamente mais tarde.');
        } else {
          setAuthMessage('E-mail ou senha inválidos.');
        }
        setAuthLoading(false);
        return;
      }
      if (!login.accessToken || !login.refreshToken) {
        setAuthMessage('O login está temporariamente indisponível. Tente novamente mais tarde.');
        setAuthLoading(false);
        return;
      }
      const opened = await gateways().session.open(login.accessToken, login.refreshToken);
      if (!opened) {
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
    if (!isConnected()) {
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
    const { session } = gateways();
    const signedUp = await session.signUp({
      email: nextProfile.email,
      password,
      redirectTo: window.location.origin,
      captchaToken: String(data.get('captcha_token') || '') || undefined,
      metadata: {
        full_name: nextProfile.name,
        grade: nextProfile.grade,
        requested_role: requestedRole === 'teacher' ? 'teacher' : undefined,
        requested_subject: requestedRole === 'teacher' ? requestedSubject : undefined,
        privacy_policy_accepted: true,
        privacy_policy_version: privacyPolicyVersion,
        terms_of_use_accepted: true,
        terms_of_use_version: termsOfUseVersion,
        account_origin: 'self_service',
      },
    });
    if (!signedUp.ok) {
      setAuthMessage(
        signedUp.passwordRejected
          ? 'A senha deve ter 6 ou mais caracteres, com letra maiúscula, minúscula e número.'
          : 'Não foi possível criar a conta. Confira os dados e tente novamente.',
      );
      setAuthLoading(false);
      return;
    }
    if (requestedRole === 'teacher') {
      // Mesmo quando a confirmação de e-mail está desativada, a pessoa não fica
      // autenticada como estudante enquanto aguarda a análise do cadastro.
      if (signedUp.sessionOpened) await session.signOut();
      setAuthMessage(
        'Solicitação de professor enviada. Após a aprovação da administradora, entre com este e-mail e senha.',
      );
      setView('login');
      setAuthLoading(false);
      return;
    }
    if (!signedUp.sessionOpened) {
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
    const accepted = await gateways().account.acceptLegalDocuments(
      privacyPolicyVersion,
      termsOfUseVersion,
    );
    if (!accepted.ok) {
      setAuthMessage(
        failureMessage(accepted, 'Não foi possível salvar seu aceite. Tente novamente.'),
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
    if (!isConnected()) {
      setAuthMessage('A recuperação precisa do Supabase configurado.');
      return;
    }
    const data = new FormData(event.currentTarget);
    setAuthLoading(true);
    const sent = await gateways().session.requestPasswordRecovery(
      String(data.get('email')),
      window.location.origin,
      String(data.get('captcha_token') || '') || undefined,
    );
    setAuthMessage(
      sent
        ? 'Se o e-mail estiver cadastrado, você receberá um link de recuperação.'
        : 'Não foi possível enviar o link agora.',
    );
    setAuthLoading(false);
  }

  /** Troca a senha somente dentro da sessão curta aberta pelo link recebido. */
  async function handlePasswordUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isConnected()) return;
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
    const { session } = gateways();
    if (!(await session.updatePassword(password))) {
      setAuthMessage('Não foi possível atualizar a senha. Abra o link novamente.');
    } else {
      await session.signOut();
      setAuthMessage('Senha atualizada. Entre novamente.');
      setView('login');
    }
    setAuthLoading(false);
  }

  // Encerra também a sessão remota para invalidar o estado persistido no navegador.
  const logout = async () => {
    if (isConnected()) await gateways().session.signOut();
    setProfile(initialProfile);
    applyAccentTheme('wine');
    setView('login');
  };

  return {
    privacyPolicyVersion,
    termsOfUseVersion,
    view,
    setView,
    profile,
    setProfile,
    practiceSubject,
    setPracticeSubject,
    authMessage,
    authLoading,
    handleLogin,
    handleSignup,
    handleExistingPrivacyConsent,
    handlePasswordRecovery,
    handlePasswordUpdate,
    logout,
  };
}
