import { FormEvent, useEffect, useState } from "react";
import { apiError, apiFetch } from "../../lib/api";

type TeacherQuestion = {
  id: string;
  subject: string;
  topic: string;
  difficulty: "basic" | "intermediate" | "advanced";
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
  status: "draft" | "published" | "archived";
  review_notes: string;
  source: string;
};

const emptyQuestion: TeacherQuestion = {
  id: "",
  subject: "",
  topic: "",
  difficulty: "basic",
  question: "",
  options: ["", "", "", ""],
  correct_index: 0,
  explanation: "",
  status: "draft",
  review_notes: "",
  source: "openai",
};

/** Separa geração automática da decisão editorial do professor. */
export function QuestionStudio({ subject }: { subject: string }) {
  const [questions, setQuestions] = useState<TeacherQuestion[]>([]);
  const [selected, setSelected] = useState<TeacherQuestion>(emptyQuestion);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    apiFetch("/teacher/questions")
      .then(async (response) => {
        if (!response.ok) throw new Error(await apiError(response, "Não foi possível carregar as questões."));
        return (await response.json()) as TeacherQuestion[];
      })
      .then((rows) => {
        if (!active) return;
        setQuestions(rows);
        setSelected(rows[0] ?? emptyQuestion);
      })
      .catch((error) => active && setMessage(error instanceof Error ? error.message : "Não foi possível carregar as questões."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    const response = await apiFetch("/question-bank/generate", {
      method: "POST",
      body: JSON.stringify({
        subject,
        topic: String(data.get("topic")),
        difficulty: String(data.get("difficulty")),
      }),
    });
    if (!response.ok) {
      setMessage(await apiError(response, "Não foi possível gerar a questão."));
      setBusy(false);
      return;
    }
    const created = (await response.json()) as TeacherQuestion;
    setQuestions((items) => [created, ...items]);
    setSelected(created);
    setMessage("Rascunho criado. Revise antes de publicar.");
    setBusy(false);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected.id) return;
    setBusy(true);
    setMessage("");
    const response = await apiFetch(`/teacher/questions/${selected.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        topic: selected.topic,
        difficulty: selected.difficulty,
        question: selected.question,
        options: selected.options,
        correct_index: selected.correct_index,
        explanation: selected.explanation,
        review_notes: selected.review_notes,
        status: selected.status,
      }),
    });
    if (!response.ok) {
      setMessage(await apiError(response, "Não foi possível salvar a revisão."));
      setBusy(false);
      return;
    }
    const updated = (await response.json()) as TeacherQuestion;
    setQuestions((items) => items.map((item) => item.id === updated.id ? updated : item));
    setSelected(updated);
    setMessage(updated.status === "published" ? "Questão revisada e publicada." : "Revisão salva.");
    setBusy(false);
  }

  function updateOption(index: number, value: string) {
    setSelected((question) => ({
      ...question,
      options: question.options.map((option, optionIndex) => optionIndex === index ? value : option),
    }));
  }

  return (
    <section className="question-studio" aria-labelledby="question-studio-title">
      <header className="teacher-heading">
        <div><p className="eyebrow">QUESTÕES</p><h1 id="question-studio-title">Gerar e revisar</h1></div>
        <span className="teacher-status">{subject}</span>
      </header>
      <div className="question-studio-grid">
        <aside className="teacher-surface question-queue">
          <h2>Fila editorial</h2>
          {loading ? <p>Carregando...</p> : questions.length === 0 ? <p className="teacher-empty">Nenhuma questão criada.</p> : (
            <div className="question-queue-list">
              {questions.map((question) => (
                <button type="button" className={selected.id === question.id ? "selected" : ""} onClick={() => setSelected(question)} key={question.id}>
                  <strong>{question.topic}</strong>
                  <span>{question.status === "published" ? "Publicada" : question.status === "archived" ? "Arquivada" : "Rascunho"}</span>
                  <small>{question.question}</small>
                </button>
              ))}
            </div>
          )}
          <form className="teacher-form question-generator" onSubmit={generate}>
            <h3>Gerar novo rascunho</h3>
            <label>TÓPICO<input name="topic" required maxLength={100} /></label>
            <label>DIFICULDADE<select name="difficulty"><option value="basic">Básica</option><option value="intermediate">Intermediária</option><option value="advanced">Avançada</option></select></label>
            <button className="outline-button" disabled={busy}>Gerar com IA</button>
          </form>
        </aside>
        <section className="teacher-surface question-editor">
          {!selected.id ? <p className="teacher-empty">Gere ou selecione uma questão para revisar.</p> : (
            <form className="teacher-form" onSubmit={save}>
              <div className="teacher-form-row">
                <label>TÓPICO<input value={selected.topic} onChange={(event) => setSelected({ ...selected, topic: event.target.value })} /></label>
                <label>DIFICULDADE<select value={selected.difficulty} onChange={(event) => setSelected({ ...selected, difficulty: event.target.value as TeacherQuestion["difficulty"] })}><option value="basic">Básica</option><option value="intermediate">Intermediária</option><option value="advanced">Avançada</option></select></label>
              </div>
              <label>ENUNCIADO<textarea value={selected.question} onChange={(event) => setSelected({ ...selected, question: event.target.value })} rows={4} /></label>
              <fieldset className="question-options-editor"><legend>ALTERNATIVAS E GABARITO</legend>{selected.options.map((option, index) => <label key={index}><input type="radio" name="correct" checked={selected.correct_index === index} onChange={() => setSelected({ ...selected, correct_index: index })} aria-label={`Alternativa ${index + 1} correta`} /><input value={option} onChange={(event) => updateOption(index, event.target.value)} /></label>)}</fieldset>
              <label>EXPLICAÇÃO<textarea value={selected.explanation} onChange={(event) => setSelected({ ...selected, explanation: event.target.value })} rows={4} /></label>
              <label>NOTAS DE REVISÃO<textarea value={selected.review_notes} onChange={(event) => setSelected({ ...selected, review_notes: event.target.value })} rows={2} /></label>
              <label>STATUS<select value={selected.status} onChange={(event) => setSelected({ ...selected, status: event.target.value as TeacherQuestion["status"] })}><option value="draft">Rascunho</option><option value="published">Publicada</option><option value="archived">Arquivada</option></select></label>
              {message && <p className="form-message" role="status">{message}</p>}
              <button className="primary-button" disabled={busy}>{busy ? "Salvando..." : "Salvar revisão"}</button>
            </form>
          )}
        </section>
      </div>
    </section>
  );
}
