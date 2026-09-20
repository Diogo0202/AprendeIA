import { FormEvent, useCallback, useEffect, useState } from "react";
import { apiError, apiFetch } from "../../lib/api";

export type AdminSubject = {
  id: string;
  name: string;
  description: string;
  category: string;
  modules: {
    id: string;
    title: string;
    position: number;
    lessons: { id: string; title: string; position: number; published: boolean }[];
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

/** Mantém a administração estrutural separada dos dados pedagógicos dos alunos. */
export function AdminCatalog({ onSubjectsChange }: { onSubjectsChange: (subjects: AdminSubject[]) => void }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [subjects, setSubjects] = useState<AdminSubject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [selectedModuleId, setSelectedModuleId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [overviewResponse, subjectsResponse] = await Promise.all([
      apiFetch("/admin/overview"),
      apiFetch("/admin/subjects"),
    ]);
    if (!overviewResponse.ok || !subjectsResponse.ok) {
      setMessage("Não foi possível carregar a visão administrativa.");
      return;
    }
    const nextOverview = (await overviewResponse.json()) as Overview;
    const nextSubjects = (await subjectsResponse.json()) as AdminSubject[];
    setOverview(nextOverview);
    setSubjects(nextSubjects);
    onSubjectsChange(nextSubjects);
    setSelectedSubjectId((current) => current || nextSubjects[0]?.id || "");
    setSelectedModuleId((current) => current || nextSubjects[0]?.modules[0]?.id || "");
  }, [onSubjectsChange]);

  useEffect(() => { void load(); }, [load]);

  async function createSubject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    const response = await apiFetch("/admin/subjects", {
      method: "POST",
      body: JSON.stringify({ name: data.get("name"), description: data.get("description"), category: data.get("category") }),
    });
    setMessage(response.ok ? "Disciplina criada." : await apiError(response, "Não foi possível criar a disciplina."));
    if (response.ok) { form.reset(); await load(); }
    setBusy(false);
  }

  async function createModule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSubjectId) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    const response = await apiFetch(`/admin/subjects/${selectedSubjectId}/modules`, {
      method: "POST",
      body: JSON.stringify({ title: data.get("title"), position: Number(data.get("position")) }),
    });
    setMessage(response.ok ? "Módulo criado." : await apiError(response, "Não foi possível criar o módulo."));
    if (response.ok) { form.reset(); await load(); }
    setBusy(false);
  }

  async function createLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedModuleId) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const objectives = String(data.get("objectives") || "").split("\n").map((item) => item.trim()).filter(Boolean);
    setBusy(true);
    const response = await apiFetch(`/admin/modules/${selectedModuleId}/lessons`, {
      method: "POST",
      body: JSON.stringify({
        title: data.get("title"),
        position: Number(data.get("position")),
        estimated_minutes: Number(data.get("estimated_minutes")),
        summary: data.get("summary"),
        content: data.get("content"),
        learning_objectives: objectives,
        published: data.get("published") === "on",
      }),
    });
    setMessage(response.ok ? "Aula criada e ligada ao módulo." : await apiError(response, "Não foi possível criar a aula."));
    if (response.ok) { form.reset(); await load(); }
    setBusy(false);
  }

  const selectedSubject = subjects.find((subject) => subject.id === selectedSubjectId);

  return (
    <section className="admin-catalog" aria-labelledby="admin-overview-title">
      <div className="admin-metrics" aria-label="Visão geral do sistema">
        {overview ? <>
          <div><span>Usuários</span><strong>{overview.users}</strong><small>{overview.students} estudantes, {overview.teachers} professores</small></div>
          <div><span>Disciplinas</span><strong>{overview.subjects}</strong><small>{overview.lessons} aulas cadastradas</small></div>
          <div><span>Questões</span><strong>{overview.questions}</strong><small>{overview.draft_questions} aguardando revisão</small></div>
        </> : <p>Carregando visão geral...</p>}
      </div>
      <div className="admin-catalog-grid">
        <section className="profile-panel">
          <h2 id="admin-overview-title">Disciplinas e aulas</h2>
          {subjects.length === 0 ? <p>Nenhuma disciplina cadastrada.</p> : (
            <div className="admin-subject-tree">
              {subjects.map((subject) => <article key={subject.id}><strong>{subject.name}</strong><span>{subject.category}</span>{subject.modules.map((module) => <div key={module.id}><b>{module.title}</b><small>{module.lessons.length} aula(s)</small></div>)}</article>)}
            </div>
          )}
        </section>
        <section className="profile-panel admin-content-forms">
          <details><summary>Nova disciplina</summary><form className="teacher-form" onSubmit={createSubject}><label>NOME<input name="name" required /></label><label>CATEGORIA<input name="category" defaultValue="Outras" required /></label><label>DESCRIÇÃO<textarea name="description" rows={3} /></label><button className="outline-button" disabled={busy}>Criar disciplina</button></form></details>
          <details><summary>Novo módulo</summary><form className="teacher-form" onSubmit={createModule}><label>DISCIPLINA<select value={selectedSubjectId} onChange={(event) => { setSelectedSubjectId(event.target.value); const subject = subjects.find((item) => item.id === event.target.value); setSelectedModuleId(subject?.modules[0]?.id || ""); }}>{subjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.name}</option>)}</select></label><label>TÍTULO<input name="title" required /></label><label>POSIÇÃO<input name="position" type="number" min="1" defaultValue={(selectedSubject?.modules.length ?? 0) + 1} required /></label><button className="outline-button" disabled={busy || !selectedSubjectId}>Criar módulo</button></form></details>
          <details><summary>Nova aula</summary><form className="teacher-form" onSubmit={createLesson}><label>MÓDULO<select value={selectedModuleId} onChange={(event) => setSelectedModuleId(event.target.value)}>{selectedSubject?.modules.map((module) => <option value={module.id} key={module.id}>{module.title}</option>)}</select></label><div className="teacher-form-row"><label>TÍTULO<input name="title" required /></label><label>POSIÇÃO<input name="position" type="number" min="1" defaultValue="1" required /></label></div><label>RESUMO<textarea name="summary" rows={2} /></label><label>CONTEÚDO<textarea name="content" rows={6} /></label><label>OBJETIVOS, UM POR LINHA<textarea name="objectives" rows={3} /></label><label>MINUTOS<input name="estimated_minutes" type="number" min="1" defaultValue="15" /></label><label className="check"><input name="published" type="checkbox" defaultChecked /><span>Publicar ao salvar</span></label><button className="primary-button" disabled={busy || !selectedModuleId}>Criar aula</button></form></details>
          {message && <p className="form-message" role="status">{message}</p>}
        </section>
      </div>
    </section>
  );
}
