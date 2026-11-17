import { AccountLifecyclePanel } from './components/AccountLifecyclePanel';
import { PrivacyRequests } from './components/PrivacyRequests';
import { TermsOfUseAccess } from './components/LegalDocuments';
import { PrivacyConsentCheckbox, PrivacyPolicyAccess } from './components/PrivacyPolicyAccess';
import { Brand } from './components/layout/Chrome';
import { Login, Signup, ForgotPassword, ResetPassword } from './components/auth/AuthScreens';
import { StudentProfile } from './components/student/StudentProfile';
import { PracticeProfile } from './components/student/PracticeProfile';
import { TeacherProfile } from './components/teacher/TeacherProfile';
import { AdminProfile } from './components/admin/AdminProfile';
import { AccessDenied, TeacherPending } from './components/auth/AccessScreens';
import { useAuthFlow } from './components/auth/useAuthFlow';

/**
 * Coordena autenticação, restauração de sessão e troca entre os três perfis.
 * O cargo sempre é carregado de `profiles`; o formulário não decide permissões.
 */
export default function App() {
  const {
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
  } = useAuthFlow();

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
              label={`Li e concordo com os Termos de Uso do AprendeIA, versão ${termsOfUseVersion}.`}
            />
            <PrivacyConsentCheckbox
              label={`Li e estou ciente da Política de Privacidade do AprendeIA, versão ${privacyPolicyVersion}.`}
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
