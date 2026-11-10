import { useEffect, useState } from 'react';
import { apiFetch } from '../../lib/api';
import { isSupabaseConfigured } from '../../lib/supabase';
import type { StudentSubject } from '../../types/learning';
import { demoSubjects } from './demoData';
import { Header } from '../layout/Chrome';

type Question = {
  id: string;
  subject: string;
  topic: string;
  difficulty: string;
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
};

// Cada matéria tem uma reserva coerente para a demonstração funcionar sem a API.
const fallbackQuestions: Record<string, Question> = {
  Matemática: {
    id: 'seed-fracoes-1',
    subject: 'Matemática',
    topic: 'Frações',
    difficulty: 'basic',
    question: 'Qual fração representa a metade de uma pizza?',
    options: ['1/2', '1/3', '2/3', '3/4'],
    correct_index: 0,
    explanation: 'Uma metade divide o todo em duas partes iguais e considera uma delas: 1/2.',
  },
  Português: {
    id: 'seed-portugues-1',
    subject: 'Português',
    topic: 'Interpretação',
    difficulty: 'basic',
    question: 'Em uma notícia, qual parte costuma resumir o assunto principal?',
    options: ['O título', 'A assinatura', 'A data', 'A legenda'],
    correct_index: 0,
    explanation: 'O título apresenta de forma curta o assunto principal da notícia.',
  },
  Ciências: {
    id: 'seed-ciencias-1',
    subject: 'Ciências',
    topic: 'Sistema solar',
    difficulty: 'basic',
    question: 'Qual planeta é conhecido como Planeta Vermelho?',
    options: ['Vênus', 'Marte', 'Júpiter', 'Mercúrio'],
    correct_index: 1,
    explanation:
      'Marte recebe esse nome por causa dos minerais de ferro presentes em sua superfície.',
  },
  História: {
    id: 'seed-historia-1',
    subject: 'História',
    topic: 'Brasil República',
    difficulty: 'basic',
    question: 'Em que ano foi proclamada a República no Brasil?',
    options: ['1822', '1888', '1889', '1930'],
    correct_index: 2,
    explanation: 'A República foi proclamada em 15 de novembro de 1889.',
  },
  Geografia: {
    id: 'seed-geografia-1',
    subject: 'Geografia',
    topic: 'Clima',
    difficulty: 'basic',
    question: 'Qual instrumento é usado para medir a temperatura do ar?',
    options: ['Barômetro', 'Termômetro', 'Pluviômetro', 'Anemômetro'],
    correct_index: 1,
    explanation:
      'O termômetro mede a temperatura do ar; os outros instrumentos medem pressão, chuva e vento.',
  },
  Inglês: {
    id: 'seed-ingles-1',
    subject: 'Inglês',
    topic: 'Vocabulário',
    difficulty: 'basic',
    question: "Qual é a tradução mais comum de 'book'?",
    options: ['Caderno', 'Caneta', 'Livro', 'Mesa'],
    correct_index: 2,
    explanation: "A palavra 'book' significa 'livro' em português.",
  },
};

function fallbackForSubject(subject: string) {
  return fallbackQuestions[subject] ?? fallbackQuestions.Matemática;
}

/** Executa o ciclo adaptativo: buscar, responder, explicar e avançar. */
export function PracticeProfile({
  initialSubject,
  onBack,
  onLogout,
}: {
  initialSubject: string;
  onBack: () => void;
  onLogout: () => void;
}) {
  const [subject, setSubject] = useState(initialSubject);
  const [question, setQuestion] = useState<Question>(() => fallbackForSubject(initialSubject));
  const [selected, setSelected] = useState<number | null>(null);
  const [result, setResult] = useState<{
    correct: boolean;
    explanation: string;
    next_difficulty: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [practiceSubjects, setPracticeSubjects] = useState<string[]>(
    isSupabaseConfigured ? [initialSubject] : demoSubjects.map((item) => item.name),
  );

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    apiFetch('/student/subjects')
      .then((response) => (response.ok ? (response.json() as Promise<StudentSubject[]>) : []))
      .then((items) => {
        if (active && Array.isArray(items)) setPracticeSubjects(items.map((item) => item.name));
      });
    return () => {
      active = false;
    };
  }, []);
  // Limpa o estado anterior para que nenhuma resposta apareça na nova questão.
  async function loadQuestion() {
    setLoading(true);
    setSelected(null);
    setResult(null);
    try {
      const response = await apiFetch(`/question-bank/next?subject=${encodeURIComponent(subject)}`);
      if (!response.ok) throw new Error();
      setQuestion(await response.json());
    } catch {
      setQuestion(fallbackForSubject(subject));
    } finally {
      setLoading(false);
    }
  }
  // O backend é responsável pela correção confiável e pela progressão de nível.
  async function submit() {
    if (selected === null) return;
    try {
      const response = await apiFetch(`/question-bank/${question.id}/answer`, {
        method: 'POST',
        body: JSON.stringify({ selected_index: selected }),
      });
      if (!response.ok) throw new Error();
      setResult(await response.json());
    } catch {
      // Sem resposta do servidor não tentamos corrigir no navegador: o gabarito
      // real fica só no backend para não virar dado fácil de inspecionar.
      setResult({
        correct: false,
        explanation: 'Não foi possível corrigir agora. Tente enviar a resposta novamente.',
        next_difficulty: 'basic',
      });
    }
  }
  return (
    <main id="main-content" tabIndex={-1} className="profile-page">
      <Header area="PRÁTICA ADAPTATIVA" onLogout={onLogout} />
      <section className="profile-content narrow">
        <button className="back-button" onClick={onBack}>
          ← Voltar ao perfil
        </button>
        <p className="eyebrow">BANCO DE QUESTÕES</p>
        <h1>Praticar com IA</h1>
        <p className="subtitle">As próximas questões são ajustadas conforme suas respostas.</p>
        <div className="practice-toolbar">
          <select value={subject} onChange={(event) => setSubject(event.target.value)}>
            {practiceSubjects.map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
          <button className="outline-button" onClick={loadQuestion}>
            {loading ? 'Gerando...' : 'Nova questão'}
          </button>
        </div>
        <article className="profile-panel question-card">
          <span className="badge">
            {question.subject} · {question.topic}
          </span>
          <h2>{question.question}</h2>
          <div className="options">
            {question.options.map((option, index) => (
              <button
                key={option}
                className={`option ${selected === index ? 'chosen' : ''}`}
                disabled={Boolean(result)}
                onClick={() => setSelected(index)}
              >
                <b>{String.fromCharCode(65 + index)}</b>
                {option}
              </button>
            ))}
          </div>
          {!result ? (
            <button className="primary-button" disabled={selected === null} onClick={submit}>
              Verificar resposta
            </button>
          ) : (
            <div className={`answer-feedback ${result.correct ? 'correct' : 'incorrect'}`}>
              <strong>
                {result.correct ? 'Muito bem! Resposta correta.' : 'Vamos revisar este conteúdo.'}
              </strong>
              <p>{result.explanation}</p>
              <small>
                Próxima dificuldade sugerida:{' '}
                {result.next_difficulty === 'basic'
                  ? 'básica'
                  : result.next_difficulty === 'intermediate'
                    ? 'intermediária'
                    : 'avançada'}
                .
              </small>
              <button className="outline-button" onClick={loadQuestion}>
                Próxima questão
              </button>
            </div>
          )}
        </article>
      </section>
    </main>
  );
}
