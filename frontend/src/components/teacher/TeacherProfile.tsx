import { CommunicationCenter } from '../CommunicationCenter';
import { isConnected } from '../../application/gateways';
import { NotificationPreferences } from '../NotificationPreferences';
import { NavigationDock } from '../NavigationDock';
import { LegalDocuments } from '../LegalDocuments';
import { Leaderboard } from '../student/Leaderboard';
import { QuestionStudio } from './QuestionStudio';
import type { TrendPoint } from '../../domain/teacher';
import { useTeacherDashboard } from './useTeacherDashboard';
import { Header, Avatar, Difficulty } from '../layout/Chrome';

/** Reúne as tarefas diárias do professor sem misturar funções administrativas. */
export function TeacherProfile({ onLogout }: { onLogout: () => void }) {
  const {
    activeTab,
    setActiveTab,
    overview,
    classes,
    selectedClassId,
    setSelectedClassId,
    selectedClass,
    selectedStudentId,
    setSelectedStudentId,
    alerts,
    contents,
    recommendation,
    message,
    busy,
    sortedStudents,
    selectedStudent,
    tabs,
    teacherGlyphs,
    createClass,
    addStudent,
    removeStudent,
    exportReport,
    createContent,
    importContents,
    requestRecommendation,
  } = useTeacherDashboard();

  return (
    <main id="main-content" tabIndex={-1} className="profile-page teacher-workspace">
      <Header area="ÁREA DO PROFESSOR" onLogout={onLogout} />
      <div className="teacher-app-shell">
        <aside className="teacher-sidebar" aria-label="Navegação do professor">
          <div className="teacher-subject-stamp">
            <span>DISCIPLINA</span>
            <strong>{overview.subject}</strong>
            <small>Acesso restrito à sua matéria</small>
          </div>
          <NavigationDock
            ariaLabel="Navegação do professor"
            items={tabs.map((tab) => ({
              id: tab.id,
              label: tab.label,
              glyph: teacherGlyphs[tab.id],
              active: activeTab === tab.id,
              onSelect: () => setActiveTab(tab.id),
            }))}
          />
          <div className="teacher-privacy-note">
            <strong>Privacidade ativa</strong>
            <p>Você só visualiza dados da sua disciplina e não altera o histórico dos alunos.</p>
          </div>
        </aside>

        <section className="teacher-main">
          <header className="teacher-heading">
            <div>
              <p className="eyebrow">PAINEL PEDAGÓGICO</p>
              <h1>{tabs.find((tab) => tab.id === activeTab)?.label}</h1>
            </div>
            <p className="teacher-status" role="status" aria-live="polite">
              {busy ? 'Atualizando dados...' : message}
            </p>
          </header>

          {activeTab === 'overview' && (
            <div className="teacher-view-stack">
              <section className="teacher-metric-strip" aria-label="Resumo da disciplina">
                <div>
                  <span>Turmas</span>
                  <strong>{overview.class_count}</strong>
                </div>
                <div>
                  <span>Estudantes</span>
                  <strong>{overview.student_count}</strong>
                </div>
                <div className="metric-emphasis">
                  <span>Precisam de atenção</span>
                  <strong>{overview.active_alerts}</strong>
                </div>
                <div>
                  <span>Média de acertos</span>
                  <strong>{overview.average_accuracy}%</strong>
                </div>
              </section>
              <nav className="teacher-quick-actions" aria-label="Atalhos do painel">
                <button onClick={() => setActiveTab('classes')}>
                  <span>01</span>
                  <strong>Organizar turmas</strong>
                  <small>Crie uma turma e inclua alunos</small>
                </button>
                <button onClick={() => setActiveTab('contents')}>
                  <span>02</span>
                  <strong>Adicionar conteúdo</strong>
                  <small>Publique ou importe materiais</small>
                </button>
                <button onClick={() => setActiveTab('reports')}>
                  <span>03</span>
                  <strong>Exportar relatório</strong>
                  <small>Baixe o resumo da turma em CSV</small>
                </button>
              </nav>
              <div className="teacher-overview-grid">
                <section className="teacher-surface teacher-alert-feed">
                  <div className="teacher-section-title">
                    <div>
                      <span className="section-index">01</span>
                      <h2>Prioridades de hoje</h2>
                    </div>
                    <small>{alerts.length} alerta(s) ativo(s)</small>
                  </div>
                  {alerts.length ? (
                    alerts.map((alert) => (
                      <button
                        className="teacher-alert-row"
                        key={alert.id}
                        onClick={() => {
                          setSelectedStudentId(alert.student_id ?? '');
                          setActiveTab('classes');
                        }}
                      >
                        <span className="alert-marker" />
                        <span>
                          <strong>{alert.student_name}</strong>
                          <small>{alert.topic}</small>
                        </span>
                        <span className="alert-score">{alert.accuracy}%</span>
                      </button>
                    ))
                  ) : (
                    <p className="teacher-empty">Nenhum alerta importante agora.</p>
                  )}
                </section>
                <section className="teacher-surface">
                  <div className="teacher-section-title">
                    <div>
                      <span className="section-index">02</span>
                      <h2>Evolução da turma</h2>
                    </div>
                    <small>Dificuldade por semana</small>
                  </div>
                  <DifficultyTrend points={selectedClass.trend ?? []} />
                </section>
              </div>
            </div>
          )}

          {activeTab === 'classes' && (
            <div className="teacher-view-stack">
              <div className="class-toolbar">
                <label>
                  TURMA ATUAL
                  <select
                    value={selectedClassId}
                    onChange={(event) => setSelectedClassId(event.target.value)}
                  >
                    {!classes.length && <option value="">Crie sua primeira turma</option>}
                    {classes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {item.school_year}
                      </option>
                    ))}
                  </select>
                </label>
                <form className="inline-class-form" onSubmit={createClass}>
                  <input
                    name="name"
                    placeholder="Nova turma"
                    minLength={2}
                    maxLength={80}
                    required
                    aria-label="Nome da nova turma"
                  />
                  <input
                    name="school_year"
                    placeholder="Ano letivo"
                    minLength={2}
                    maxLength={30}
                    required
                    aria-label="Ano letivo"
                  />
                  <button className="primary-button" disabled={busy}>
                    Criar turma
                  </button>
                </form>
              </div>
              {selectedClassId && isConnected() && (
                <Leaderboard key={selectedClassId} teacherClassId={selectedClassId} />
              )}
              <div className="class-workbench">
                <section className="teacher-surface class-roster">
                  <div className="teacher-section-title">
                    <div>
                      <span className="section-index">
                        {String(selectedClass.student_count).padStart(2, '0')}
                      </span>
                      <h2>Alunos da turma</h2>
                    </div>
                  </div>
                  <form className="add-student-form" onSubmit={addStudent}>
                    <input
                      name="student_email"
                      type="email"
                      placeholder="email@escola.com"
                      required
                      disabled={!selectedClassId}
                      aria-label="E-mail do estudante"
                    />
                    <button className="outline-button" disabled={busy || !selectedClassId}>
                      Incluir
                    </button>
                  </form>
                  <p className="roster-order-note">
                    Exibidos da menor para a maior nota de acertos.
                  </p>
                  <div className="roster-list">
                    {sortedStudents.length ? (
                      sortedStudents.map((student) => (
                        <button
                          key={student.id}
                          className={`roster-row ${selectedStudentId === student.id ? 'selected' : ''}`}
                          onClick={() => setSelectedStudentId(student.id)}
                        >
                          <Avatar name={student.full_name} />
                          <span>
                            <strong>{student.full_name}</strong>
                            <small>{student.grade}</small>
                          </span>
                          <Difficulty
                            level={student.difficulty}
                            tone={
                              student.difficulty === 'Alta'
                                ? 'high'
                                : student.difficulty === 'Média'
                                  ? 'medium'
                                  : 'low'
                            }
                          />
                        </button>
                      ))
                    ) : (
                      <p className="teacher-empty">A turma ainda não possui estudantes.</p>
                    )}
                  </div>
                </section>
                <section className="teacher-surface student-insight">
                  {selectedStudent ? (
                    <>
                      <div className="student-insight-head">
                        <div>
                          <Avatar name={selectedStudent.full_name} />
                          <span>
                            <h2>{selectedStudent.full_name}</h2>
                            <small>{selectedStudent.grade}</small>
                          </span>
                        </div>
                        <button
                          className="text-button danger-text"
                          onClick={() => void removeStudent(selectedStudent.id)}
                        >
                          Remover da turma
                        </button>
                      </div>
                      <div className="student-number-line">
                        <div>
                          <span>Acertos</span>
                          <strong>{selectedStudent.accuracy}%</strong>
                        </div>
                        <div>
                          <span>Tentativas</span>
                          <strong>{selectedStudent.attempts}</strong>
                        </div>
                        <div>
                          <span>Tempo</span>
                          <strong>{selectedStudent.time_minutes} min</strong>
                        </div>
                        <div>
                          <span>Aulas feitas</span>
                          <strong>{selectedStudent.completed_lessons}</strong>
                        </div>
                      </div>
                      <div className="insight-chart-block">
                        <div>
                          <h3>Trilha de dificuldade</h3>
                          <small>Quanto menor a barra, melhor a evolução.</small>
                        </div>
                        <DifficultyTrend points={selectedStudent.trend} />
                      </div>
                      <div className="student-history">
                        <h3>Histórico recente</h3>
                        {selectedStudent.recent_attempts.map((attempt, index) => (
                          <div key={`${attempt.answered_at}-${index}`}>
                            <span
                              className={
                                attempt.correct ? 'history-dot success' : 'history-dot warning'
                              }
                            />
                            <strong>{attempt.topic}</strong>
                            <small>
                              {attempt.correct ? 'Acertou' : 'Precisa revisar'} ·{' '}
                              {attempt.answered_at.slice(0, 10)}
                            </small>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="teacher-empty">Selecione um estudante para abrir o histórico.</p>
                  )}
                </section>
              </div>
            </div>
          )}

          {activeTab === 'reports' && (
            <section className="teacher-surface report-studio">
              <div className="report-copy">
                <h2>Relatório da turma</h2>
                <p>
                  Selecione a turma e, se precisar, um aluno. O arquivo inclui somente acertos,
                  tentativas, dificuldade e tempo de estudo — nunca senhas.
                </p>
                <div className="report-filters">
                  <label>
                    TURMA
                    <select
                      value={selectedClassId}
                      onChange={(event) => setSelectedClassId(event.target.value)}
                    >
                      {classes.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    ALUNO
                    <select
                      value={selectedStudentId}
                      onChange={(event) => setSelectedStudentId(event.target.value)}
                    >
                      <option value="">Turma inteira</option>
                      {sortedStudents.map((student) => (
                        <option key={student.id} value={student.id}>
                          {student.full_name} · {student.accuracy}%
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
              <div className="report-preview">
                <span>RELATÓRIO ATUAL</span>
                <strong>{selectedClass.name}</strong>
                <small>
                  {selectedStudent
                    ? selectedStudent.full_name
                    : `${selectedClass.student_count} estudantes`}{' '}
                  · {overview.subject}
                </small>
                <button
                  className="primary-button"
                  onClick={() => void exportReport()}
                  disabled={!selectedClassId}
                >
                  Exportar CSV
                </button>
              </div>
            </section>
          )}

          {activeTab === 'reports' && <NotificationPreferences />}

          {activeTab === 'contents' && (
            <div className="content-studio">
              <section className="teacher-surface">
                <div className="teacher-section-title">
                  <div>
                    <span className="section-index">01</span>
                    <h2>Novo conteúdo</h2>
                  </div>
                </div>
                <form className="teacher-form" onSubmit={createContent}>
                  <label>
                    TÍTULO
                    <input name="title" minLength={2} maxLength={120} required />
                  </label>
                  <label>
                    DESCRIÇÃO
                    <textarea name="description" maxLength={1000} rows={4} />
                  </label>
                  <div className="teacher-form-row">
                    <label>
                      TIPO
                      <select name="content_type">
                        <option value="lesson">Aula</option>
                        <option value="exercise">Exercício</option>
                        <option value="video">Vídeo</option>
                        <option value="link">Link</option>
                      </select>
                    </label>
                    <label>
                      LINK
                      <input name="source_url" type="url" placeholder="https://" />
                    </label>
                  </div>
                  <button className="primary-button" disabled={busy}>
                    Salvar conteúdo
                  </button>
                </form>
                <form className="content-import" onSubmit={importContents}>
                  <label>
                    IMPORTAR CSV OU JSON
                    <input name="content_file" type="file" accept=".csv,.json" required />
                  </label>
                  <button className="outline-button" disabled={busy}>
                    Importar arquivo
                  </button>
                </form>
              </section>
              <section className="teacher-surface content-library">
                <div className="teacher-section-title">
                  <div>
                    <span className="section-index">
                      {String(contents.length).padStart(2, '0')}
                    </span>
                    <h2>Biblioteca da disciplina</h2>
                  </div>
                </div>
                {contents.map((content) => (
                  <article key={content.id}>
                    <span>{content.content_type}</span>
                    <strong>{content.title}</strong>
                    <p>{content.description || 'Sem descrição.'}</p>
                    {content.source_url && (
                      <a href={content.source_url} target="_blank" rel="noreferrer">
                        Abrir material
                      </a>
                    )}
                  </article>
                ))}
              </section>
            </div>
          )}

          {activeTab === 'questions' && <QuestionStudio subject={overview.subject} />}

          {activeTab === 'messages' && (
            <CommunicationCenter role="teacher" requestedMode="direct" />
          )}

          {activeTab === 'ai' && (
            <section className="ai-studio">
              <div className="ai-brief">
                <p className="eyebrow">APOIO PEDAGÓGICO</p>
                <h2>Transforme dados em uma próxima aula possível.</h2>
                <p>
                  A IA recebe somente métricas da turma ou do aluno escolhido, sem nomes e sem
                  conteúdo de outras disciplinas.
                </p>
                <label>
                  TURMA
                  <select
                    value={selectedClassId}
                    onChange={(event) => setSelectedClassId(event.target.value)}
                  >
                    {classes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  FOCO
                  <select
                    value={selectedStudentId}
                    onChange={(event) => setSelectedStudentId(event.target.value)}
                  >
                    <option value="">Turma inteira</option>
                    {selectedClass.students?.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.full_name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="primary-button"
                  onClick={() => void requestRecommendation()}
                  disabled={busy || !selectedClassId}
                >
                  {busy ? 'Analisando...' : 'Gerar recomendação'}
                </button>
              </div>
              <article className="ai-result" aria-live="polite">
                {recommendation ? (
                  <>
                    <span className="ai-result-label">RECOMENDAÇÃO PRONTA</span>
                    <h3>{recommendation.objective}</h3>
                    <p>{recommendation.diagnosis}</p>
                    <ol>
                      {recommendation.actions.map((action) => (
                        <li key={action}>{action}</li>
                      ))}
                    </ol>
                    <div>
                      <strong>Conteúdo sugerido</strong>
                      <p>{recommendation.content_suggestion}</p>
                    </div>
                  </>
                ) : (
                  <div className="ai-empty">
                    <span>IA</span>
                    <h3>O plano da próxima intervenção aparece aqui.</h3>
                    <p>Escolha uma turma ou estudante e gere uma recomendação.</p>
                  </div>
                )}
              </article>
            </section>
          )}
          {activeTab === 'legal' && <LegalDocuments />}
        </section>
      </div>
    </main>
  );
}

/** Barras deixam a evolução legível sem depender de uma biblioteca pesada de gráficos. */
function DifficultyTrend({ points }: { points: TrendPoint[] }) {
  if (!points.length)
    return (
      <p className="teacher-empty">Ainda não há tentativas suficientes para formar o gráfico.</p>
    );
  return (
    <figure style={{ margin: 0 }}>
      <figcaption>Dificuldade por semana. Percentuais menores indicam melhora.</figcaption>
      <div className="difficulty-trend" aria-hidden="true">
        {points.map((point) => (
          <div
            className="trend-column"
            key={point.week}
            title={`${point.week}: dificuldade ${point.difficulty_score}%`}
          >
            <span className="trend-value">{point.difficulty_score}%</span>
            <span className="trend-bar-track">
              <span
                className="trend-bar"
                style={{ height: `${Math.max(8, point.difficulty_score)}%` }}
              />
            </span>
            <small>{point.week.replace(/^\d{4}-/, '')}</small>
          </div>
        ))}
      </div>
      <details>
        <summary>Ver valores do gráfico</summary>
        <table>
          <caption>Dificuldade registrada por semana</caption>
          <thead>
            <tr>
              <th scope="col">Semana</th>
              <th scope="col">Dificuldade</th>
            </tr>
          </thead>
          <tbody>
            {points.map((point) => (
              <tr key={point.week}>
                <th scope="row">{point.week}</th>
                <td>{point.difficulty_score}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
