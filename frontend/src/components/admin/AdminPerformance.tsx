import { useState } from 'react';
import { type Performance, type TeacherRow } from '../../domain/admin';
import { useAdminData } from './useAdminData';
import { Metric, SampleBadge, Trend, percent } from './PerformanceWidgets';

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
