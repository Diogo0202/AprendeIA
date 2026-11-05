import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { PRIVACY_POLICY_VERSION } from './PrivacyPolicyAccess';

const auth = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  unsubscribe: vi.fn(),
  single: vi.fn(),
}));
vi.mock('../lib/supabase', () => ({
  apiUrl: 'http://localhost:8000',
  isSupabaseConfigured: true,
  turnstileSiteKey: 'public-test-key',
  accessToken: vi.fn(async () => null),
  supabase: {
    auth,
    from: () => ({ select: () => ({ eq: () => ({ single: auth.single }) }) }),
  },
}));

let authEvent: (event: string, session: unknown) => void;
let solve: (token: string) => void;

async function recoveryForm() {
  render(<App />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Esqueci minha senha' }));
  await waitFor(() => expect(window.turnstile!.render).toHaveBeenCalled());
  fireEvent.change(screen.getByLabelText('E-MAIL'), { target: { value: 'aluno@example.test' } });
  act(() => solve('recovery-token'));
  return screen.getByRole('button', { name: 'Enviar link' }).closest('form')!;
}

async function resetForm() {
  render(<App />);
  await waitFor(() => expect(auth.onAuthStateChange).toHaveBeenCalled());
  act(() => authEvent('PASSWORD_RECOVERY', { user: { id: 'student-id' } }));
  expect(screen.getByRole('heading', { name: 'Criar nova senha' })).toBeInTheDocument();
  return screen.getByRole('button', { name: 'Atualizar senha' }).closest('form')!;
}

function passwords(form: HTMLFormElement, password: string, confirmation = password) {
  fireEvent.change(form.elements.namedItem('password') as HTMLInputElement, {
    target: { value: password },
  });
  fireEvent.change(form.elements.namedItem('confirmation') as HTMLInputElement, {
    target: { value: confirmation },
  });
}

describe('RF04 recuperação pelo App atual', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.getSession.mockResolvedValue({ data: { session: null } });
    auth.onAuthStateChange.mockImplementation((callback) => {
      authEvent = callback;
      return { data: { subscription: { unsubscribe: auth.unsubscribe } } };
    });
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    auth.updateUser.mockResolvedValue({ error: null });
    auth.signOut.mockResolvedValue({ error: null });
    window.turnstile = {
      ready: (callback) => callback(),
      render: vi.fn((_container, options) => {
        solve = options.callback as typeof solve;
        return 'recovery-widget';
      }),
      reset: vi.fn(),
      remove: vi.fn(),
    };
  });
  afterEach(() => {
    cleanup();
    delete window.turnstile;
  });

  it('envia token ao Supabase sem validação prévia e responde sem enumerar contas', async () => {
    const form = await recoveryForm();
    fireEvent.submit(form);
    await waitFor(() =>
      expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('aluno@example.test', {
        redirectTo: window.location.origin,
        captchaToken: 'recovery-token',
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Se o e-mail estiver cadastrado');
    expect(auth.resetPasswordForEmail).toHaveBeenCalledTimes(1);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('exibe falha do provedor sem expor detalhes da conta', async () => {
    auth.resetPasswordForEmail.mockResolvedValue({
      error: { message: 'sensitive-provider-detail' },
    });
    fireEvent.submit(await recoveryForm());
    expect(await screen.findByText('Não foi possível enviar o link agora.')).toBeInTheDocument();
    expect(screen.queryByText('sensitive-provider-detail')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar link' })).toBeEnabled();
  });

  it.each(['abc', 'abcdef1', 'ABCDEF1', 'Abcdef'])(
    'recusa senha fora da política: %s',
    async (password) => {
      const form = await resetForm();
      passwords(form, password);
      fireEvent.submit(form);
      expect(auth.updateUser).not.toHaveBeenCalled();
      expect(screen.getByRole('status')).toHaveTextContent('senha precisa');
    },
  );

  it('recusa confirmação diferente antes de chamar Auth', async () => {
    const form = await resetForm();
    passwords(form, 'Senha123', 'Outra123');
    fireEvent.submit(form);
    expect(screen.getByRole('status')).toHaveTextContent('As senhas precisam ser iguais');
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('atualiza a senha na sessão de recuperação e encerra a sessão', async () => {
    const form = await resetForm();
    passwords(form, 'Senha123');
    fireEvent.submit(form);
    await waitFor(() => expect(auth.signOut).toHaveBeenCalledOnce());
    expect(auth.updateUser).toHaveBeenCalledWith({ password: 'Senha123' });
    expect(screen.getByRole('status')).toHaveTextContent('Senha atualizada. Entre novamente.');
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
  });

  it('mantém redefinição aberta quando o link expirou ou Auth recusou a senha', async () => {
    auth.updateUser.mockResolvedValue({ error: { message: 'expired' } });
    const form = await resetForm();
    passwords(form, 'Senha123');
    fireEvent.submit(form);
    expect(await screen.findByRole('status')).toHaveTextContent('Abra o link novamente');
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it('preserva a tela de redefinição se getSession termina após PASSWORD_RECOVERY', async () => {
    let resolveSession!: (value: unknown) => void;
    auth.getSession.mockReturnValue(
      new Promise((resolve) => {
        resolveSession = resolve;
      }),
    );
    auth.single.mockResolvedValue({
      data: {
        id: 'student-id',
        email: 'aluno@example.test',
        full_name: 'Aluno',
        role: 'student',
        privacy_policy_version: PRIVACY_POLICY_VERSION,
      },
      error: null,
    });
    render(<App />);
    act(() => authEvent('PASSWORD_RECOVERY', { user: { id: 'student-id' } }));
    await act(async () => {
      resolveSession({ data: { session: { user: { id: 'student-id' } } } });
    });
    expect(screen.queryByRole('heading', { name: 'Criar nova senha' })).toBeInTheDocument();
  });
});
