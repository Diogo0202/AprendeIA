import { FormEvent, useEffect, useId, useRef, useState } from 'react';
import { apiError, apiFetch } from '../../lib/api';
import { isSupabaseConfigured } from '../../lib/supabase';

type Role = 'student' | 'teacher' | 'admin';

type TrendPoint = { week_start: string; attempts: number; accuracy: number | null };
type GroupMetrics = {
  students: number;
  small_sample: boolean;
  attempts: number | null;
  accuracy: number | null;
  completed_lessons: number | null;
  active_alerts: number | null;
  trend: TrendPoint[];
};
type ClassPerformance = GroupMetrics & {
  id: string;
  name: string;
  school_year: string;
  subject: string;
  teacher_id: string | null;
  teacher_name: string;
};
type TeacherPerformance = GroupMetrics & {
  id: string;
  full_name: string;
  subject: string;
  classes: number;
};
type Performance = {
  min_group_size: number;
  classes: ClassPerformance[];
  teachers: TeacherPerformance[];
};
type TeacherRow = {
  id: string;
  full_name: string;
  email: string;
  registration_status: string;
  subject: string | null;
  classes: number;
  students: number;
};
type ClassRow = {
  id: string;
  name: string;
  school_year: string;
  subject: string;
  teacher_name: string;
  students: number;
};
export type AdminUser = {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  registration_status?: string | null;
  created_at?: string | null;
};

const roleLabels: Record<Role, string> = {
  student: 'Estudante',
  teacher: 'Professor',
  admin: 'Administração',
};

/** Carrega uma rota do painel e mostra a mensagem segura do backend em caso de erro. */
function useAdminData<T>(path: string, initial: T) {
  const [data, setData] = useState<T>(initial);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const controller = new AbortController();
    setLoading(true);
    void (async () => {
      try {
        const response = await apiFetch(path, { signal: controller.signal });
        if (!response.ok)
          throw new Error(await apiError(response, 'Não foi possível carregar os dados.'));
        const body = (await response.json()) as T;
        if (!controller.signal.aborted) {
          setData(body);
          setError('');
        }
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os dados.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [path, version]);

  return { data, error, loading, reload: () => setVersion((value) => value + 1) };
}

function percent(value: number | null) {
  return value === null ? '—' : `${value.toLocaleString('pt-BR')}%`;
}

function Metric({
  group,
  field,
}: {
  group: GroupMetrics;
  field: 'attempts' | 'completed_lessons' | 'active_alerts';
}) {
  const value = group[field];
  return <>{value === null ? '—' : value}</>;
}

/** Barras simples das últimas semanas; semana sem tentativa aparece vazia. */
function Trend({ points }: { points: TrendPoint[] }) {
  if (!points.length) return <span>—</span>;
  return (
    <span
      className="admin-trend"
      role="img"
      aria-label={points
        .map(
          (point) =>
            `semana de ${point.week_start}: ${point.accuracy === null ? 'sem tentativas' : `${point.accuracy}%`}`,
        )
        .join('; ')}
    >
      {points.map((point) => (
        <span
          key={point.week_start}
          className="admin-trend-bar"
          style={{ height: `${Math.max(4, point.accuracy ?? 0) * 0.28}px` }}
        />
      ))}
    </span>
  );
}

function SampleBadge({ group, min }: { group: GroupMetrics; min: number }) {
  if (!group.small_sample) return null;
  return (
    <span className="badge" title={`Indicadores ocultos para grupos com menos de ${min} alunos.`}>
      Amostra pequena
    </span>
  );
}

/** Desempenho agregado por turma e professor; nenhum dado individual de aluno. */
export function AdminPerformance() {
  const [teacherId, setTeacherId] = useState('');
  const path = `/admin/performance${teacherId ? `?teacher_id=${encodeURIComponent(teacherId)}` : ''}`;
  const { data, error, loading } = useAdminData<Performance>(path, {
    min_group_size: 3,
    classes: [],
    teachers: [],
  });
  const teacherOptions = useAdminData<TeacherRow[]>('/admin/teachers', []).data;
  const visible = data.classes.filter((item) => !item.small_sample);
  const totalAttempts = visible.reduce((sum, item) => sum + (item.attempts ?? 0), 0);
  const weighted = visible.reduce(
    (sum, item) => sum + (item.accuracy ?? 0) * (item.attempts ?? 0),
    0,
  );

  return (
    <section
      className="profile-panel"
      aria-labelledby="admin-performance-title"
      aria-busy={loading}
    >
      <div className="audit-heading">
        <div>
          <p className="eyebrow">DESEMPENHO</p>
          <h2 id="admin-performance-title">Desempenho por turma e professor</h2>
          <p>
            Somente totais. Turmas com menos de {data.min_group_size} alunos aparecem como amostra
            pequena para não identificar ninguém.
          </p>
        </div>
        <label>
          PROFESSOR
          <select value={teacherId} onChange={(event) => setTeacherId(event.target.value)}>
            <option value="">Todos</option>
            {teacherOptions.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.full_name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p className="form-message" role="alert">
          {error}
        </p>
      )}
      <section className="teacher-metric-strip" aria-label="Resumo do desempenho">
        <div>
          <span>Turmas</span>
          <strong>{data.classes.length}</strong>
        </div>
        <div>
          <span>Professores</span>
          <strong>{data.teachers.length}</strong>
        </div>
        <div>
          <span>Tentativas</span>
          <strong>{totalAttempts}</strong>
        </div>
        <div>
          <span>Acerto médio</span>
          <strong>
            {totalAttempts ? percent(Math.round((weighted / totalAttempts) * 10) / 10) : '—'}
          </strong>
        </div>
      </section>

      <h3>Por turma</h3>
      <div
        className="audit-table-wrap"
        tabIndex={0}
        role="region"
        aria-label="Desempenho por turma, tabela com rolagem"
      >
        <table className="audit-table">
          <thead>
            <tr>
              <th>Turma</th>
              <th>Professor</th>
              <th>Alunos</th>
              <th>Acerto</th>
              <th>Tentativas</th>
              <th>Aulas concluídas</th>
              <th>Alertas ativos</th>
              <th>Últimas 4 semanas</th>
            </tr>
          </thead>
          <tbody>
            {data.classes.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.name}</strong>
                  <small>
                    {item.subject} · {item.school_year}
                  </small>
                </td>
                <td>{item.teacher_name}</td>
                <td>
                  {item.students} <SampleBadge group={item} min={data.min_group_size} />
                </td>
                <td>{percent(item.accuracy)}</td>
                <td>
                  <Metric group={item} field="attempts" />
                </td>
                <td>
                  <Metric group={item} field="completed_lessons" />
                </td>
                <td>
                  <Metric group={item} field="active_alerts" />
                </td>
                <td>
                  <Trend points={item.trend} />
                </td>
              </tr>
            ))}
            {!loading && !data.classes.length && (
              <tr>
                <td colSpan={8}>Nenhuma turma encontrada.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h3>Por professor</h3>
      <div
        className="audit-table-wrap"
        tabIndex={0}
        role="region"
        aria-label="Desempenho por professor, tabela com rolagem"
      >
        <table className="audit-table">
          <thead>
            <tr>
              <th>Professor</th>
              <th>Turmas</th>
              <th>Alunos</th>
              <th>Acerto</th>
              <th>Tentativas</th>
              <th>Alertas ativos</th>
              <th>Últimas 4 semanas</th>
            </tr>
          </thead>
          <tbody>
            {data.teachers.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.full_name}</strong>
                  <small>{item.subject}</small>
                </td>
                <td>{item.classes}</td>
                <td>
                  {item.students} <SampleBadge group={item} min={data.min_group_size} />
                </td>
                <td>{percent(item.accuracy)}</td>
                <td>
                  <Metric group={item} field="attempts" />
                </td>
                <td>
                  <Metric group={item} field="active_alerts" />
                </td>
                <td>
                  <Trend points={item.trend} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Consulta de todos os professores e turmas, sem edição. */
export function AdminTeachersClasses() {
  const teachers = useAdminData<TeacherRow[]>('/admin/teachers', []);
  const classes = useAdminData<ClassRow[]>('/admin/classes', []);
  const error = teachers.error || classes.error;

  return (
    <section className="profile-panel" aria-labelledby="admin-teachers-title">
      <p className="eyebrow">CORPO DOCENTE</p>
      <h2 id="admin-teachers-title">Professores</h2>
      {error && (
        <p className="form-message" role="alert">
          {error}
        </p>
      )}
      <div
        className="audit-table-wrap"
        tabIndex={0}
        role="region"
        aria-label="Professores, tabela com rolagem"
      >
        <table className="audit-table">
          <thead>
            <tr>
              <th>Professor</th>
              <th>Disciplina</th>
              <th>Situação</th>
              <th>Turmas</th>
              <th>Alunos</th>
            </tr>
          </thead>
          <tbody>
            {teachers.data.map((teacher) => (
              <tr key={teacher.id}>
                <td>
                  <strong>{teacher.full_name}</strong>
                  <small>{teacher.email}</small>
                </td>
                <td>{teacher.subject ?? 'Sem disciplina'}</td>
                <td>{teacher.registration_status === 'active' ? 'Ativo' : 'Pendente'}</td>
                <td>{teacher.classes}</td>
                <td>{teacher.students}</td>
              </tr>
            ))}
            {!teachers.loading && !teachers.data.length && (
              <tr>
                <td colSpan={5}>Nenhum professor cadastrado.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2>Turmas</h2>
      <div
        className="audit-table-wrap"
        tabIndex={0}
        role="region"
        aria-label="Turmas, tabela com rolagem"
      >
        <table className="audit-table">
          <thead>
            <tr>
              <th>Turma</th>
              <th>Disciplina</th>
              <th>Professor</th>
              <th>Alunos</th>
            </tr>
          </thead>
          <tbody>
            {classes.data.map((item) => (
              <tr key={item.id}>
                <td>
                  <strong>{item.name}</strong>
                  <small>{item.school_year}</small>
                </td>
                <td>{item.subject}</td>
                <td>{item.teacher_name}</td>
                <td>{item.students}</td>
              </tr>
            ))}
            {!classes.loading && !classes.data.length && (
              <tr>
                <td colSpan={4}>Nenhuma turma cadastrada.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

type DeletionDialogProps = {
  target: AdminUser;
  onCancel: () => void;
  onDeleted: (target: AdminUser) => void;
};

/** Diálogo nativo: foco preso e confirmação digitada antes de uma ação irreversível. */
function DeletionDialog({ target, onCancel, onDeleted }: DeletionDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [confirmation, setConfirmation] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirmation !== 'EXCLUIR' || reason.trim().length < 5 || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await apiFetch(`/admin/users/${encodeURIComponent(target.id)}/delete`, {
        method: 'POST',
        body: JSON.stringify({ confirmation, reason: reason.trim() }),
      });
      if (!response.ok)
        throw new Error(await apiError(response, 'Não foi possível excluir a conta.'));
      onDeleted(target);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível excluir a conta.');
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="privacy-policy-dialog"
      aria-labelledby={titleId}
      onCancel={onCancel}
    >
      <form className="privacy-policy-content" onSubmit={(event) => void submit(event)}>
        <h2 id={titleId}>Excluir {target.full_name}</h2>
        <p className="privacy-policy-review-note">
          A exclusão não pode ser desfeita. Encerra o acesso e remove o perfil, as conversas e o
          histórico identificável desta conta.
          {target.role === 'teacher' &&
            ' As turmas ficam sem professor e o progresso dos alunos é preservado.'}
        </p>
        <label>
          MOTIVO
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            minLength={5}
            maxLength={300}
            required
          />
          <small className="field-help">
            Fica no registro de auditoria por até 7 dias. Não inclua dados pessoais.
          </small>
        </label>
        <label>
          DIGITE EXCLUIR PARA CONFIRMAR
          <input
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
            required
          />
        </label>
        {error && (
          <p className="form-message" role="alert">
            {error}
          </p>
        )}
        <div className="analytics-consent-actions">
          <button type="button" className="outline-button" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button
            type="submit"
            className="primary-button"
            disabled={busy || confirmation !== 'EXCLUIR' || reason.trim().length < 5}
          >
            {busy ? 'Excluindo...' : 'Excluir conta'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

type AdminUsersProps = {
  users: AdminUser[];
  currentUserId?: string | null;
  onViewActivity: (user: AdminUser) => void;
  onDeleted: (user: AdminUser) => void;
};

/** Lista de contas com busca, histórico e exclusão; administração não é excluível aqui. */
export function AdminUsers({ users, currentUserId, onViewActivity, onDeleted }: AdminUsersProps) {
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<'' | Role>('');
  const [target, setTarget] = useState<AdminUser | null>(null);
  const [message, setMessage] = useState('');
  const normalized = query.trim().toLocaleLowerCase('pt-BR');
  const visible = users.filter(
    (user) =>
      (!role || user.role === role) &&
      (!normalized ||
        user.full_name.toLocaleLowerCase('pt-BR').includes(normalized) ||
        user.email.toLocaleLowerCase('pt-BR').includes(normalized)),
  );

  return (
    <section className="profile-panel" aria-labelledby="admin-users-title">
      <p className="eyebrow">CONTAS</p>
      <h2 id="admin-users-title">Usuários</h2>
      <div className="audit-filters">
        <label>
          BUSCAR
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nome ou e-mail"
          />
        </label>
        <label>
          PERFIL
          <select value={role} onChange={(event) => setRole(event.target.value as '' | Role)}>
            <option value="">Todos</option>
            <option value="student">Estudante</option>
            <option value="teacher">Professor</option>
            <option value="admin">Administração</option>
          </select>
        </label>
      </div>
      {message && (
        <p className="form-message" role="status">
          {message}
        </p>
      )}
      <div
        className="audit-table-wrap"
        tabIndex={0}
        role="region"
        aria-label="Atividades, tabela com rolagem"
      >
        <table className="audit-table">
          <thead>
            <tr>
              <th>Usuário</th>
              <th>Perfil</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((user) => {
              const protectedAccount = user.role === 'admin' || user.id === currentUserId;
              return (
                <tr key={user.id}>
                  <td>
                    <strong>{user.full_name}</strong>
                    <small>{user.email}</small>
                  </td>
                  <td>
                    <span className="badge">{roleLabels[user.role]}</span>
                  </td>
                  <td>
                    <button
                      className="outline-button"
                      type="button"
                      onClick={() => onViewActivity(user)}
                    >
                      Ver atividades
                    </button>{' '}
                    {!protectedAccount && (
                      <button
                        className="outline-button"
                        type="button"
                        onClick={() => {
                          setMessage('');
                          setTarget(user);
                        }}
                        aria-label={`Excluir ${user.full_name}`}
                      >
                        Excluir
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {!visible.length && (
              <tr>
                <td colSpan={3}>Nenhum usuário encontrado.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {target && (
        <DeletionDialog
          target={target}
          onCancel={() => setTarget(null)}
          onDeleted={(deleted) => {
            setTarget(null);
            setMessage(`Conta de ${deleted.full_name} excluída.`);
            onDeleted(deleted);
          }}
        />
      )}
    </section>
  );
}
