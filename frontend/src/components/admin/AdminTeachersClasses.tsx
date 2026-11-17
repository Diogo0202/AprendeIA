import { type ClassRow, type TeacherRow } from '../../domain/admin';
import { useAdminData } from './useAdminData';

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
