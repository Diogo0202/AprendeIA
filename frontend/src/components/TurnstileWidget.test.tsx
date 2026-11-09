import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TurnstileWidget } from './TurnstileWidget';

const config = vi.hoisted(() => ({ turnstileSiteKey: 'public-test-key' }));
vi.mock('../lib/supabase', () => config);

let options: Record<string, unknown>;
const reset = vi.fn();
const remove = vi.fn();
const submit = vi.fn((event: React.FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  return new FormData(event.currentTarget).get('captcha_token');
});

function Form({ action = 'recovery' }: { action?: 'login' | 'signup' | 'recovery' }) {
  return (
    <form onSubmit={submit}>
      <TurnstileWidget action={action} />
      <button>Enviar</button>
    </form>
  );
}

async function mount() {
  const view = render(<Form />);
  await waitFor(() => expect(window.turnstile!.render).toHaveBeenCalled());
  return view;
}

function callback(name: string, value?: string) {
  act(() => (options[name] as (token?: string) => void)(value));
}

describe('TurnstileWidget', () => {
  beforeEach(() => {
    config.turnstileSiteKey = 'public-test-key';
    vi.clearAllMocks();
    window.turnstile = {
      ready: (callback) => callback(),
      render: vi.fn((_container, next) => {
        options = next;
        return 'widget-1';
      }),
      reset,
      remove,
    };
  });
  afterEach(() => {
    cleanup();
    delete window.turnstile;
    vi.unstubAllEnvs();
  });

  it('bloqueia envio sem desafio resolvido e fixa action recovery', async () => {
    await mount();
    expect(options.action).toBe('recovery');
    expect(options['response-field']).toBe(false);
    fireEvent.submit(screen.getByRole('button').closest('form')!);
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Conclua a verificação');
  });

  it('entrega o token uma vez e renova o desafio para a próxima tentativa', async () => {
    await mount();
    callback('callback', 'single-use-token');
    const form = screen.getByRole('button').closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.results[0].value).toBe('single-use-token');
    await waitFor(() => expect(reset).toHaveBeenCalledWith('widget-1'));
    expect(new FormData(form).get('captcha_token')).toBe('');
    callback('callback', 'fresh-token');
    fireEvent.submit(form);
    expect(submit).toHaveBeenCalledTimes(2);
    expect(submit.mock.results[1].value).toBe('fresh-token');
  });

  it.each(['login', 'signup', 'recovery'] as const)(
    'consome um único token e reinicia o desafio na ação %s',
    async (action) => {
      const view = render(<Form action={action} />);
      await waitFor(() => expect(window.turnstile!.render).toHaveBeenCalled());
      expect(options.action).toBe(action);
      callback('callback', `${action}-token`);
      fireEvent.submit(screen.getByRole('button').closest('form')!);
      await waitFor(() => expect(reset).toHaveBeenCalledWith('widget-1'));
      expect(new FormData(screen.getByRole('button').closest('form')!).get('captcha_token')).toBe(
        '',
      );
      view.unmount();
    },
  );

  it.each(['expired-callback', 'timeout-callback', 'error-callback'])(
    'limpa o token ao receber %s',
    async (name) => {
      await mount();
      callback('callback', 'old-token');
      callback(name);
      const form = screen.getByRole('button').closest('form')!;
      expect(new FormData(form).get('captcha_token')).toBe('');
      fireEvent.submit(form);
      expect(submit).not.toHaveBeenCalled();
    },
  );

  it('remove o widget e ignora callbacks antigos quando a action muda', async () => {
    const view = await mount();
    const oldCallback = options.callback as (token: string) => void;
    callback('callback', 'old-token');
    view.rerender(<Form action="login" />);
    await waitFor(() => expect(options.action).toBe('login'));
    act(() => oldCallback('late-token'));
    expect(remove).toHaveBeenCalledWith('widget-1');
    expect(new FormData(screen.getByRole('button').closest('form')!).get('captcha_token')).toBe('');
    view.unmount();
    expect(remove).toHaveBeenCalledTimes(2);
  });

  it('falha fechado em produção sem site key', () => {
    config.turnstileSiteKey = '';
    vi.stubEnv('PROD', true);
    render(<Form />);
    fireEvent.submit(screen.getByRole('button').closest('form')!);
    expect(submit).not.toHaveBeenCalled();
    expect(window.turnstile!.render).not.toHaveBeenCalled();
  });

  it('mantém o formulário local disponível sem configuração', () => {
    config.turnstileSiteKey = '';
    render(<Form />);
    fireEvent.submit(screen.getByRole('button').closest('form')!);
    expect(submit).toHaveBeenCalledOnce();
  });
});
