import { useCallback, useEffect, useState } from 'react';
import { apiError, apiFetch } from '../../lib/api';

type AuditEvent = {
  id: number;
  actor_id: string | null;
  actor_name: string;
  actor_role: 'student' | 'teacher' | 'admin' | 'service' | null;
  action: string;
  resource: string;
  resource_id: string | null;
  metadata: Record<string, string | number | boolean | null>;
  request_method: string;
  route: string;
  status_code: number;
  outcome: 'success' | 'denied' | 'error';
  request_id: string;
  occurred_at: string;
};

const roleLabels: Record<string, string> = {
  student: 'Estudante',
  teacher: 'Professor',
  admin: 'Administração',
  service: 'Serviço',
};

const outcomeLabels = {
  success: 'Concluído',
  denied: 'Bloqueado',
  error: 'Erro',
};

/** Mostra para a administração apenas os metadados seguros da auditoria. */
export function AuditLogPanel() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [days, setDays] = useState('7');
  const [role, setRole] = useState('');
  const [outcome, setOutcome] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ days, limit: '100' });
    if (role) params.set('role', role);
    if (outcome) params.set('outcome', outcome);
    const response = await apiFetch(`/admin/audit-logs?${params.toString()}`);
    if (!response.ok) {
      setMessage(await apiError(response, 'Não foi possível carregar a auditoria.'));
      setLoading(false);
      return;
    }
    setEvents((await response.json()) as AuditEvent[]);
    setMessage('');
    setLoading(false);
  }, [days, outcome, role]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="profile-panel audit-panel" aria-labelledby="audit-title">
      <div className="audit-heading">
        <div>
          <p className="eyebrow">SEGURANÇA E RASTREABILIDADE</p>
          <h2 id="audit-title">Auditoria de acessos</h2>
          <p>Registros técnicos das funcionalidades, sem senha, token, conteúdo ou IP puro.</p>
        </div>
        <button
          className="outline-button"
          type="button"
          onClick={() => void load()}
          disabled={loading}
        >
          Atualizar
        </button>
      </div>
      <div className="audit-filters" aria-label="Filtros da auditoria">
        <label>
          PERÍODO
          <select value={days} onChange={(event) => setDays(event.target.value)}>
            <option value="1">Hoje</option>
            <option value="3">3 dias</option>
            <option value="7">7 dias (máximo)</option>
          </select>
        </label>
        <label>
          PERFIL
          <select value={role} onChange={(event) => setRole(event.target.value)}>
            <option value="">Todos</option>
            <option value="student">Estudante</option>
            <option value="teacher">Professor</option>
            <option value="admin">Administração</option>
            <option value="service">Serviço</option>
          </select>
        </label>
        <label>
          RESULTADO
          <select value={outcome} onChange={(event) => setOutcome(event.target.value)}>
            <option value="">Todos</option>
            <option value="success">Concluído</option>
            <option value="denied">Bloqueado</option>
            <option value="error">Erro</option>
          </select>
        </label>
      </div>
      {message && (
        <p className="form-message" role="alert">
          {message}
        </p>
      )}
      <div className="audit-table-wrap">
        <table className="audit-table">
          <thead>
            <tr>
              <th>Quando</th>
              <th>Usuário</th>
              <th>Ação</th>
              <th>Resultado</th>
              <th>Recurso</th>
              <th>Requisição</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.id}>
                <td>
                  <time dateTime={event.occurred_at}>
                    {new Intl.DateTimeFormat('pt-BR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    }).format(new Date(event.occurred_at))}
                  </time>
                </td>
                <td>
                  <strong>{event.actor_name}</strong>
                  <small>
                    {event.actor_role ? roleLabels[event.actor_role] : 'Não identificado'}
                  </small>
                </td>
                <td>
                  <strong>{event.action.replace(/\./g, ' · ')}</strong>
                  <small>
                    {event.request_method} {event.route}
                  </small>
                </td>
                <td>
                  <span className={`audit-outcome ${event.outcome}`}>
                    {outcomeLabels[event.outcome]}
                  </span>
                  <small>HTTP {event.status_code}</small>
                </td>
                <td>
                  <strong>{event.resource}</strong>
                  <small>{event.resource_id || 'Sem identificador'}</small>
                </td>
                <td>
                  <code title={event.request_id}>{event.request_id.slice(0, 8)}</code>
                </td>
              </tr>
            ))}
            {!loading && events.length === 0 && (
              <tr>
                <td colSpan={6}>Nenhum acesso encontrado para estes filtros.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {loading && (
        <p className="teacher-empty" role="status">
          Carregando eventos...
        </p>
      )}
    </section>
  );
}
