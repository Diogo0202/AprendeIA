import { FormEvent, useEffect, useState } from 'react';
import { CommunicationCenter } from '../CommunicationCenter';
import { NotificationPreferences } from '../NotificationPreferences';
import { NavigationDock } from '../NavigationDock';
import { LegalDocuments } from '../LegalDocuments';
import { Leaderboard } from '../student/Leaderboard';
import { QuestionStudio } from './QuestionStudio';
import { apiFetch } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { Header, Avatar, Difficulty } from '../layout/Chrome';

type TeacherStudent = {
  id: string;
  full_name: string;
  grade: string;
  email?: string;
  subject?: string;
  accuracy: number;
  attempts: number;
  difficulty: string;
  time_minutes: number;
  completed_lessons: number;
  trend: TrendPoint[];
  difficulties: { topic: string; accuracy: number; attempts: number }[];
  recent_attempts: { answered_at: string; topic: string; correct: boolean }[];
};

type TrendPoint = {
  week: string;
  accuracy: number;
  difficulty_score: number;
  attempts: number;
  level: string;
};

type TeacherClass = {
  id: string;
  name: string;
  school_year: string;
  subject: string;
  student_count: number;
  students?: TeacherStudent[];
  trend?: TrendPoint[];
};

type TeacherOverview = {
  subject: string;
  class_count: number;
  student_count: number;
  active_alerts: number;
  average_accuracy: number;
};

type TeacherContent = {
  id: string;
  title: string;
  description: string;
  content_type: 'lesson' | 'exercise' | 'video' | 'link';
  source_url: string;
  created_at?: string;
};

type TeacherRecommendation = {
  diagnosis: string;
  objective: string;
  actions: string[];
  content_suggestion: string;
};

type TeacherAlert = {
  id: string;
  student_id?: string;
  student_name: string;
  student_grade?: string;
  subject: string;
  topic: string;
  accuracy: number;
  attempts: number;
  status: 'active' | 'resolved';
};

// O modo local continua útil para apresentar o TCC, mas não cria permissões reais.
const demoTeacherStudents: TeacherStudent[] = [
  {
    id: 'demo-ana',
    full_name: 'Ana Souza',
    grade: '8º ano',
    subject: 'Matemática',
    accuracy: 42,
    attempts: 12,
    difficulty: 'Alta',
    time_minutes: 155,
    completed_lessons: 5,
    trend: [
      { week: 'S34', accuracy: 38, difficulty_score: 62, attempts: 4, level: 'Alta' },
      { week: 'S35', accuracy: 46, difficulty_score: 54, attempts: 5, level: 'Alta' },
      { week: 'S36', accuracy: 58, difficulty_score: 42, attempts: 3, level: 'Alta' },
    ],
    difficulties: [{ topic: 'Frações', accuracy: 40, attempts: 5 }],
    recent_attempts: [
      { answered_at: '2026-09-08', topic: 'Frações equivalentes', correct: true },
      { answered_at: '2026-09-07', topic: 'Porcentagem', correct: false },
    ],
  },
  {
    id: 'demo-bruno',
    full_name: 'Bruno Lima',
    grade: '8º ano',
    subject: 'Matemática',
    accuracy: 78,
    attempts: 18,
    difficulty: 'Média',
    time_minutes: 194,
    completed_lessons: 7,
    trend: [
      { week: 'S34', accuracy: 62, difficulty_score: 38, attempts: 6, level: 'Média' },
      { week: 'S35', accuracy: 72, difficulty_score: 28, attempts: 6, level: 'Média' },
      { week: 'S36', accuracy: 83, difficulty_score: 17, attempts: 6, level: 'Baixa' },
    ],
    difficulties: [{ topic: 'Equações', accuracy: 68, attempts: 6 }],
    recent_attempts: [
      { answered_at: '2026-09-08', topic: 'Equações', correct: true },
      { answered_at: '2026-09-06', topic: 'Frações', correct: true },
    ],
  },
];

const demoTeacherClasses: TeacherClass[] = [
  {
    id: 'demo-class-a',
    name: '8º ano A',
    school_year: '2026',
    subject: 'Matemática',
    student_count: 2,
    students: demoTeacherStudents,
    trend: [
      { week: 'S34', accuracy: 50, difficulty_score: 50, attempts: 10, level: 'Alta' },
      { week: 'S35', accuracy: 59, difficulty_score: 41, attempts: 11, level: 'Alta' },
      { week: 'S36', accuracy: 71, difficulty_score: 29, attempts: 9, level: 'Média' },
    ],
  },
  {
    id: 'demo-class-b',
    name: '9º ano B',
    school_year: '2026',
    subject: 'Matemática',
    student_count: 0,
    students: [],
    trend: [],
  },
];

const emptyTeacherClass: TeacherClass = {
  id: '',
  name: 'Nenhuma turma selecionada',
  school_year: '',
  subject: '',
  student_count: 0,
  students: [],
  trend: [],
};

const demoTeacherContents: TeacherContent[] = [
  {
    id: 'demo-content-1',
    title: 'Frações com apoio visual',
    description: 'Sequência curta para retomar equivalência e comparação.',
    content_type: 'lesson',
    source_url: '',
  },
  {
    id: 'demo-content-2',
    title: 'Lista guiada de porcentagem',
    description: 'Exercícios progressivos com situações do dia a dia.',
    content_type: 'exercise',
    source_url: '',
  },
];

const demoTeacherAlerts: TeacherAlert[] = [
  {
    id: 'demo-alert',
    student_id: 'demo-ana',
    student_name: 'Ana Souza',
    student_grade: '8º ano',
    subject: 'Matemática',
    topic: 'Frações',
    accuracy: 40,
    attempts: 5,
    status: 'active',
  },
];

/** Reúne as tarefas diárias do professor sem misturar funções administrativas. */
export function TeacherProfile({ onLogout }: { onLogout: () => void }) {
  type TeacherTab =
    'overview' | 'classes' | 'reports' | 'contents' | 'questions' | 'messages' | 'ai' | 'legal';
  const [activeTab, setActiveTab] = useState<TeacherTab>('overview');
  const [overview, setOverview] = useState<TeacherOverview>(
    supabase
      ? {
          subject: 'Sua disciplina',
          class_count: 0,
          student_count: 0,
          active_alerts: 0,
          average_accuracy: 0,
        }
      : {
          subject: 'Matemática',
          class_count: 2,
          student_count: 2,
          active_alerts: 1,
          average_accuracy: 60,
        },
  );
  const [classes, setClasses] = useState<TeacherClass[]>(supabase ? [] : demoTeacherClasses);
  const [selectedClassId, setSelectedClassId] = useState(supabase ? '' : demoTeacherClasses[0].id);
  const [selectedClass, setSelectedClass] = useState<TeacherClass>(
    supabase ? emptyTeacherClass : demoTeacherClasses[0],
  );
  const [selectedStudentId, setSelectedStudentId] = useState(
    supabase ? '' : demoTeacherStudents[0].id,
  );
  const [alerts, setAlerts] = useState<TeacherAlert[]>(supabase ? [] : demoTeacherAlerts);
  const [contents, setContents] = useState<TeacherContent[]>(supabase ? [] : demoTeacherContents);
  const [recommendation, setRecommendation] = useState<TeacherRecommendation | null>(null);
  const [message, setMessage] = useState('Painel pronto para acompanhar sua disciplina.');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadDashboard() {
      if (!supabase) return;
      setBusy(true);
      try {
        const [overviewResponse, classesResponse, alertsResponse, contentsResponse] =
          await Promise.all([
            apiFetch('/teacher/overview'),
            apiFetch('/teacher/classes'),
            apiFetch('/teacher/difficulty-alerts'),
            apiFetch('/teacher/contents'),
          ]);
        if (
          ![overviewResponse, classesResponse, alertsResponse, contentsResponse].every(
            (item) => item.ok,
          )
        ) {
          throw new Error('dashboard-data');
        }
        const nextClasses = (await classesResponse.json()) as TeacherClass[];
        if (!active) return;
        setOverview((await overviewResponse.json()) as TeacherOverview);
        setClasses(nextClasses);
        setAlerts((await alertsResponse.json()) as TeacherAlert[]);
        setContents((await contentsResponse.json()) as TeacherContent[]);
        setSelectedClassId(nextClasses[0]?.id ?? '');
        if (!nextClasses.length) {
          setSelectedClass(emptyTeacherClass);
          setSelectedStudentId('');
        }
        setMessage('Dados atualizados com segurança.');
      } catch {
        if (active) setMessage('Não foi possível atualizar o painel. Tente novamente.');
      } finally {
        if (active) setBusy(false);
      }
    }
    void loadDashboard();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    async function loadClass() {
      if (!selectedClassId) return;
      if (!supabase) {
        const demoClass = demoTeacherClasses.find((item) => item.id === selectedClassId);
        if (demoClass) {
          setSelectedClass(demoClass);
          setSelectedStudentId(
            [...(demoClass.students ?? [])].sort(
              (first, second) => first.accuracy - second.accuracy,
            )[0]?.id ?? '',
          );
        }
        return;
      }
      try {
        const response = await apiFetch(`/teacher/classes/${selectedClassId}`);
        if (!response.ok) throw new Error('class-data');
        const nextClass = (await response.json()) as TeacherClass;
        if (!active) return;
        setSelectedClass(nextClass);
        setSelectedStudentId(
          [...(nextClass.students ?? [])].sort(
            (first, second) => first.accuracy - second.accuracy,
          )[0]?.id ?? '',
        );
      } catch {
        if (active) setMessage('Não foi possível abrir esta turma.');
      }
    }
    void loadClass();
    return () => {
      active = false;
    };
  }, [selectedClassId]);

  const sortedStudents = [...(selectedClass.students ?? [])].sort(
    (first, second) => first.accuracy - second.accuracy,
  );
  const selectedStudent = sortedStudents.find((student) => student.id === selectedStudentId);
  const tabs: { id: TeacherTab; label: string }[] = [
    { id: 'overview', label: 'Visão geral' },
    { id: 'classes', label: 'Turmas' },
    { id: 'reports', label: 'Relatórios' },
    { id: 'contents', label: 'Conteúdos' },
    { id: 'questions', label: 'Questões' },
    { id: 'messages', label: 'Mensagens' },
    { id: 'ai', label: 'Recomendação IA' },
    { id: 'legal', label: 'Termos e privacidade' },
  ];
  const teacherGlyphs: Record<TeacherTab, string> = {
    overview: 'VG',
    classes: 'TU',
    reports: 'RL',
    contents: 'CO',
    questions: 'QT',
    messages: 'MS',
    ai: 'IA',
    legal: 'TP',
  };

  async function createClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const draft = {
      name: String(data.get('name')),
      school_year: String(data.get('school_year')),
    };
    setBusy(true);
    try {
      let created: TeacherClass;
      if (supabase) {
        const response = await apiFetch('/teacher/classes', {
          method: 'POST',
          body: JSON.stringify(draft),
        });
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail);
        created = (await response.json()) as TeacherClass;
      } else {
        created = {
          id: `demo-${Date.now()}`,
          subject: overview.subject,
          student_count: 0,
          students: [],
          trend: [],
          ...draft,
        };
      }
      setClasses((current) => [...current, created]);
      setSelectedClass(created);
      setSelectedClassId(created.id);
      setActiveTab('classes');
      setMessage('Turma criada com sucesso.');
      form.reset();
    } catch (error) {
      setMessage(
        error instanceof Error && error.message ? error.message : 'Não foi possível criar a turma.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function addStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = String(new FormData(form).get('student_email'));
    if (!selectedClassId) return;
    setBusy(true);
    try {
      if (supabase) {
        const response = await apiFetch(`/teacher/classes/${selectedClassId}/students`, {
          method: 'POST',
          body: JSON.stringify({ student_email: email }),
        });
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail);
        const refreshed = await apiFetch(`/teacher/classes/${selectedClassId}`);
        setSelectedClass((await refreshed.json()) as TeacherClass);
      } else {
        setMessage('No modo de demonstração, use os alunos que já aparecem na turma.');
        return;
      }
      setMessage('Estudante incluído na turma. Os dados pessoais não foram alterados.');
      form.reset();
    } catch (error) {
      setMessage(
        error instanceof Error && error.message
          ? error.message
          : 'Não foi possível incluir o estudante.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeStudent(studentId: string) {
    if (!supabase || !selectedClassId) {
      setMessage('A remoção fica disponível quando o projeto estiver conectado ao Supabase.');
      return;
    }
    setBusy(true);
    try {
      const response = await apiFetch(`/teacher/classes/${selectedClassId}/students/${studentId}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Não foi possível remover o vínculo.');
      setSelectedClass((current) => ({
        ...current,
        student_count: Math.max(0, current.student_count - 1),
        students: current.students?.filter((student) => student.id !== studentId),
      }));
      setMessage('Estudante removido da turma. O histórico foi preservado.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível remover o estudante.');
    } finally {
      setBusy(false);
    }
  }

  async function exportReport() {
    if (!selectedClassId) return;
    if (!supabase) {
      setMessage(
        'Relatório de demonstração preparado. Conecte o Supabase para baixar dados reais.',
      );
      return;
    }
    const studentFilter = selectedStudentId
      ? `&student_id=${encodeURIComponent(selectedStudentId)}`
      : '';
    const response = await apiFetch(
      `/teacher/reports/export?class_id=${encodeURIComponent(selectedClassId)}${studentFilter}`,
    );
    if (!response.ok) {
      setMessage('Não foi possível exportar o relatório.');
      return;
    }
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `relatorio-${selectedStudent?.full_name ?? selectedClass.name}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage('Relatório exportado em CSV.');
  }

  async function createContent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const draft = {
      title: String(data.get('title')),
      description: String(data.get('description')),
      content_type: String(data.get('content_type')) as TeacherContent['content_type'],
      source_url: String(data.get('source_url')),
    };
    setBusy(true);
    try {
      let created: TeacherContent;
      if (supabase) {
        const response = await apiFetch('/teacher/contents', {
          method: 'POST',
          body: JSON.stringify(draft),
        });
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail);
        created = (await response.json()) as TeacherContent;
      } else {
        created = { id: `demo-content-${Date.now()}`, ...draft };
      }
      setContents((current) => [created, ...current]);
      setMessage('Conteúdo salvo na sua disciplina.');
      form.reset();
    } catch (error) {
      setMessage(
        error instanceof Error && error.message
          ? error.message
          : 'Não foi possível salvar o conteúdo.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function importContents(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = new FormData(form).get('content_file') as File | null;
    if (!file || !/\.(csv|json)$/i.test(file.name) || file.size > 100_000) {
      setMessage('Escolha um arquivo CSV ou JSON de até 100 KB.');
      return;
    }
    if (!supabase) {
      setMessage('Arquivo validado. A importação real precisa do Supabase conectado.');
      return;
    }
    setBusy(true);
    try {
      const response = await apiFetch('/teacher/contents/import', {
        method: 'POST',
        body: JSON.stringify({
          format: file.name.toLowerCase().endsWith('.json') ? 'json' : 'csv',
          content: await file.text(),
        }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail);
      const result = await response.json();
      setContents((current) => [...result.contents, ...current]);
      setMessage(`${result.imported} conteúdo(s) importado(s).`);
      form.reset();
    } catch (error) {
      setMessage(
        error instanceof Error && error.message
          ? error.message
          : 'Não foi possível importar o arquivo.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function requestRecommendation() {
    if (!selectedClassId) return;
    setBusy(true);
    setRecommendation(null);
    try {
      if (supabase) {
        const response = await apiFetch('/teacher/recommendations', {
          method: 'POST',
          body: JSON.stringify({
            class_id: selectedClassId,
            student_id: selectedStudentId || undefined,
          }),
        });
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail);
        setRecommendation((await response.json()) as TeacherRecommendation);
      } else {
        setRecommendation({
          diagnosis: 'A turma está avançando, mas frações ainda concentram erros recorrentes.',
          objective: 'Consolidar equivalência de frações antes de avançar para porcentagem.',
          actions: [
            'Retomar o conceito com representações visuais.',
            'Formar duplas para comparar estratégias de resolução.',
            'Aplicar uma verificação curta no fim da aula.',
          ],
          content_suggestion:
            'Use a sequência Frações com apoio visual e finalize com cinco questões progressivas.',
        });
      }
      setMessage('Recomendação pedagógica gerada para o contexto selecionado.');
    } catch (error) {
      setMessage(
        error instanceof Error && error.message
          ? error.message
          : 'Não foi possível gerar a recomendação.',
      );
    } finally {
      setBusy(false);
    }
  }

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
              {selectedClassId && supabase && (
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
