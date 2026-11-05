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
      // Desde a política 1.6 a caixa registra ciência da política, não concordância.
      name: /Li e (concordo com a|estou ciente da) Pol.tica de Privacidade do AprendeIA/,
    });
    expect(checkbox).toBeRequired();
    const termsCheckbox = screen.getByRole('checkbox', {
      name: /Li e concordo com os Termos de Uso do AprendeIA/,
    });
    expect(termsCheckbox).toBeRequired();
    expect(termsCheckbox).toHaveAttribute('name', 'terms_of_use_accepted');
    // Cada caixa tem a própria explicação de obrigatoriedade.
    for (const box of [checkbox, termsCheckbox]) {
      const hint = document.getElementById(box.getAttribute('aria-describedby')!);
      expect(hint).not.toBeNull();
      expect(hint).toHaveTextContent(/obrigat/i);
    }
    expect(screen.getByRole('button', { name: 'Ler os Termos de Uso' })).toBeInTheDocument();

    const form = screen.getByRole('button', { name: 'Criar conta de aluno' }).closest('form')!;
    fireEvent.submit(form);
    expect(screen.getByRole('status')).toHaveTextContent(
      /leia e aceite os Termos de Uso e a Pol.tica de Privacidade/,
    );

    // Só a política marcada ainda não libera o cadastro.
    fireEvent.click(checkbox);
    fireEvent.submit(form);
    expect(screen.getByRole('status')).toHaveTextContent(/Termos de Uso/);
    expect(screen.getByRole('heading', { name: 'Crie sua conta' })).toBeInTheDocument();
  });

  it('abre a recuperação de senha pela tela de login', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Esqueci minha senha' }));
    expect(screen.getByRole('heading', { name: 'Recuperar senha' })).toBeInTheDocument();
  });
});
