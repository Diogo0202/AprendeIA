import { CSSProperties, FormEvent, useEffect, useState } from "react";
import { accessToken, apiUrl, isSupabaseConfigured, supabase } from "./lib/supabase";

// As visualizações funcionam como uma navegação leve para este protótipo.
type View = "login" | "signup" | "student" | "teacher" | "admin" | "practice";
type Role = "student" | "teacher" | "admin";
type UserProfile = {
  id?: string;
  name: string;
  email: string;
  grade: string;
  goal: string;
  role: Role;
};

// Dados de demonstração permitem apresentar o TCC sem serviços externos.
const initialProfile: UserProfile = {
  name: "Diogo Mendes Baptista",
  email: "diogo@email.com",
  grade: "Graduação",
  goal: "Reforçar meus estudos",
  role: "student",
};
/** Anexa o JWT atual às chamadas que precisam ser validadas pelo FastAPI. */
async function apiFetch(path: string, init: RequestInit = {}) {
  const token = await accessToken();
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(`${apiUrl}${path}`, { ...init, headers });
}
const subjects = [
  {
    name: "Matemática",
    module: "Frações e porcentagens",
    completed: 5,
    total: 8,
    difficulty: "Alta",
    tone: "high",
  },
  {
    name: "Português",
    module: "Interpretação de texto",
    completed: 4,
    total: 6,
    difficulty: "Média",
    tone: "medium",
  },
  {
    name: "Ciências",
    module: "Sistema solar",
    completed: 6,
    total: 6,
    difficulty: "Baixa",
    tone: "low",
  },
];

type Achievement = {
  id: string;
  title: string;
  description: string;
  icon: string;
};

type GamificationSummary = {
  points: number;
  level: number;
  next_level_points: number;
  level_progress: number;
  accuracy_percent: number;
  active_days: number;
  current_streak: number;
  achievements: Achievement[];
};

// Estes dados só aparecem sem Supabase para a apresentação não esconder a jornada.
const demoGamification: GamificationSummary = {
  points: 400,
  level: 2,
  next_level_points: 500,
  level_progress: 60,
  accuracy_percent: 80,
  active_days: 4,
  current_streak: 3,
  achievements: [
    { id: "first_lesson", title: "Primeira aula", description: "Você começou sua jornada.", icon: "🌱" },
    { id: "study_streak", title: "Ritmo de estudo", description: "Estudou por 3 dias seguidos.", icon: "🔥" },
    { id: "ten_correct_answers", title: "Mira certeira", description: "Acertou 10 questões.", icon: "🎯" },
    { id: "excellent_accuracy", title: "Mandou bem", description: "Chegou a 80% de acertos.", icon: "⭐" },
  ],
};
type TeacherStudent = {
  id: string;
  full_name: string;
  grade: string;
  subject: string;
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
  status: "active" | "resolved";
};

// O modo local continua útil para apresentar o TCC, mas não cria permissões reais.
const demoTeacherStudents: TeacherStudent[] = [
  {
    id: "demo-ana",
    full_name: "Ana Souza",
    grade: "8º ano",
    subject: "Matemática",
  },
  {
    id: "demo-bruno",
    full_name: "Bruno Lima",
    grade: "8º ano",
    subject: "Matemática",
  },
];
const demoTeacherAlerts: TeacherAlert[] = [
  {
    id: "demo-alert",
    student_id: "demo-ana",
    student_name: "Ana Souza",
    student_grade: "8º ano",
    subject: "Matemática",
    topic: "Frações",
    accuracy: 40,
    attempts: 5,
    status: "active",
  },
];

/**
 * Coordena autenticação, restauração de sessão e troca entre os três perfis.
 * O cargo sempre é carregado de `profiles`; o formulário não decide permissões.
 */
export default function App() {
  const [view, setView] = useState<View>("login");
  const [profile, setProfile] = useState(initialProfile);
  const [authMessage, setAuthMessage] = useState("");
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const enter = (role: Role) => setView(role);

  // Restaura a sessão ao recarregar a página e remove o listener ao desmontar.
  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user.id) void loadProfile(data.session.user.id);
      else setAuthLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        setView("login");
        setAuthLoading(false);
      }
      if (event === "SIGNED_IN" && session?.user.id)
        void loadProfile(session.user.id);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  /** Carrega a identidade e direciona o usuário para sua área autorizada. */
  async function loadProfile(userId: string) {
    if (!supabase) return;
    setAuthLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id,email,full_name,role,grade,goal")
      .eq("id", userId)
      .single();
    if (error || !data) {
      setAuthMessage(
        "Não foi possível carregar o perfil. Verifique a migração do Supabase.",
      );
      setAuthLoading(false);
      return;
    }
    const role = data.role as Role;
    if (!["student", "teacher", "admin"].includes(role)) {
      setAuthMessage("Este usuário não possui um cargo válido.");
      setAuthLoading(false);
      return;
    }
    setProfile({
      id: data.id,
      name: data.full_name,
      email: data.email,
      grade: data.grade,
      goal: data.goal,
      role,
    });
    enter(role);
    setAuthMessage("");
    setAuthLoading(false);
  }

  /** Autentica no Supabase ou usa o seletor local no modo de demonstração. */
  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setAuthMessage("");
    setAuthLoading(true);
    if (!supabase) {
      // A demonstração local fica somente como estudante; cargos reais exigem
      // sessão do Supabase e são definidos pelo perfil carregado no backend.
      setProfile(initialProfile);
      enter("student");
      setAuthLoading(false);
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: String(data.get("email")),
      password: String(data.get("password")),
    });
    if (error) {
      setAuthMessage("E-mail ou senha inválidos.");
      setAuthLoading(false);
    }
  }

  /** Cria apenas estudantes; professores são cadastrados pela administradora. */
  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setAuthMessage("");
    setAuthLoading(true);
    const nextProfile: UserProfile = {
      name: String(data.get("name") || initialProfile.name),
      email: String(data.get("email") || initialProfile.email),
      grade: String(data.get("grade") || "Ensino Médio"),
      goal: "Reforçar meus estudos",
      role: "student",
    };
    if (!supabase) {
      setProfile(nextProfile);
      setView("student");
      setAuthLoading(false);
      return;
    }
    const { data: signUpData, error } = await supabase.auth.signUp({
      email: nextProfile.email,
      password: String(data.get("password")),
      options: {
        data: { full_name: nextProfile.name, grade: nextProfile.grade },
      },
    });
    if (error) {
      setAuthMessage(error.message);
      setAuthLoading(false);
      return;
    }
    if (!signUpData.session) {
      setAuthMessage("Cadastro criado. Confirme seu e-mail para entrar.");
      setView("login");
      setAuthLoading(false);
    }
  }

  // Encerra também a sessão remota para invalidar o estado persistido no navegador.
  const logout = async () => {
    if (supabase) await supabase.auth.signOut();
    setView("login");
  };
  if (authLoading && view === "login")
    return (
      <main className="page-shell">
        <section className="auth-card">
          <Brand />
          <p className="subtitle">Carregando sua sessão...</p>
        </section>
      </main>
    );
  if (view === "student")
    return (
      <StudentProfile
        profile={profile}
        onLogout={logout}
        onPractice={() => setView("practice")}
      />
    );
  if (view === "practice")
    if (profile.role !== "student")
      return <AccessDenied onLogout={logout} />;
  if (view === "practice")
    return (
      <PracticeProfile onBack={() => setView("student")} onLogout={logout} />
    );
  if (view === "teacher")
    return profile.role === "teacher" ? (
      <TeacherProfile onLogout={logout} />
    ) : (
      <AccessDenied onLogout={logout} />
    );
  if (view === "admin")
    return profile.role === "admin" ? (
      <AdminProfile onLogout={logout} />
    ) : (
      <AccessDenied onLogout={logout} />
    );
  return (
    <main className="page-shell">
      <section className="auth-card">
        <Brand />
        {view === "login" ? (
          <Login
            onSubmit={handleLogin}
            onSignup={() => setView("signup")}
            message={authMessage}
            loading={authLoading}
          />
        ) : (
          <Signup
            onSubmit={handleSignup}
            onLogin={() => setView("login")}
            message={authMessage}
            loading={authLoading}
          />
        )}
      </section>
    </main>
  );
}

/** Evita que uma navegação manipulada no cliente revele a área de outro cargo. */
function AccessDenied({ onLogout }: { onLogout: () => void }) {
  return (
    <main className="profile-page">
      <Header area="ACESSO RESTRITO" onLogout={onLogout} />
      <section className="profile-content narrow">
        <p className="eyebrow">PERMISSÃO NECESSÁRIA</p>
        <h1>Essa área não está disponível para seu perfil.</h1>
        <p className="subtitle">
          Sua sessão continua protegida. Saia e entre com uma conta autorizada.
        </p>
      </section>
    </main>
  );
}

/** Identidade visual compartilhada entre autenticação e painéis. */
function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <span />
      </span>
      <span>aprendeIA</span>
    </div>
  );
}

/** Cabeçalho comum que identifica a área atual e oferece saída explícita. */
function Header({ onLogout, area }: { onLogout: () => void; area: string }) {
  return (
    <header className="topbar">
      <Brand />
      <span className="area-name">{area}</span>
      <button className="logout" onClick={onLogout}>
        Sair
      </button>
    </header>
  );
}

/** Gera iniciais previsíveis enquanto o avatar ilustrado não foi escolhido. */
function Avatar({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span className={`small-avatar ${className}`} aria-hidden="true">
      {name
        .split(" ")
        .map((word) => word[0])
        .slice(0, 2)
        .join("")}
    </span>
  );
}

/** Formulário de entrada com mensagens de erro próximas à ação principal. */
function Login({
  onSubmit,
  onSignup,
  message,
  loading,
}: {
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onSignup: () => void;
  message: string;
  loading: boolean;
}) {
  return (
    <>
      <h1>Bem-vindo de volta</h1>
      <p className="subtitle">
        Entre para continuar sua jornada de aprendizagem.
      </p>
      <form onSubmit={onSubmit} className="auth-form">
        <label>
          E-MAIL
          <input
            name="email"
            type="email"
            placeholder="seuemail@exemplo.com"
            required
          />
        </label>
        <label>
          SENHA
          <div className="password-field">
            <input
              name="password"
              type="password"
              placeholder="Digite sua senha"
              required
            />
            <button type="button" aria-label="Mostrar senha">
              ◉
            </button>
          </div>
        </label>
        <div className="form-row">
          <label className="check">
            <input type="checkbox" />
            <span>Lembrar de mim</span>
          </label>
          <a href="#forgot" onClick={(e) => e.preventDefault()}>
            Esqueci minha senha
          </a>
        </div>
        {message && (
          <p className="form-message" role="status">
            {message}
          </p>
        )}
        <button className="primary-button" type="submit" disabled={loading}>
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>
      <p className="switch-copy">
        Ainda não tem uma conta?{" "}
        <button className="text-button" onClick={onSignup}>
          Crie sua conta
        </button>
      </p>
    </>
  );
}

/** Cadastro público deliberadamente limitado ao papel de estudante. */
function Signup({
  onSubmit,
  onLogin,
  message,
  loading,
}: {
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onLogin: () => void;
  message: string;
  loading: boolean;
}) {
  return (
    <>
      <h1>Crie sua conta</h1>
      <p className="subtitle">
        Novos cadastros são criados com o perfil de estudante.
      </p>
      <form onSubmit={onSubmit} className="auth-form">
        <label>
          NOME COMPLETO
          <input name="name" placeholder="Ex: Maria Silva" required />
        </label>
        <label>
          GRAU DE ESCOLARIDADE
          <select name="grade" defaultValue="">
            <option value="" disabled>
              Selecione...
            </option>
            <option>Ensino Fundamental I</option>
            <option>Ensino Fundamental II</option>
            <option>Ensino Médio</option>
            <option>Graduação</option>
            <option>Pós-Graduação</option>
          </select>
        </label>
        <label>
          E-MAIL
          <input
            name="email"
            type="email"
            placeholder="seuemail@exemplo.com"
            required
          />
        </label>
        <label>
          SENHA
          <input
            name="password"
            type="password"
            placeholder="Crie uma senha"
            required
            minLength={8}
          />
        </label>
        {message && (
          <p className="form-message" role="status">
            {message}
          </p>
        )}
        <button className="primary-button" type="submit" disabled={loading}>
          {loading ? "Criando..." : "Criar conta"}
        </button>
      </form>
      <p className="switch-copy">
        Já tem uma conta?{" "}
        <button className="text-button" onClick={onLogin}>
          Faça login
        </button>
      </p>
    </>
  );
}

/** Resume aulas, progresso e dificuldades para orientar o próximo estudo. */
function StudentProfile({
  profile,
  onLogout,
  onPractice,
}: {
  profile: UserProfile;
  onLogout: () => void;
  onPractice: () => void;
}) {
  const [gamification, setGamification] = useState<GamificationSummary | null>(
    isSupabaseConfigured ? null : demoGamification,
  );
  const [gamificationError, setGamificationError] = useState("");

  // A pontuação vem da API para que o navegador nunca consiga premiar a si mesmo.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    apiFetch("/student/gamification")
      .then(async (response) => {
        if (!response.ok) throw new Error("gamification request failed");
        return (await response.json()) as GamificationSummary;
      })
      .then((summary) => {
        if (active) setGamification(summary);
      })
      .catch(() => {
        if (active)
          setGamificationError(
            "Não foi possível atualizar suas conquistas agora. Tente novamente mais tarde.",
          );
      });
    return () => {
      active = false;
    };
  }, []);

  const levelStyle = gamification
    ? ({ "--progress": gamification.level_progress } as CSSProperties &
        Record<"--progress", number>)
    : undefined;

  return (
    <main className="profile-page">
      <Header area="ÁREA DO ESTUDANTE" onLogout={onLogout} />
      <section className="profile-content">
        <section className="student-hero" aria-labelledby="student-name">
          <div className="student-avatar-column">
            <Avatar name={profile.name} className="student-avatar" />
            <section className="achievement-shelf" aria-labelledby="achievements-title">
              <h2 id="achievements-title">Conquistas</h2>
              {gamification ? (
                <ul className="achievement-list">
                  {gamification.achievements.map((achievement) => (
                    <li className="achievement-chip" key={achievement.id} title={achievement.description}>
                      <span aria-hidden="true">{achievement.icon}</span>
                      <span>{achievement.title}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="achievement-empty">Suas conquistas aparecerão por aqui.</p>
              )}
            </section>
          </div>
          <div className="student-intro">
            <p className="eyebrow">MINHA JORNADA</p>
            <h1 id="student-name">Olá, {profile.name.split(" ")[0]}!</h1>
            <p className="subtitle">
              Cada aula e cada resposta ajudam a construir o seu caminho.
            </p>
            {gamification && (
              <dl className="journey-stats" aria-label="Resumo da jornada">
                <div><dt>Sequência</dt><dd>{gamification.current_streak} dias</dd></div>
                <div><dt>Acertos</dt><dd>{gamification.accuracy_percent}%</dd></div>
                <div><dt>Dias ativos</dt><dd>{gamification.active_days}</dd></div>
              </dl>
            )}
          </div>
          <section className="level-card" aria-label="Seu nível atual">
            {gamification ? (
              <>
                <div className="level-ring" style={levelStyle}>
                  <progress value={gamification.level_progress} max="100" aria-label={`${gamification.level_progress}% do caminho para o próximo nível`} />
                  <span><strong>{gamification.level}</strong>Nível</span>
                </div>
                <p><strong>{gamification.points} XP</strong> de {gamification.next_level_points} XP</p>
                <small>Continue estudando para subir de nível.</small>
              </>
            ) : (
              <p>Preparando sua jornada...</p>
            )}
          </section>
        </section>
        {gamificationError && <p className="gamification-message" role="status">{gamificationError}</p>}
        <button className="primary-button practice-button" onClick={onPractice}>
          Praticar questões com IA
        </button>
        <section className="section">
          <div className="section-heading">
            <h2>Minhas matérias</h2>
            <span>Progresso dos módulos</span>
          </div>
          <div className="subject-grid">
            {subjects.map((subject) => (
              <article className="subject-card" key={subject.name}>
                <div>
                  <h3>{subject.name}</h3>
                  <p>{subject.module}</p>
                </div>
                <div className="progress-copy">
                  <strong>
                    {subject.completed}/{subject.total}
                  </strong>
                  <span>aulas concluídas</span>
                </div>
                <div className="progress">
                  <i
                    style={{
                      width: `${(subject.completed / subject.total) * 100}%`,
                    }}
                  />
                </div>
                <p className="classes-left">
                  Faltam{" "}
                  <strong>{subject.total - subject.completed} aulas</strong>{" "}
                  neste módulo
                </p>
              </article>
            ))}
          </div>
        </section>
        <section className="section">
          <div className="section-heading">
            <h2>Minhas dificuldades</h2>
            <span>Identificadas pelas suas atividades</span>
          </div>
          <div className="difficulty-list">
            {subjects.map((subject) => (
              <article className="difficulty-row" key={subject.name}>
                <div>
                  <strong>{subject.name}</strong>
                  <span>{subject.module}</span>
                </div>
                <Difficulty level={subject.difficulty} tone={subject.tone} />
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

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

// A questão reserva evita uma tela vazia durante apresentações offline.
const fallbackQuestion: Question = {
  id: "seed-fracoes-1",
  subject: "Matemática",
  topic: "Frações",
  difficulty: "basic",
  question: "Qual fração representa a metade de uma pizza?",
  options: ["1/2", "1/3", "2/3", "3/4"],
  correct_index: 0,
  explanation:
    "Uma metade significa dividir o todo em duas partes iguais e considerar uma delas: 1/2.",
};

/** Executa o ciclo adaptativo: buscar, responder, explicar e avançar. */
function PracticeProfile({
  onBack,
  onLogout,
}: {
  onBack: () => void;
  onLogout: () => void;
}) {
  const [subject, setSubject] = useState("Matemática");
  const [question, setQuestion] = useState<Question>(fallbackQuestion);
  const [selected, setSelected] = useState<number | null>(null);
  const [result, setResult] = useState<{
    correct: boolean;
    explanation: string;
    next_difficulty: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  // Limpa o estado anterior para que nenhuma resposta apareça na nova questão.
  async function loadQuestion() {
    setLoading(true);
    setSelected(null);
    setResult(null);
    try {
      const response = await apiFetch(
        `/question-bank/next?subject=${encodeURIComponent(subject)}`,
      );
      if (!response.ok) throw new Error();
      setQuestion(await response.json());
    } catch {
      setQuestion({ ...fallbackQuestion, subject });
    } finally {
      setLoading(false);
    }
  }
  // O backend é responsável pela correção confiável e pela progressão de nível.
  async function submit() {
    if (selected === null) return;
    try {
      const response = await apiFetch(`/question-bank/${question.id}/answer`, {
        method: "POST",
        body: JSON.stringify({ selected_index: selected }),
      });
      if (!response.ok) throw new Error();
      setResult(await response.json());
  } catch {
      // Sem resposta do servidor não tentamos corrigir no navegador: o gabarito
      // real fica só no backend para não virar dado fácil de inspecionar.
      setResult({
        correct: false,
        explanation: "Não foi possível corrigir agora. Tente enviar a resposta novamente.",
        next_difficulty: "basic",
      });
    }
  }
  return (
    <main className="profile-page">
      <Header area="PRÁTICA ADAPTATIVA" onLogout={onLogout} />
      <section className="profile-content narrow">
        <button className="back-button" onClick={onBack}>
          ← Voltar ao perfil
        </button>
        <p className="eyebrow">BANCO DE QUESTÕES</p>
        <h1>Praticar com IA</h1>
        <p className="subtitle">
          As próximas questões são ajustadas conforme suas respostas.
        </p>
        <div className="practice-toolbar">
          <select
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
          >
            <option>Matemática</option>
            <option>Português</option>
            <option>Ciências</option>
          </select>
          <button className="outline-button" onClick={loadQuestion}>
            {loading ? "Gerando..." : "Nova questão"}
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
                className={`option ${selected === index ? "chosen" : ""}`}
                disabled={Boolean(result)}
                onClick={() => setSelected(index)}
              >
                <b>{String.fromCharCode(65 + index)}</b>
                {option}
              </button>
            ))}
          </div>
          {!result ? (
            <button
              className="primary-button"
              disabled={selected === null}
              onClick={submit}
            >
              Verificar resposta
            </button>
          ) : (
            <div
              className={`answer-feedback ${result.correct ? "correct" : "incorrect"}`}
            >
              <strong>
                {result.correct
                  ? "Muito bem! Resposta correta."
                  : "Vamos revisar este conteúdo."}
              </strong>
              <p>{result.explanation}</p>
              <small>
                Próxima dificuldade sugerida:{" "}
                {result.next_difficulty === "basic"
                  ? "básica"
                  : result.next_difficulty === "intermediate"
                    ? "intermediária"
                    : "avançada"}
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

/** Organiza a observação dos alunos sem expor funções administrativas. */
function TeacherProfile({ onLogout }: { onLogout: () => void }) {
  const [students, setStudents] = useState<TeacherStudent[]>(demoTeacherStudents);
  const [alerts, setAlerts] = useState<TeacherAlert[]>([]);
  const [selectedId, setSelectedId] = useState(demoTeacherStudents[0].id);
  const [alertMessage, setAlertMessage] = useState("Carregando alertas da disciplina...");

  useEffect(() => {
    let active = true;
    async function loadTeacherData() {
      if (!supabase) {
        setAlerts(demoTeacherAlerts);
        setAlertMessage("Modo de demonstração: há 1 alerta de Matemática.");
        return;
      }
      try {
        const [alertsResponse, studentsResponse] = await Promise.all([
          apiFetch("/teacher/difficulty-alerts"),
          apiFetch("/teacher/students"),
        ]);
        if (!alertsResponse.ok || !studentsResponse.ok) throw new Error("teacher-data");
        const nextAlerts = (await alertsResponse.json()) as TeacherAlert[];
        const nextStudents = (await studentsResponse.json()) as TeacherStudent[];
        if (!active) return;
        setAlerts(nextAlerts);
        setStudents(nextStudents);
        setSelectedId((current) =>
          nextStudents.some((student) => student.id === current)
            ? current
            : (nextStudents[0]?.id ?? ""),
        );
        setAlertMessage(
          nextAlerts.length
            ? `${nextAlerts.length} alerta(s) ativo(s) na sua disciplina.`
            : "Nenhuma dificuldade importante está ativa agora.",
        );
      } catch {
        if (active) {
          setAlerts([]);
          setAlertMessage("Não foi possível atualizar os alertas. Tente novamente mais tarde.");
        }
      }
    }
    void loadTeacherData();
    return () => {
      active = false;
    };
  }, []);

  const selected = students.find((student) => student.id === selectedId) ?? students[0];
  const selectedAlerts = alerts.filter(
    (alert) => alert.student_id === selected?.id || alert.student_name === selected?.full_name,
  );
  const hasDifficulty = selectedAlerts.length > 0;
  return (
    <main className="profile-page">
      <Header area="ÁREA DO PROFESSOR" onLogout={onLogout} />
      <section className="profile-content">
        <p className="eyebrow">ACOMPANHAMENTO DE TURMA</p>
        <h1>Visão dos estudantes</h1>
        <p className="subtitle">
          Acompanhe somente a disciplina sob sua responsabilidade.
        </p>
        <section className="teacher-alerts" aria-labelledby="difficulty-alerts-title">
          <div className="section-heading">
            <h2 id="difficulty-alerts-title">Alertas de dificuldade</h2>
            <span>Atualização automática</span>
          </div>
          <p className="teacher-alert-status" role="status" aria-live="polite">
            {alertMessage}
          </p>
          {alerts.length > 0 && (
            <div className="alert-grid">
              {alerts.map((alert) => (
                <article className="difficulty-alert" key={alert.id}>
                  <Difficulty level="Atenção" tone="high" />
                  <strong>{alert.student_name}</strong>
                  <span>{alert.subject} · {alert.topic}</span>
                  <p>{alert.accuracy}% de acertos em {alert.attempts} tentativas</p>
                </article>
              ))}
            </div>
          )}
        </section>
        <div className="teacher-layout">
          <section className="profile-panel student-list">
            <h2>Estudantes</h2>
            {students.map((student) => (
              <button
                key={student.id}
                onClick={() => setSelectedId(student.id)}
                className={`student-item ${selected?.id === student.id ? "selected" : ""}`}
              >
                <Avatar name={student.full_name} />
                <span>
                  <strong>{student.full_name}</strong>
                  <small>{student.grade}</small>
                </span>
              </button>
            ))}
          </section>
          <section className="profile-panel tracking-panel">
            {selected ? (
              <>
                <div className="selected-student">
                  <Avatar name={selected.full_name} />
                  <div>
                    <h2>{selected.full_name}</h2>
                    <p>{selected.grade}</p>
                  </div>
                </div>
                <h3>Disciplina acompanhada</h3>
                <div className="access-row">
                  <strong>{selected.subject}</strong>
                  <span>Dados restritos à sua matéria</span>
                </div>
                <div className="metrics">
                  <div>
                    <span>Alertas ativos</span>
                    <strong>{selectedAlerts.length}</strong>
                  </div>
                  <div>
                    <span>Nível de dificuldade</span>
                    <Difficulty level={hasDifficulty ? "Alta" : "Acompanhando"} tone={hasDifficulty ? "high" : "low"} />
                  </div>
                </div>
                <div className="teacher-note">
                  <strong>Ponto de atenção</strong>
                  <p>
                    {hasDifficulty
                      ? "Vale revisar esse conteúdo com exercícios guiados."
                      : "Sem alerta importante nesta disciplina por enquanto."}
                  </p>
                </div>
              </>
            ) : (
              <p className="empty-state">Nenhum estudante foi encontrado nesta disciplina.</p>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}

/** Permite que apenas a administradora crie contas e atribua cargos iniciais. */
function AdminProfile({ onLogout }: { onLogout: () => void }) {
  const [people, setPeople] = useState([
    { name: "Ana Souza", role: "Estudante" },
    { name: "Prof. Carlos Lima", role: "Professor" },
  ]);
  const [message, setMessage] = useState("");
  const [selectedRole, setSelectedRole] = useState<"student" | "teacher">("student");
  /** Envia dados ao servidor, onde o token e o cargo de admin são verificados. */
  async function addPerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setMessage("");
    const name = String(data.get("name"));
    const role = String(data.get("role")) as Role;
    const label = role === "teacher" ? "Professor" : "Estudante";
    if (supabase) {
      const response = await apiFetch("/admin/users", {
        method: "POST",
        body: JSON.stringify({
          name,
          email: String(data.get("email")),
          password: String(data.get("password")),
          role,
          subject: role === "teacher" ? String(data.get("subject")) : undefined,
        }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        setMessage(detail.detail || "Não foi possível incluir o usuário.");
        return;
      }
    }
    setPeople([...people, { name, role: label }]);
    setMessage("Usuário incluído com sucesso.");
    form.reset();
  }
  return (
    <main className="profile-page">
      <Header area="ÁREA DA ADMINISTRADORA" onLogout={onLogout} />
      <section className="profile-content narrow">
        <p className="eyebrow">GERENCIAMENTO DE USUÁRIOS</p>
        <h1>Adicionar pessoas</h1>
        <p className="subtitle">
          Inclua estudantes e professores em seus respectivos cargos.
        </p>
        <div className="admin-layout">
          <section className="profile-panel">
            <h2>Novo usuário</h2>
            <form className="auth-form compact-form" onSubmit={addPerson}>
              <label>
                NOME COMPLETO
                <input name="name" placeholder="Ex: Maria Silva" required />
              </label>
              <label>
                E-MAIL
                <input
                  name="email"
                  type="email"
                  placeholder="usuario@escola.com"
                  required
                />
              </label>
              <label>
                SENHA TEMPORÁRIA
                <input name="password" type="password" minLength={8} required />
              </label>
              <label>
                CARGO
                <select
                  name="role"
                  value={selectedRole}
                  onChange={(event) => setSelectedRole(event.target.value as "student" | "teacher")}
                >
                  <option value="student">Estudante</option>
                  <option value="teacher">Professor</option>
                </select>
              </label>
              {selectedRole === "teacher" && (
                <label>
                  DISCIPLINA
                  <input
                    name="subject"
                    placeholder="Ex: Matemática"
                    required
                    aria-describedby="subject-help"
                  />
                  <small id="subject-help" className="field-help">
                    Cada disciplina recebe um único professor neste projeto.
                  </small>
                </label>
              )}
              {message && (
                <p className="form-message" role="status">
                  {message}
                </p>
              )}
              <button className="primary-button">Adicionar usuário</button>
            </form>
          </section>
          <section className="profile-panel">
            <h2>Usuários incluídos</h2>
            <div className="people-list">
              {people.map((person, index) => (
                <div className="person-row" key={`${person.name}-${index}`}>
                  <Avatar name={person.name} />
                  <strong>{person.name}</strong>
                  <span className="badge">{person.role}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

/** Converte o nível pedagógico em uma indicação visual consistente. */
function Difficulty({ level, tone }: { level: string; tone: string }) {
  return <span className={`difficulty ${tone}`}>{level}</span>;
}
