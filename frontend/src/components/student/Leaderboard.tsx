import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { apiFetch } from '../../lib/api';
import './gamification.css';

export type LeaderboardEntry = {
  alias: string;
  avatar_key: string | null;
  weekly_xp: number;
  level: number;
  rank: number;
  is_me: boolean;
};
export type LeaderboardData = {
  entries: LeaderboardEntry[];
  my_position: LeaderboardEntry | null;
  total: number;
  page: number;
  page_size: number;
  week_start: string;
  week_end: string;
  classes: { id: string; name: string }[];
  school_opt_in: boolean;
  alias: string;
};
export type LeaderboardPreferences = { alias: string; school_opt_in: boolean };
export type LeaderboardProps = {
  /** Connected by default. Demo data must be supplied explicitly and never calls the API. */
  connected?: boolean;
  demoData?: LeaderboardData;
  initialClassId?: string;
  teacherClassId?: string;
  pageSize?: number;
  onPreferencesSaved?: (preferences: LeaderboardPreferences) => void;
};

const avatars: Record<string, string> = {
  orbit: '🪐',
  spark: '✨',
  books: '📚',
  prism: '🔷',
  trail: '🌠',
};
const loadError = 'Não foi possível carregar o ranking. Tente novamente.';
const avatarIcon = (key: string | null) => (key && avatars[key]) || '●';

function Position({ entry }: { entry: LeaderboardEntry }) {
  return (
    <>
      <span className="gf-avatar" aria-hidden="true">
        {avatarIcon(entry.avatar_key)}
      </span>
      <strong>{entry.alias}</strong>
      {entry.is_me && <span className="gf-tag">Você</span>}
      <span>{entry.weekly_xp} XP nesta semana</span>
      <span>Nível {entry.level}</span>
    </>
  );
}

/** Mount in the student's ranking area. Authorization and alias validation belong to the API. */
export function Leaderboard({
  connected = true,
  demoData,
  initialClassId = '',
  teacherClassId,
  pageSize = 20,
  onPreferencesSaved,
}: LeaderboardProps) {
  const id = useId();
  const [scope, setScope] = useState<'class' | 'school'>('class');
  const [classId, setClassId] = useState(initialClassId);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [alias, setAlias] = useState('');
  const [optIn, setOptIn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [message, setMessage] = useState('');
  const saveController = useRef<AbortController | null>(null);
  const effectivePageSize = Math.max(1, Math.min(50, Math.trunc(pageSize) || 20));
  const teacher = Boolean(teacherClassId);

  useEffect(() => () => saveController.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setData(null);
    void (async () => {
      try {
        let result: LeaderboardData;
        if (!connected) {
          if (!demoData) throw new Error('missing demo');
          const entries = demoData.entries;
          result = {
            ...demoData,
            entries: entries.slice((page - 1) * effectivePageSize, page * effectivePageSize),
            page,
            page_size: effectivePageSize,
          };
        } else {
          const query = new URLSearchParams(
            teacher
              ? { page: String(page), page_size: String(effectivePageSize) }
              : { scope, page: String(page), page_size: String(effectivePageSize) },
          );
          if (!teacher && scope === 'class' && classId) query.set('class_id', classId);
          const path = teacher
            ? `/teacher/classes/${encodeURIComponent(teacherClassId!)}/leaderboard`
            : '/student/leaderboard';
          const response = await apiFetch(`${path}?${query}`, { signal: controller.signal });
          if (!response.ok) throw new Error('request failed');
          result = (await response.json()) as LeaderboardData;
        }
        if (controller.signal.aborted) return;
        // The first class request discovers the authorized class list; never invent a class UUID.
        if (!teacher && scope === 'class' && !classId && result.classes.length) {
          setClassId(result.classes[0].id);
          return;
        }
        setData(result);
        setAlias(result.alias);
        setOptIn(result.school_opt_in);
      } catch {
        if (!controller.signal.aborted) setError(loadError);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [
    connected,
    demoData,
    scope,
    classId,
    page,
    effectivePageSize,
    revision,
    teacherClassId,
    teacher,
  ]);

  useEffect(() => {
    setPage(1);
  }, [teacherClassId]);

  function changeScope(next: 'class' | 'school') {
    if (next === scope) return;
    setData(null);
    setLoading(true);
    setScope(next);
    setPage(1);
    setMessage('');
    setSaveError('');
  }

  function tabKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 'class'
        : event.key === 'End'
          ? 'school'
          : scope === 'class'
            ? 'school'
            : 'class';
    changeScope(next);
    document.getElementById(`${id}-tab-${next}`)?.focus();
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !data || !connected || teacher) return;
    const controller = new AbortController();
    saveController.current = controller;
    const preferences = { alias: alias.trim(), school_opt_in: optIn };
    if (preferences.alias.length < 3 || preferences.alias.length > 24) return;
    setSaving(true);
    setSaveError('');
    setMessage('');
    try {
      const response = await apiFetch('/student/leaderboard-preferences', {
        method: 'PUT',
        body: JSON.stringify(preferences),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('save failed');
      if (controller.signal.aborted) return;
      setMessage('Preferências salvas.');
      setPage(1);
      setRevision((value) => value + 1);
      onPreferencesSaved?.(preferences);
    } catch {
      if (!controller.signal.aborted)
        setSaveError('Não foi possível salvar. Confira o apelido e tente novamente.');
    } finally {
      if (!controller.signal.aborted) setSaving(false);
    }
  }

  const schoolHidden = !teacher && scope === 'school' && !data?.school_opt_in;
  const hasClass = teacher || scope === 'school' || Boolean(data?.classes.length);
  const visible = data && !schoolHidden && hasClass;
  const podium = visible && data.page === 1 ? data.entries.filter((entry) => entry.rank <= 3) : [];
  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <section className="gf-surface" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>Ranking semanal</h2>
      {!connected && (
        <p className="gf-notice" role="status">
          Demonstração: dados de exemplo, sem ranking ao vivo.
        </p>
      )}
      {teacher ? (
        <p>Ranking semanal da turma selecionada, por apelidos.</p>
      ) : (
        <p>
          Você participa automaticamente do ranking da turma. A participação no ranking da escola
          começa desativada e depende da sua escolha.
        </p>
      )}
      {!teacher && (
        <div className="gf-tabs" role="tablist" aria-label="Abrangência do ranking">
          {(['class', 'school'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              id={`${id}-tab-${value}`}
              aria-controls={`${id}-panel`}
              aria-selected={scope === value}
              tabIndex={scope === value ? 0 : -1}
              disabled={saving}
              onKeyDown={tabKey}
              onClick={() => changeScope(value)}
            >
              {value === 'class' ? 'Turma' : 'Escola'}
            </button>
          ))}
        </div>
      )}
      <div
        id={`${id}-panel`}
        role={teacher ? 'region' : 'tabpanel'}
        aria-labelledby={teacher ? `${id}-heading` : `${id}-tab-${scope}`}
        aria-busy={loading}
        tabIndex={0}
      >
        {loading && <p role="status">Carregando ranking...</p>}
        {error && (
          <div role="alert">
            <p>{error}</p>
            <button type="button" onClick={() => setRevision((value) => value + 1)}>
              Tentar novamente
            </button>
          </div>
        )}
        {data && (
          <>
            {!teacher && scope === 'class' && data.classes.length > 0 && (
              <label className="gf-field">
                Turma
                <select
                  value={classId}
                  disabled={saving}
                  onChange={(event) => {
                    setData(null);
                    setLoading(true);
                    setClassId(event.target.value);
                    setPage(1);
                  }}
                >
                  {data.classes.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p className="gf-period">
              Semana: <time dateTime={data.week_start}>{data.week_start}</time> a{' '}
              <time dateTime={data.week_end}>{data.week_end}</time>
            </p>
            {!hasClass && <p role="status">Você ainda não participa de uma turma.</p>}
            {schoolHidden && (
              <p role="status">
                Ative a participação na escola nas preferências para acessar este ranking.
              </p>
            )}
            {visible && (
              <>
                {podium.length > 0 && (
                  <div className="gf-podium" aria-label="Pódio semanal">
                    {podium.map((entry, index) => (
                      <article key={index} className="gf-podium-card">
                        <span>{entry.rank}º lugar</span>
                        <Position entry={entry} />
                      </article>
                    ))}
                    <p>Empates mantêm a mesma posição.</p>
                  </div>
                )}
                {data.entries.length === 0 ? (
                  <p role="status">Nenhuma posição nesta semana.</p>
                ) : (
                  <div className="gf-table-scroll">
                    <table>
                      <caption>Posições por XP semanal</caption>
                      <thead>
                        <tr>
                          <th scope="col">Posição</th>
                          <th scope="col">Apelido</th>
                          <th scope="col">XP semanal</th>
                          <th scope="col">Nível</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.entries.map((entry, index) => (
                          <tr key={index} aria-current={entry.is_me ? 'true' : undefined}>
                            <th scope="row">{entry.rank}º</th>
                            <td>
                              <span aria-hidden="true">{avatarIcon(entry.avatar_key)} </span>
                              {entry.alias}
                              {entry.is_me && ' (você)'}
                            </td>
                            <td>{entry.weekly_xp}</td>
                            <td>{entry.level}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {!teacher && (
                  <aside className="gf-own" aria-label="Sua posição">
                    {data.my_position ? (
                      <>
                        <span>Sua posição: {data.my_position.rank}º</span>
                        <Position entry={data.my_position} />
                      </>
                    ) : (
                      <p>Você ainda não tem posição nesta semana.</p>
                    )}
                  </aside>
                )}
                {pages > 1 && (
                  <nav className="gf-pagination" aria-label="Páginas do ranking">
                    <button
                      type="button"
                      disabled={data.page <= 1 || saving}
                      onClick={() => {
                        setData(null);
                        setLoading(true);
                        setPage(data.page - 1);
                      }}
                    >
                      Anterior
                    </button>
                    <span role="status">
                      Página {data.page} de {pages}
                    </span>
                    <button
                      type="button"
                      disabled={data.page >= pages || saving}
                      onClick={() => {
                        setData(null);
                        setLoading(true);
                        setPage(data.page + 1);
                      }}
                    >
                      Próxima
                    </button>
                  </nav>
                )}
              </>
            )}
            {!teacher && (
              <form
                className="gf-preferences"
                onSubmit={(event) => void save(event)}
                aria-label="Preferências do ranking"
              >
                <fieldset disabled={saving || !connected}>
                  <legend>Preferências do ranking</legend>
                  <label className="gf-field" htmlFor={`${id}-alias`}>
                    Apelido público
                  </label>
                  <input
                    id={`${id}-alias`}
                    value={alias}
                    required
                    minLength={3}
                    maxLength={24}
                    aria-describedby={`${id}-privacy`}
                    onChange={(event) => setAlias(event.target.value)}
                  />
                  <p id={`${id}-privacy`}>
                    Escolha um apelido sem nome completo, e-mail ou telefone.
                  </p>
                  <label className="gf-check">
                    <input
                      type="checkbox"
                      checked={optIn}
                      onChange={(event) => setOptIn(event.target.checked)}
                    />{' '}
                    Participar do ranking da escola
                  </label>
                  <button
                    type="submit"
                    disabled={alias.trim().length < 3 || alias.trim().length > 24}
                  >
                    {saving ? 'Salvando...' : 'Salvar preferências'}
                  </button>
                </fieldset>
              </form>
            )}
          </>
        )}
      </div>
      {saveError && <p role="alert">{saveError}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
