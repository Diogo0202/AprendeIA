import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  InstitutionalAdmission,
  isAccountLifecycleStatus,
  type AccountLifecycleStatus,
  type InstitutionalAdmissionProps,
} from './InstitutionalAdmission';

// O servidor decide o acesso; o componente só exibe a decisão e protege os recursos.
const active: AccountLifecycleStatus = {
  allowed: true,
  reason: 'active',
  expires_at: '2026-11-10T12:00:00Z',
  age_band: 'adult',
  admission_status: 'not_required',
  admission_version: null,
};

function view(props: Partial<InstitutionalAdmissionProps> = {}) {
  return (
    <InstitutionalAdmission role="student" status={active} {...props}>
      <button>Recurso protegido</button>
    </InstitutionalAdmission>
  );
}

describe('Admissão institucional', () => {
  afterEach(() => cleanup());

  it('libera os recursos somente quando o servidor permite', () => {
    render(view());
    expect(screen.getByRole('button', { name: 'Recurso protegido' })).toBeInTheDocument();
    expect(screen.getByText('Acesso permitido pelo servidor.')).toBeInTheDocument();
    expect(document.querySelector('time')).toHaveAttribute('dateTime', '2026-11-10T12:00:00Z');
  });

  it.each([
    ['account_expired', 'Conta expirada'],
    ['institutional_admission_required', 'Admissão administrativa necessária'],
    ['age_declaration_required', 'Declare sua faixa etária'],
    ['lifecycle_unavailable', 'Não foi possível confirmar o ciclo'],
  ])('bloqueia e explica a recusa %s', (reason, message) => {
    render(view({ status: { ...active, allowed: false, reason } }));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText(new RegExp(message))).toBeInTheDocument();
    expect(screen.getByText('Acesso aos recursos bloqueado.')).toBeInTheDocument();
  });

  it.each([
    ['ausente', null],
    ['sem allowed booleano', { ...active, allowed: 'true' }],
    ['com data inválida', { ...active, expires_at: 'inválida' }],
    ['com faixa etária desconhecida pelo contrato', { ...active, age_band: 'child' }],
  ])('bloqueia resposta %s do servidor', (_label, status) => {
    render(view({ status: status as AccountLifecycleStatus | null }));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText(/Aguardando confirmação do servidor/)).toBeInTheDocument();
  });

  it('não deduz aprovação de motivo desconhecido', () => {
    render(view({ status: { ...active, allowed: false, reason: 'novo_motivo' } }));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(
      screen.getByText('Consulte a decisão de acesso recebida do servidor.'),
    ).toBeInTheDocument();
  });

  it('informa a isenção de admin e o estado da admissão de menores', () => {
    render(
      view({
        role: 'admin',
        status: {
          ...active,
          reason: 'admin_exempt',
          expires_at: null,
          admission_status: 'approved',
          admission_version: '1.3',
        },
      }),
    );
    expect(
      screen.getByText('Perfil administrativo: isento do prazo de 168 horas.'),
    ).toBeInTheDocument();
    expect(document.querySelector('time')).toBeNull();
    expect(
      screen.getByText(/Estado da admissão informado pelo servidor: approved\. Versão: 1\.3\./),
    ).toBeInTheDocument();
  });

  it('mostra os contatos e avisa que e-mail não comprova aprovação', () => {
    render(view({ status: null }));
    expect(screen.getByText(/enviar e-mail não comprova aprovação/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'dig.mendes.baptista.mb@gmail.com' })).toHaveAttribute(
      'href',
      'mailto:dig.mendes.baptista.mb@gmail.com',
    );
    expect(screen.getByRole('link', { name: 'dig.mendes.baptista@gmail.com' })).toHaveAttribute(
      'href',
      'mailto:dig.mendes.baptista@gmail.com',
    );
  });

  it('valida o formato da resposta antes de confiar nela', () => {
    expect(isAccountLifecycleStatus(active)).toBe(true);
    expect(isAccountLifecycleStatus({ ...active, admission_version: 3 })).toBe(false);
    expect(isAccountLifecycleStatus(undefined)).toBe(false);
  });
});
