import { FormEvent, useState } from 'react';
import { TermsOfUseAccess } from '../LegalDocuments';
import { PrivacyConsentCheckbox, PrivacyPolicyAccess } from '../PrivacyPolicyAccess';
import { TurnstileWidget } from '../TurnstileWidget';
import type { SignupRole } from '../../types/app';

/** Formulário de entrada com mensagens de erro próximas à ação principal. */
export function Login({
  onSubmit,
  onSignup,
  onForgot,
  message,
  loading,
}: {
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onSignup: () => void;
  onForgot: () => void;
  message: string;
  loading: boolean;
}) {
  return (
    <>
      <h1>Bem-vindo de volta</h1>
      <p className="subtitle">Entre para continuar sua jornada de aprendizagem.</p>
      <form onSubmit={onSubmit} className="auth-form">
        <label>
          E-MAIL
          <input name="email" type="email" placeholder="seuemail@exemplo.com" required />
        </label>
        <label>
          SENHA
          <div className="password-field">
            <input name="password" type="password" placeholder="Digite sua senha" required />
            <button type="button" aria-label="Mostrar senha">
              ◉
            </button>
          </div>
        </label>
        <div className="form-row">
          <label className="check">
            <input type="checkbox" />
            <span>Lembrar de mim</span>
          </label>
          <button type="button" className="text-button" onClick={onForgot}>
            Esqueci minha senha
          </button>
        </div>
        <TurnstileWidget action="login" />
        {message && (
          <p className="form-message" role="status">
            {message}
          </p>
        )}
        <button className="primary-button" type="submit" disabled={loading}>
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
      <p className="switch-copy">
        Ainda não tem uma conta?{' '}
        <button className="text-button" onClick={onSignup}>
          Crie sua conta
        </button>
      </p>
    </>
  );
}

/** Separa a jornada de estudante da solicitação docente sem confiar no navegador. */
export function Signup({
  onSubmit,
  onLogin,
  message,
  loading,
}: {
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onLogin: () => void;
  message: string;
  loading: boolean;
}) {
  const [selectedRole, setSelectedRole] = useState<SignupRole>('student');

  return (
    <>
      <h1>Crie sua conta</h1>
      <p className="subtitle">
        {selectedRole === 'student'
          ? 'Comece sua jornada e acompanhe seu progresso em cada matéria.'
          : 'Solicite seu acesso para acompanhar uma disciplina e suas turmas.'}
      </p>
      <form onSubmit={onSubmit} className="auth-form">
        <fieldset className="account-type-picker">
          <legend>COMO VOCÊ VAI USAR O APRENDEIA?</legend>
          <label className={selectedRole === 'student' ? 'account-type active' : 'account-type'}>
            <input
              type="radio"
              name="role"
              value="student"
              checked={selectedRole === 'student'}
              onChange={() => setSelectedRole('student')}
            />
            <span aria-hidden="true">A</span>
            <strong>Aluno</strong>
            <small>Estudar e praticar</small>
          </label>
          <label className={selectedRole === 'teacher' ? 'account-type active' : 'account-type'}>
            <input
              type="radio"
              name="role"
              value="teacher"
              checked={selectedRole === 'teacher'}
              onChange={() => setSelectedRole('teacher')}
            />
            <span aria-hidden="true">P</span>
            <strong>Professor</strong>
            <small>Gerenciar turmas</small>
          </label>
        </fieldset>
        <label>
          NOME COMPLETO
          <input name="name" placeholder="Ex: Maria Silva" autoComplete="name" required />
        </label>
        {selectedRole === 'student' ? (
          <label>
            GRAU DE ESCOLARIDADE
            <select name="grade" defaultValue="" required>
              <option value="" disabled>
                Selecione...
              </option>
              <option>Ensino Fundamental I</option>
              <option>Ensino Fundamental II</option>
              <option>Ensino Médio</option>
              <option>Graduação</option>
              <option>Pós-Graduação</option>
            </select>
          </label>
        ) : (
          <label>
            DISCIPLINA
            <input name="subject" placeholder="Ex.: Matemática" maxLength={60} required />
          </label>
        )}
        <label>
          E-MAIL
          <input
            name="email"
            type="email"
            placeholder="seuemail@exemplo.com"
            autoComplete="email"
            required
          />
        </label>
        <label>
          SENHA
          <input
            name="password"
            type="password"
            placeholder="Crie uma senha"
            autoComplete="new-password"
            required
            minLength={6}
            maxLength={128}
            pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,128}"
            title="Use pelo menos 6 caracteres, incluindo uma letra maiúscula, uma minúscula e um número."
          />
        </label>
        <p className="registration-note">
          A senha deve ter pelo menos 6 caracteres, incluindo uma letra maiúscula, uma letra
          minúscula e um número.
        </p>
        {selectedRole === 'teacher' && (
          <p className="registration-note">
            Seu painel é liberado depois que a administradora confirma o cadastro e a disciplina.
            Sua senha fica protegida pelo Supabase e não é salva no banco do AprendeIA.
          </p>
        )}
        <PrivacyConsentCheckbox
          name="terms_of_use_accepted"
          label="Li e concordo com os Termos de Uso do AprendeIA."
        />
        <PrivacyConsentCheckbox label="Li e estou ciente da Política de Privacidade do AprendeIA." />
        <div className="privacy-consent-link">
          <TermsOfUseAccess label="Ler os Termos de Uso" />
          <PrivacyPolicyAccess label="Ler a Política de Privacidade" />
        </div>
        <TurnstileWidget action="signup" />
        {message && (
          <p className="form-message" role="status">
            {message}
          </p>
        )}
        <button className="primary-button" type="submit" disabled={loading}>
          {loading
            ? 'Enviando...'
            : selectedRole === 'teacher'
              ? 'Solicitar acesso de professor'
              : 'Criar conta de aluno'}
        </button>
      </form>
      <p className="switch-copy">
        Já tem uma conta?{' '}
        <button className="text-button" onClick={onLogin}>
          Faça login
        </button>
      </p>
    </>
  );
}

export function ForgotPassword({
  onSubmit,
  onLogin,
  message,
  loading,
}: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onLogin: () => void;
  message: string;
  loading: boolean;
}) {
  return (
    <>
      <h1>Recuperar senha</h1>
      <p className="subtitle">Enviaremos um link seguro para o e-mail da sua conta.</p>
      <form className="auth-form" onSubmit={onSubmit}>
        <label>
          E-MAIL
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <TurnstileWidget action="recovery" />
        {message && (
          <p className="form-message" role="status">
            {message}
          </p>
        )}
        <button className="primary-button" disabled={loading}>
          {loading ? 'Enviando...' : 'Enviar link'}
        </button>
      </form>
      <p className="switch-copy">
        <button className="text-button" onClick={onLogin}>
          Voltar para o login
        </button>
      </p>
    </>
  );
}

export function ResetPassword({
  onSubmit,
  message,
  loading,
}: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  message: string;
  loading: boolean;
}) {
  return (
    <>
      <h1>Criar nova senha</h1>
      <p className="subtitle">
        Use pelo menos 6 caracteres, com uma letra maiúscula, uma minúscula e um número.
      </p>
      <form className="auth-form" onSubmit={onSubmit}>
        <label>
          NOVA SENHA
          <input
            name="password"
            type="password"
            minLength={6}
            maxLength={128}
            pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,128}"
            title="Use pelo menos 6 caracteres, incluindo uma letra maiúscula, uma minúscula e um número."
            autoComplete="new-password"
            required
          />
        </label>
        <label>
          CONFIRMAR SENHA
          <input
            name="confirmation"
            type="password"
            minLength={6}
            maxLength={128}
            pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,128}"
            title="Repita a senha seguindo os mesmos requisitos."
            autoComplete="new-password"
            required
          />
        </label>
        {message && (
          <p className="form-message" role="status">
            {message}
          </p>
        )}
        <button className="primary-button" disabled={loading}>
          {loading ? 'Salvando...' : 'Atualizar senha'}
        </button>
      </form>
    </>
  );
}
