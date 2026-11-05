import { type ReactNode } from 'react';

export const ACCOUNT_LIFETIME_HOURS = 168;
export const INSTITUTION_NAME = 'Escola Diogo Mendes teste';
export const PRIVACY_CONTACT = 'dig.mendes.baptista@gmail.com';
export const MINORS_CONTACT = 'dig.mendes.baptista.mb@gmail.com';
export type AccountRole = 'student' | 'teacher' | 'admin';
export type AccountLifecycleStatus = {
  allowed: boolean;
  reason: string;
  expires_at: string | null;
  age_band: 'adult' | 'minor' | 'unknown';
  admission_status: string;
  admission_version: string | null;
};

export type InstitutionalAdmissionProps = {
  role: AccountRole;
  status: AccountLifecycleStatus | null;
  children?: ReactNode;
};

export function isAccountLifecycleStatus(value: unknown): value is AccountLifecycleStatus {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.allowed === 'boolean' &&
    typeof s.reason === 'string' &&
    (s.expires_at === null ||
      (typeof s.expires_at === 'string' && Number.isFinite(Date.parse(s.expires_at)))) &&
    ['adult', 'minor', 'unknown'].includes(String(s.age_band)) &&
    typeof s.admission_status === 'string' &&
    (s.admission_version === null || typeof s.admission_version === 'string')
  );
}

const reasons: Record<string, string> = {
  active: 'Conta ativa.',
  admin_exempt: 'Conta administrativa isenta da expiração de 168 horas.',
  account_expired: 'Conta expirada. Acesso aos recursos bloqueado.',
  lifecycle_unavailable: 'Não foi possível confirmar o ciclo da conta. Acesso bloqueado.',
  age_declaration_required: 'Declare sua faixa etária antes de acessar os recursos.',
  institutional_admission_required:
    'Admissão administrativa necessária. Acesso aos recursos bloqueado.',
};

/** O servidor decide o acesso. A UI não deduz aprovação nem exige evidências extras. */
export function InstitutionalAdmission({ role, status, children }: InstitutionalAdmissionProps) {
  const confirmed = isAccountLifecycleStatus(status) ? status : null;
  return (
    <section aria-label="Admissão institucional" className="privacy-consent-card">
      <h2>Admissão institucional</h2>
      <p>{INSTITUTION_NAME}</p>
      <p>
        Contas student e teacher expiram 168 horas após a criação original da conta. Admin é isento
        desse prazo.
      </p>
      {role === 'admin' && <p>Perfil administrativo: isento do prazo de 168 horas.</p>}
      {confirmed?.expires_at && (
        <p>
          Expiração:{' '}
          <time dateTime={confirmed.expires_at}>
            {new Date(confirmed.expires_at).toLocaleString('pt-BR', {
              timeZone: 'America/Sao_Paulo',
            })}
          </time>{' '}
          (horário de Brasília).
        </p>
      )}
      <p role="status">
        {confirmed
          ? (reasons[confirmed.reason] ?? 'Consulte a decisão de acesso recebida do servidor.')
          : 'Aguardando confirmação do servidor. Recursos bloqueados.'}
      </p>
      <p>
        Menores precisam de admissão administrativa verificável antes dos recursos. Aceitar a
        política ou enviar e-mail não comprova aprovação.
      </p>
      {confirmed && (
        <p>
          Estado da admissão informado pelo servidor: {confirmed.admission_status}. Versão:{' '}
          {confirmed.admission_version ?? 'não informada'}.
        </p>
      )}
      <p>
        Menores e responsáveis: <a href={`mailto:${MINORS_CONTACT}`}>{MINORS_CONTACT}</a>.
      </p>
      <p>
        Privacidade: <a href={`mailto:${PRIVACY_CONTACT}`}>{PRIVACY_CONTACT}</a>.
      </p>
      <p role="status">
        {confirmed?.allowed === true
          ? 'Acesso permitido pelo servidor.'
          : 'Acesso aos recursos bloqueado.'}
      </p>
      {confirmed?.allowed === true && children}
    </section>
  );
}
