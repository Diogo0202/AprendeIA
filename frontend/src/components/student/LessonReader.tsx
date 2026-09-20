import { useEffect, useState } from "react";
import { apiError, apiFetch } from "../../lib/api";
import type { LessonDetail } from "../../types/learning";

export function LessonReader({ lessonId, onClose, onUpdated }: { lessonId: string; onClose: () => void; onUpdated: () => void }) {
  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch(`/student/lessons/${lessonId}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(await apiError(response, "Não foi possível abrir a aula."));
        return (await response.json()) as LessonDetail;
      })
      .then((data) => active && setLesson(data))
      .catch((error) => active && setMessage(error instanceof Error ? error.message : "Não foi possível abrir a aula."));
    return () => { active = false; };
  }, [lessonId]);

  async function completeLesson() {
    if (!lesson) return;
    setBusy(true);
    const response = await apiFetch(`/student/lessons/${lesson.id}/progress`, {
      method: "PUT",
      body: JSON.stringify({ completed: true, time_seconds: lesson.progress.time_seconds || lesson.estimated_minutes * 60 }),
    });
    if (!response.ok) {
      setMessage(await apiError(response, "Não foi possível concluir a aula."));
      setBusy(false);
      return;
    }
    onUpdated();
    onClose();
  }

  return (
    <section className="lesson-reader" role="dialog" aria-modal="true" aria-labelledby="lesson-title">
      <div className="lesson-reader-panel">
        <button type="button" className="back-button" onClick={onClose}>Fechar aula</button>
        {message && <p className="form-message" role="alert">{message}</p>}
        {!lesson ? <p>Carregando aula...</p> : (
          <>
            <p className="eyebrow">{lesson.modules.subjects.name} - {lesson.modules.title}</p>
            <h1 id="lesson-title">{lesson.title}</h1>
            <p className="subtitle">{lesson.summary}</p>
            {lesson.learning_objectives.length > 0 && (
              <section className="lesson-objectives">
                <h2>Ao final, você será capaz de</h2>
                <ul>{lesson.learning_objectives.map((objective) => <li key={objective}>{objective}</li>)}</ul>
              </section>
            )}
            <div className="lesson-content">{lesson.content || "O conteúdo desta aula está sendo preparado."}</div>
            <button type="button" className="primary-button" disabled={busy || lesson.progress.completed} onClick={() => void completeLesson()}>
              {lesson.progress.completed ? "Aula concluída" : busy ? "Salvando..." : "Concluir aula"}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
