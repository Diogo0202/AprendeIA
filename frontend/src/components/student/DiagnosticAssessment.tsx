import { useMemo, useState } from "react";
import { apiError, apiFetch } from "../../lib/api";
import type { DiagnosticState, LearningRecommendations, PublicQuestion } from "../../types/learning";

type Props = {
  diagnostic: DiagnosticState;
  onComplete: (result: LearningRecommendations) => void;
};

/** Mede conhecimentos antes de mostrar recomendações personalizadas. */
export function DiagnosticAssessment({ diagnostic, onComplete }: Props) {
  const questions = diagnostic.questions ?? [];
  const answeredInitially = diagnostic.answered_question_ids ?? [];
  const [answered, setAnswered] = useState<string[]>(answeredInitially);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [currentIndex, setCurrentIndex] = useState(
    Math.min(answeredInitially.length, Math.max(0, questions.length - 1)),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const current = questions[currentIndex];
  const finished = questions.length > 0 && answered.length >= questions.length;
  const progress = useMemo(
    () => (questions.length ? Math.round((answered.length / questions.length) * 100) : 0),
    [answered.length, questions.length],
  );

  async function saveAnswer(question: PublicQuestion) {
    const answer = selected[question.id];
    if (answer === undefined) return;
    setBusy(true);
    setMessage("");
    const response = await apiFetch(`/student/diagnostic/${question.id}/answer`, {
      method: "POST",
      body: JSON.stringify({ selected_index: answer, response_time_seconds: 0 }),
    });
    if (!response.ok) {
      setMessage(await apiError(response, "Não foi possível salvar esta resposta."));
      setBusy(false);
      return;
    }
    setAnswered((items) => [...items, question.id]);
    setCurrentIndex((index) => Math.min(index + 1, questions.length - 1));
    setBusy(false);
  }

  async function complete() {
    setBusy(true);
    setMessage("");
    const response = await apiFetch("/student/diagnostic/complete", { method: "POST" });
    if (!response.ok) {
      setMessage(await apiError(response, "Não foi possível concluir a avaliação."));
      setBusy(false);
      return;
    }
    const result = (await response.json()) as DiagnosticState;
    onComplete({ mastery: result.mastery ?? [], recommendations: result.recommendations ?? [] });
  }

  if (!current) {
    return <p className="form-message">A avaliação ainda não possui questões publicadas.</p>;
  }

  return (
    <section className="diagnostic-shell" aria-labelledby="diagnostic-title">
      <header>
        <p className="eyebrow">PONTO DE PARTIDA</p>
        <h1 id="diagnostic-title">Vamos descobrir o que você já domina.</h1>
        <p>Responda com calma. O resultado serve para organizar seu estudo, não para dar nota.</p>
        <progress value={answered.length} max={questions.length} aria-label={`${progress}% concluído`} />
        <small>{answered.length} de {questions.length} questões respondidas</small>
      </header>
      <article className="diagnostic-question">
        <span>{current.subject} - {current.topic}</span>
        <h2>{current.question}</h2>
        <div className="options">
          {current.options.map((option, index) => (
            <button
              type="button"
              className={selected[current.id] === index ? "option chosen" : "option"}
              onClick={() => setSelected((values) => ({ ...values, [current.id]: index }))}
              disabled={answered.includes(current.id)}
              key={`${current.id}-${index}`}
            >
              <b>{String.fromCharCode(65 + index)}</b>{option}
            </button>
          ))}
        </div>
        {message && <p className="form-message" role="alert">{message}</p>}
        {finished ? (
          <button className="primary-button" type="button" onClick={() => void complete()} disabled={busy}>
            {busy ? "Montando seu mapa..." : "Ver meu mapa de aprendizagem"}
          </button>
        ) : (
          <button className="primary-button" type="button" onClick={() => void saveAnswer(current)} disabled={busy || selected[current.id] === undefined}>
            {busy ? "Salvando..." : "Confirmar e continuar"}
          </button>
        )}
      </article>
    </section>
  );
}
