import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PrivacyConsentCheckbox,
  PrivacyPolicyAccess,
  PrivacyPolicyContent,
  PRIVACY_POLICY_VERSION,
} from './PrivacyPolicyAccess';

describe('Política de Privacidade e consentimento', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('exige uma marcação afirmativa no formulário', () => {
    render(
      <PrivacyConsentCheckbox
        label="Li e aceito a política"
        requiredDescription="Aceite obrigatório para criar a conta."
      />,
    );
    const checkbox = screen.getByRole('checkbox', { name: 'Li e aceito a política' });
    expect(checkbox).not.toBeChecked();
    expect(checkbox).toBeRequired();
    expect(checkbox).toHaveAttribute('aria-required', 'true');
    expect(checkbox).toHaveAttribute('value', 'true');
    expect(screen.getByText('Aceite obrigatório para criar a conta.')).toBeInTheDocument();
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
  });

  it('permite consultar a versão vigente da política', () => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.setAttribute('open', '');
      },
    });
    render(<PrivacyPolicyAccess />);
    fireEvent.click(screen.getByRole('button', { name: 'Política de Privacidade' }));
    expect(screen.getByRole('dialog')).toHaveAttribute('open');
    expect(
      screen.getByRole('heading', { name: 'Política de Privacidade do AprendeIA' }),
    ).toBeInTheDocument();
    expect(screen.getByText(`VERSÃO ${PRIVACY_POLICY_VERSION} · 04/11/2026`)).toBeInTheDocument();
    expect(screen.getByText(/10 mensagens\s+mais recentes/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /crianças e adolescentes/i })).toBeInTheDocument();
    expect(screen.getByText(/anonimização/i)).toBeInTheDocument();
    expect(PRIVACY_POLICY_VERSION).toBe('1.6');
    expect(screen.getByText(/grupos\s+com menos de 3 alunos ficam ocultos/)).toBeInTheDocument();
    expect(
      screen.getByText(/excluir contas de estudantes e professores por iniciativa/),
    ).toBeInTheDocument();
    expect(screen.getByText(/168 horas após a criação/)).toBeInTheDocument();
    expect(screen.getByText(/admissão administrativa/)).toHaveTextContent('não comprova aprovação');
    expect(
      screen.getByText(/instituição de teste: Escola Diogo Mendes teste/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'dig.mendes.baptista@gmail.com' })).toHaveAttribute(
      'href',
      'mailto:dig.mendes.baptista@gmail.com',
    );
    expect(screen.getByText(/store=false não garante/)).toBeInTheDocument();
  });

  it('separa ciência obrigatória dos consentimentos independentes de medição', () => {
    render(<PrivacyPolicyContent />);
    expect(screen.getByText(/confirmação de leitura/)).toHaveTextContent(
      'Termos de Uso permanece na versão 1.0',
    );
    expect(screen.getByText(/confirmação de leitura/)).toHaveTextContent(
      'não autorizam cookies opcionais',
    );
    const choices = screen.getByText(/Google Analytics 4/);
    expect(choices).toHaveTextContent('/sobre');
    expect(choices).toHaveTextContent('estatísticas');
    expect(choices).toHaveTextContent('session replay');
    expect(choices).toHaveTextContent('duas escolhas independentes, ambas desligadas por padrão');
    const retention = screen.getByText(/A escolha de cookies opcionais/);
    expect(retention).toHaveTextContent('7 dias no navegador');
    expect(retention).toHaveTextContent('link permanente Preferências de cookies');
    expect(retention).toHaveTextContent('revogar cada consentimento');
    expect(retention).toHaveTextContent('não apaga dados já enviados');
    expect(screen.getByText(/O Supabase Auth/)).toHaveTextContent('Cloudflare Turnstile');
    expect(screen.getByText(/O Supabase Auth/)).toHaveTextContent('separada da medição opcional');
    expect(screen.queryByText(/anônim[oa]s?/i)).not.toBeInTheDocument();
  });

  it('explica quais direitos precisam de atendimento assistido', () => {
    render(<PrivacyPolicyContent />);
    const assisted = screen.getByText(/solicite atendimento assistido/);
    for (const right of [
      'confirmação da existência',
      'compartilhamento',
      'oposição',
      'revogação do consentimento',
      'portabilidade',
      'revisão de decisões',
    ]) {
      expect(assisted).toHaveTextContent(right);
    }
    expect(assisted).toHaveTextContent('não equivale à portabilidade');
    expect(assisted).toHaveTextContent('sem executar automaticamente medidas externas');
    expect(screen.getByText(/Login e nova ciência/)).toHaveTextContent('não reiniciam esse prazo');
  });
});
