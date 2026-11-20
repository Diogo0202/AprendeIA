import { useEffect, useId, useState } from 'react';
import { apiFetch } from '../../lib/api';
import './gamification.css';

export type GamificationAchievement = {
  id: string;
  title: string;
  description: string;
  icon: string;
  bonus_xp: number;
  unlocked: boolean;
  progress: number;
  target: number;
};
export type GamificationAchievementsData = {
  achievements: GamificationAchievement[];
  catalog?: GamificationAchievement[];
  points: number;
  weekly_xp: number;
  bonus_xp: number;
};
export type GamificationAchievementsProps = {
  /** Mount immediately below the existing avatar. Supplied data reuses the parent's API request. */
  data?: GamificationAchievementsData;
  connected?: boolean;
  demoData?: GamificationAchievementsData;
};
const icons: Record<string, string> = {
  '🧭': '🧭',
  '🔎': '🔎',
  '📚': '📚',
  '🏅': '🏅',
  '🎯': '🎯',
  '🏆': '🏆',
  '📅': '📅',
  '🚀': '🚀',
  '⭐': '⭐',
  trophy: '🏆',
  star: '⭐',
  flame: '🔥',
  target: '🎯',
  medal: '🏅',
  book: '📖',
};

export function GamificationAchievements({
  data,
  connected = true,
  demoData,
}: GamificationAchievementsProps) {
  const id = useId();
  const [result, setResult] = useState<GamificationAchievementsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const supplied = connected ? data : demoData;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    setResult(null);
    void (async () => {
      try {
        let payload = supplied;
        if (!payload) {
          if (!connected) throw new Error('missing demo');
          const response = await apiFetch('/student/gamification', { signal: controller.signal });
          if (!response.ok) throw new Error('request failed');
          payload = (await response.json()) as GamificationAchievementsData;
        }
        if (!controller.signal.aborted) setResult(payload);
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [supplied, connected, revision]);

  // Catalog includes locked goals. The achievement state overrides matching catalog entries.
  const catalog = new Map(result?.catalog?.map((item) => [item.id, item]));
  result?.achievements.forEach((item) =>
    catalog.set(item.id, { ...catalog.get(item.id), ...item }),
  );
  const achievements = [...catalog.values()];
  return (
    <section className="gf-surface" aria-labelledby={`${id}-heading`} aria-busy={loading}>
      <h2 id={`${id}-heading`}>Conquistas</h2>
      {!connected && <p role="status">Demonstração: conquistas de exemplo.</p>}
      {loading && <p role="status">Carregando conquistas...</p>}
      {error && (
        <div role="alert">
          <p>Não foi possível carregar as conquistas.</p>
          <button type="button" onClick={() => setRevision((value) => value + 1)}>
            Tentar novamente
          </button>
        </div>
      )}
      {result && (
        <>
          <dl className="gf-totals">
            <div>
              <dt>XP total</dt>
              <dd>{result.points}</dd>
            </div>
            <div>
              <dt>XP semanal</dt>
              <dd>{result.weekly_xp}</dd>
            </div>
            <div>
              <dt>XP de bônus</dt>
              <dd>{result.bonus_xp}</dd>
            </div>
          </dl>
          {achievements.length === 0 ? (
            <p role="status">Nenhuma conquista disponível.</p>
          ) : (
            <ul className="gf-achievements">
              {achievements.map((item) => {
                const target = Number.isFinite(item.target) && item.target > 0 ? item.target : 0;
                const progress = Number.isFinite(item.progress)
                  ? Math.max(0, Math.min(item.progress, target))
                  : 0;
                return (
                  <li
                    key={item.id}
                    className={item.unlocked ? 'gf-achievement gf-unlocked' : 'gf-achievement'}
                  >
                    <span className="gf-achievement-icon" aria-hidden="true">
                      {icons[item.icon] ?? '🏅'}
                    </span>
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                    <span className="gf-tag">{item.unlocked ? 'Desbloqueada' : 'Bloqueada'}</span>
                    <p>Bônus: {item.bonus_xp} XP</p>
                    {!item.unlocked &&
                      (target > 0 ? (
                        <>
                          <progress
                            aria-label={`Progresso de ${item.title}`}
                            value={progress}
                            max={target}
                          />
                          <p>
                            {progress} de {target}
                          </p>
                        </>
                      ) : (
                        <p>Meta ainda não disponível.</p>
                      ))}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
