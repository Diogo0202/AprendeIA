import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';

vi.mock('./lib/supabase', () => ({
  apiUrl: 'http://localhost:8000',
  isSupabaseConfigured: false,
  supabase: null,
  turnstileSiteKey: '',
  accessToken: vi.fn(async () => null),
}));

describe('App', () => {
  it('nao cria a conta sem marcar o aceite da politica', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Crie sua conta' }));

    const checkbox = screen.getByRole('checkbox', {
      name: /Li e concordo com a Pol.tica de Privacidade do AprendeIA/,
    });
    expect(checkbox).toBeRequired();
    expect(
      screen.getByText(/Obrigat.rio para criar a conta ou continuar usando a plataforma/),
    ).toBeInTheDocument();

    fireEvent.submit(screen.getByRole('button', { name: 'Criar conta de aluno' }).closest('form')!);

    expect(screen.getByRole('status')).toHaveTextContent(/leia e aceite a Pol.tica de Privacidade/);
    expect(screen.getByRole('heading', { name: 'Crie sua conta' })).toBeInTheDocument();
  });

  it('abre a recuperação de senha pela tela de login', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Esqueci minha senha' }));
    expect(screen.getByRole('heading', { name: 'Recuperar senha' })).toBeInTheDocument();
  });
});
