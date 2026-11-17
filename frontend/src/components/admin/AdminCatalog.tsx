import { FormEvent, useCallback, useEffect, useState } from 'react';
import { gateways } from '../../application/gateways';
import { failureMessage } from '../../application/result';

export type AdminSubject = {
  id: string;
  name: string;
  description: string;
  category: string;
  modules: {
    id: string;
    title: string;
    position: number;
    lessons: {
      id: string;
      title: string;
      position: number;
      published: boolean;
      required_exercise_count: number;
    }[];
  }[];
};

type Overview = {
  users: number;
  students: number;
  teachers: number;
  subjects: number;
  lessons: number;
  questions: number;
  draft_questions: number;
};

type MandatoryExerciseConfiguration = {
  selected_question_ids: string[];
  questions: { id: string; topic: string; difficulty: string; question: string }[];
};

/** Mantém a administração estrutural separada dos dados pedagógicos dos alunos. */
export function AdminCatalog({
  onSubjectsChange,
}: {
  onSubjectsChange: (subjects: AdminSubject[]) => void;
}) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [subjects, setSubjects] = useState<AdminSubject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [selectedModuleId, setSelectedModuleId] = useState('');
  const [selectedLessonId, setSelectedLessonId] = useState('');
  const [mandatoryExercises, setMandatoryExercises] =
    useState<MandatoryExerciseConfiguration | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { admin } = gateways();
    const [loadedOverview, loadedSubjects] = await Promise.all([
      admin.overview<Overview>(),
      admin.subjects<AdminSubject[]>(),
    ]);
    if (!loadedOverview.ok || !loadedSubjects.ok) {
      setMessage('Não foi possível carregar a visão administrativa.');
      return;
    }
    const nextOverview = loadedOverview.data;
    const nextSubjects = loadedSubjects.data;
    setOverview(nextOverview);
    setSubjects(nextSubjects);
    onSubjectsChange(nextSubjects);
    setSelectedSubjectId((current) => current || nextSubjects[0]?.id || '');
    setSelectedModuleId((current) => current || nextSubjects[0]?.modules[0]?.id || '');
    setSelectedLessonId((current) => current || nextSubjects[0]?.modules[0]?.lessons[0]?.id || '');
  }, [onSubjectsChange]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedLessonId) {
      setMandatoryExercises(null);
      return;
    }
    gateways()
      .admin.mandatoryExercises<MandatoryExerciseConfiguration>(selectedLessonId)
      .then((result) => setMandatoryExercises(result.ok ? result.data : null))
      .catch(() => setMandatoryExercises(null));
  }, [selectedLessonId]);

  async function createSubject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    const created = await gateways().admin.createSubject({
      name: data.get('name'),
      description: data.get('description'),
      category: data.get('category'),
    });
    setMessage(
      created.ok
        ? 'Disciplina criada.'
        : failureMessage(created, 'Não foi possível criar a disciplina.'),
    );
    if (created.ok) {
      form.reset();
      await load();
    }
    setBusy(false);
  }

  async function createModule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSubjectId) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    const created = await gateways().admin.createModule(selectedSubjectId, {
      title: data.get('title'),
      position: Number(data.get('position')),
    });
    setMessage(
      created.ok ? 'Módulo criado.' : failureMessage(created, 'Não foi possível criar o módulo.'),
    );
    if (created.ok) {
      form.reset();
      await load();
    }
    setBusy(false);
  }

  async function createLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedModuleId) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const objectives = String(data.get('objectives') || '')
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);
    setBusy(true);
    const created = await gateways().admin.createLesson(selectedModuleId, {
      title: data.get('title'),
      position: Number(data.get('position')),
      estimated_minutes: Number(data.get('estimated_minutes')),
      summary: data.get('summary'),
      content: data.get('content'),
      learning_objectives: objectives,
      published: data.get('published') === 'on',
    });
    setMessage(
      created.ok
        ? 'Aula criada e ligada ao módulo.'
        : failureMessage(created, 'Não foi possível criar a aula.'),
    );
    if (created.ok) {
      form.reset();
      await load();
    }
    setBusy(false);
  }

  async function saveMandatoryExercises(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedLessonId || !mandatoryExercises) return;
    setBusy(true);
    const saved = await gateways().admin.saveMandatoryExercises<MandatoryExerciseConfiguration>(
      selectedLessonId,
      mandatoryExercises.selected_question_ids,
    );
    if (saved.ok) {
      setMandatoryExercises(saved.data);
      setMessage('Exercícios obrigatórios atualizados.');
      await load();
    } else {
      setMessage(failureMessage(saved, 'Não foi possível salvar os exercícios obrigatórios.'));
    }
    setBusy(false);
  }

  const selectedSubject = subjects.find((subject) => subject.id === selectedSubjectId);
  const lessons = subjects.flatMap((subject) =>
    subject.modules.flatMap((module) =>
      module.lessons.map((lesson) => ({
        ...lesson,
        label: `${subject.name} · ${module.title} · ${lesson.title}`,
      })),
    ),
  );

  return (
    <section className="admin-catalog" aria-labelledby="admin-overview-title">
      <div className="admin-metrics" aria-label="Visão geral do sistema">
        {overview ? (
          <>
            <div>
              <span>Usuários</span>
              <strong>{overview.users}</strong>
              <small>
                {overview.students} estudantes, {overview.teachers} professores
              </small>
            </div>
            <div>
              <span>Disciplinas</span>
              <strong>{overview.subjects}</strong>
              <small>{overview.lessons} aulas cadastradas</small>
            </div>
            <div>
              <span>Questões</span>
              <strong>{overview.questions}</strong>
              <small>{overview.draft_questions} aguardando revisão</small>
            </div>
          </>
        ) : (
          <p>Carregando visão geral...</p>
        )}
      </div>
      <div className="admin-catalog-grid">
        <section className="profile-panel">
          <h2 id="admin-overview-title">Disciplinas e aulas</h2>
          {subjects.length === 0 ? (
            <p>Nenhuma disciplina cadastrada.</p>
          ) : (
            <div className="admin-subject-tree">
              {subjects.map((subject) => (
                <article key={subject.id}>
                  <strong>{subject.name}</strong>
                  <span>{subject.category}</span>
                  {subject.modules.map((module) => (
                    <div key={module.id}>
                      <b>{module.title}</b>
                      <small>{module.lessons.length} aula(s)</small>
                    </div>
                  ))}
                </article>
              ))}
            </div>
          )}
        </section>
        <section className="profile-panel admin-content-forms">
          <details>
            <summary>Nova disciplina</summary>
            <form className="teacher-form" onSubmit={createSubject}>
              <label>
                NOME
                <input name="name" required />
              </label>
              <label>
                CATEGORIA
                <input name="category" defaultValue="Outras" required />
              </label>
              <label>
                DESCRIÇÃO
                <textarea name="description" rows={3} />
              </label>
              <button className="outline-button" disabled={busy}>
                Criar disciplina
              </button>
            </form>
          </details>
          <details>
            <summary>Novo módulo</summary>
            <form className="teacher-form" onSubmit={createModule}>
              <label>
                DISCIPLINA
                <select
                  value={selectedSubjectId}
                  onChange={(event) => {
                    setSelectedSubjectId(event.target.value);
                    const subject = subjects.find((item) => item.id === event.target.value);
                    setSelectedModuleId(subject?.modules[0]?.id || '');
                  }}
                >
                  {subjects.map((subject) => (
                    <option value={subject.id} key={subject.id}>
                      {subject.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                TÍTULO
                <input name="title" required />
              </label>
              <label>
                POSIÇÃO
                <input
                  name="position"
                  type="number"
                  min="1"
                  defaultValue={(selectedSubject?.modules.length ?? 0) + 1}
                  required
                />
              </label>
              <button className="outline-button" disabled={busy || !selectedSubjectId}>
                Criar módulo
              </button>
            </form>
          </details>
          <details>
            <summary>Nova aula</summary>
            <form className="teacher-form" onSubmit={createLesson}>
              <label>
                MÓDULO
                <select
                  value={selectedModuleId}
                  onChange={(event) => setSelectedModuleId(event.target.value)}
                >
                  {selectedSubject?.modules.map((module) => (
                    <option value={module.id} key={module.id}>
                      {module.title}
                    </option>
                  ))}
                </select>
              </label>
              <div className="teacher-form-row">
                <label>
                  TÍTULO
                  <input name="title" required />
                </label>
                <label>
                  POSIÇÃO
                  <input name="position" type="number" min="1" defaultValue="1" required />
                </label>
              </div>
              <label>
                RESUMO
                <textarea name="summary" rows={2} />
              </label>
              <label>
                CONTEÚDO
                <textarea name="content" rows={6} />
              </label>
              <label>
                OBJETIVOS, UM POR LINHA
                <textarea name="objectives" rows={3} />
              </label>
              <label>
                MINUTOS
                <input name="estimated_minutes" type="number" min="1" defaultValue="15" />
              </label>
              <label className="check">
                <input name="published" type="checkbox" defaultChecked />
                <span>Publicar ao salvar</span>
              </label>
              <button className="primary-button" disabled={busy || !selectedModuleId}>
                Criar aula
              </button>
            </form>
          </details>
          <details>
            <summary>Exercícios obrigatórios</summary>
            <form className="teacher-form" onSubmit={saveMandatoryExercises}>
              <label>
                AULA
                <select
                  value={selectedLessonId}
                  onChange={(event) => setSelectedLessonId(event.target.value)}
                >
                  {lessons.map((lesson) => (
                    <option value={lesson.id} key={lesson.id}>
                      {lesson.label}
                    </option>
                  ))}
                </select>
              </label>
              {mandatoryExercises?.questions.length ? (
                <fieldset className="mandatory-exercise-picker">
                  <legend>Questões publicadas</legend>
                  {mandatoryExercises.questions.map((question) => (
                    <label className="check" key={question.id}>
                      <input
                        type="checkbox"
                        checked={mandatoryExercises.selected_question_ids.includes(question.id)}
                        onChange={(event) =>
                          setMandatoryExercises((current) =>
                            current
                              ? {
                                  ...current,
                                  selected_question_ids: event.target.checked
                                    ? [...current.selected_question_ids, question.id]
                                    : current.selected_question_ids.filter(
                                        (id) => id !== question.id,
                                      ),
                                }
                              : current,
                          )
                        }
                      />
                      <span>
                        <strong>{question.topic}</strong> - {question.question}
                      </span>
                    </label>
                  ))}
                </fieldset>
              ) : (
                <p>Nenhuma questão publicada nesta disciplina.</p>
              )}
              <button
                className="primary-button"
                disabled={busy || !selectedLessonId || !mandatoryExercises}
              >
                Salvar exercícios obrigatórios
              </button>
            </form>
          </details>
          {message && (
            <p className="form-message" role="status">
              {message}
            </p>
          )}
        </section>
      </div>
    </section>
  );
}
