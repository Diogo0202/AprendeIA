import { type GroupMetrics, type TrendPoint } from '../../domain/admin';

export function percent(value: number | null) {
  return value === null ? '—' : `${value.toLocaleString('pt-BR')}%`;
}

export function Metric({
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
export function Trend({ points }: { points: TrendPoint[] }) {
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

export function SampleBadge({ group, min }: { group: GroupMetrics; min: number }) {
  if (!group.small_sample) return null;
  return (
    <span className="badge" title={`Indicadores ocultos para grupos com menos de ${min} alunos.`}>
      Amostra pequena
    </span>
  );
}
