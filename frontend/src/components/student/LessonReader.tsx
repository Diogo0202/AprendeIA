import { useEffect, useState } from 'react';
import { gateways } from '../../application/gateways';
import { failureMessage } from '../../application/result';
import { Checklist } from './Checklist';
import type { LessonDetail, RequiredExercise } from '../../domain/learning';

export function LessonReader({
  lessonId,
  onClose,
  onUpdated,
}: {
  lessonId: string;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [lesson, setLesson] = useState<LessonDetail | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [exerciseBusyId, setExerciseBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;
    gateways()
      .student.lesson<LessonDetail>(lessonId)
      .then((result) => {
        if (!result.ok) throw new Error(failureMessage(result, 'Não foi possível abrir a aula.'));
        return result.data;
      })
      .then((data) => active && setLesson(data))
      .catch(
        (error) =>
          active &&
          setMessage(error instanceof Error ? error.message : 'Não foi possível abrir a aula.'),
      );
    return () => {
      active = false;
    };
  }, [lessonId]);

  async function completeLesson() {
    if (!lesson) return;
    setBusy(true);
    const timeSeconds = lesson.progress.time_seconds || lesson.estimated_minutes * 60;
    const result = await gateways().student.completeLesson(lesson.id, timeSeconds);
    if (!result.ok) {
      setMessage(failureMessage(result, 'Não foi possível concluir a aula.'));
      setBusy(false);
      return;
    }
    onUpdated();
    onClose();
  }

  async function answerRequiredExercise(exercise: RequiredExercise) {
    const selectedIndex = selectedAnswers[exercise.id];
    if (selectedIndex === undefined) return;
    setExerciseBusyId(exercise.id);
    const answered = await gateways().student.answerQuestion<{
      correct: boolean;
      explanation: string;
    }>(exercise.id, { selected_index: selectedIndex, response_time_seconds: 0 });
    if (!answered.ok) {
      setMessage(failureMessage(answered, 'Não foi possível registrar sua resposta.'));
      setExerciseBusyId(null);
      return;
    }
    const result = answered.data;
    setFeedback((current) => ({
      ...current,
      [exercise.id]: result.correct
        ? `Resposta correta. ${result.explanation}`
        : `Resposta registrada. ${result.explanation}`,
    }));
    setLesson((current) =>
      current
        ? {
            ...current,
            required_exercises: current.required_exercises.map((item) =>
              item.id === exercise.id ? { ...item, answered: true } : item,
            ),
          }
        : current,
    );
    setExerciseBusyId(null);
  }

  async function confirmRequiredExercise(questionId: string) {
    if (!lesson) return;
    setExerciseBusyId(questionId);
    const result = await gateways().student.confirmExercise(lesson.id, questionId);
    if (!result.ok) {
      setMessage(failureMessage(result, 'Não foi possível confirmar o exercício.'));
      setExerciseBusyId(null);
      return;
    }
    setLesson((current) =>
      current
        ? {
            ...current,
            required_exercises: current.required_exercises.map((item) =>
              item.id === questionId ? { ...item, checked: true } : item,
            ),
          }
        : current,
    );
    setExerciseBusyId(null);
  }

  return (
    <section
      className="lesson-reader"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lesson-title"
    >
      <div className="lesson-reader-panel">
        <button type="button" className="back-button" onClick={onClose}>
          Fechar aula
        </button>
        {message && (
          <p className="form-message" role="alert">
            {message}
          </p>
        )}
        {!lesson ? (
          <p>Carregando aula...</p>
        ) : (
          <>
            <p className="eyebrow">
              {lesson.modules.subjects.name} - {lesson.modules.title}
            </p>
            <h1 id="lesson-title">{lesson.title}</h1>
            <p className="subtitle">{lesson.summary}</p>
            {lesson.learning_objectives.length > 0 && (
              <section className="lesson-objectives">
                <h2>Ao final, você será capaz de</h2>
                <ul>
                  {lesson.learning_objectives.map((objective) => (
                    <li key={objective}>{objective}</li>
                  ))}
                </ul>
              </section>
            )}
            <div className="lesson-content">
              {lesson.content || 'O conteúdo desta aula está sendo preparado.'}
            </div>
            {lesson.required_exercises.length > 0 && (
              <section className="required-exercises" aria-labelledby="required-exercises-title">
                <div>
                  <h2 id="required-exercises-title">Exercícios obrigatórios</h2>
                  <p>Responda cada exercício e confirme o check para liberar a próxima aula.</p>
                </div>
                {lesson.required_exercises.map((exercise) => (
                  <article className="required-exercise" key={exercise.id}>
                    <strong>
                      {exercise.position}. {exercise.question}
                    </strong>
                    <fieldset
                      disabled={
                        exercise.answered || exercise.checked || exerciseBusyId === exercise.id
                      }
                    >
                      <legend className="sr-only">Alternativas</legend>
                      {exercise.options.map((option, index) => (
                        <label key={option} className="required-exercise-option">
                          <input
                            type="radio"
                            name={`exercise-${exercise.id}`}
                            checked={selectedAnswers[exercise.id] === index}
                            onChange={() =>
                              setSelectedAnswers((current) => ({
                                ...current,
                                [exercise.id]: index,
                              }))
                            }
                          />
                          <span>{option}</span>
                        </label>
                      ))}
                    </fieldset>
                    {!exercise.answered && (
                      <button
                        type="button"
                        className="outline-button"
                        disabled={
                          exerciseBusyId === exercise.id ||
                          selectedAnswers[exercise.id] === undefined
                        }
                        onClick={() => void answerRequiredExercise(exercise)}
                      >
                        {exerciseBusyId === exercise.id ? 'Registrando...' : 'Enviar resposta'}
                      </button>
                    )}
                    {feedback[exercise.id] && (
                      <p className="answer-feedback" role="status">
                        {feedback[exercise.id]}
                      </p>
                    )}
                  </article>
                ))}
                <Checklist
                  items={lesson.required_exercises.map((exercise) => ({
                    id: exercise.id,
                    label: `Exercício ${exercise.position}`,
                    answered: exercise.answered,
                    checked: exercise.checked,
                  }))}
                  pendingId={exerciseBusyId}
                  onCheck={(questionId) => void confirmRequiredExercise(questionId)}
                />
              </section>
            )}
            <button
              type="button"
              className="primary-button"
              disabled={
                busy ||
                lesson.progress.completed ||
                lesson.required_exercises.some((exercise) => !exercise.checked)
              }
              onClick={() => void completeLesson()}
            >
              {lesson.progress.completed
                ? 'Aula concluída'
                : busy
                  ? 'Salvando...'
                  : 'Concluir aula'}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
