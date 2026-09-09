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
type Subject = {
  name: string;
  category: string;
  code: string;
  module: string;
  completed: number;
  total: number;
  difficulty: string;
  tone: string;
  coverTone: string;
};

// O catálogo local deixa a demonstração completa enquanto os dados reais vêm da API.
const subjects: Subject[] = [
  {
    name: "Matemática",
    category: "Ciências Exatas",
    code: "M",
    module: "Frações e porcentagens",
    completed: 5,
    total: 8,
    difficulty: "Alta",
    tone: "high",
    coverTone: "math",
  },
  {
    name: "Português",
    category: "Linguagens",
    code: "PT",
    module: "Interpretação de texto",
    completed: 4,
    total: 6,
    difficulty: "Média",
    tone: "medium",
    coverTone: "language",
  },
  {
    name: "Ciências",
    category: "Ciências da Natureza",
    code: "C",
    module: "Sistema solar",
    completed: 6,
    total: 6,
    difficulty: "Baixa",
    tone: "low",
    coverTone: "science",
  },
  {
    name: "História",
    category: "Ciências Humanas",
    code: "H",
    module: "Brasil República",
    completed: 3,
    total: 7,
    difficulty: "Média",
    tone: "medium",
    coverTone: "history",
  },
  {
    name: "Geografia",
    category: "Ciências Humanas",
    code: "G",
    module: "Clima e vegetação",
    completed: 2,
    total: 6,
    difficulty: "Alta",
    tone: "high",
    coverTone: "geography",
  },
  {
    name: "Inglês",
    category: "Linguagens",
    code: "EN",
    module: "Leitura e vocabulário",
    completed: 4,
    total: 8,
    difficulty: "Baixa",
    tone: "low",
    coverTone: "english",
  },
];

const subjectCategories = [
  "Todas",
  "Ciências Exatas",
  "Linguagens",
  "Ciências da Natureza",
  "Ciências Humanas",
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
  content_type: "lesson" | "exercise" | "video" | "link";
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
  status: "active" | "resolved";
};

// O modo local continua útil para apresentar o TCC, mas não cria permissões reais.
const demoTeacherStudents: TeacherStudent[] = [
  {
    id: "demo-ana",
    full_name: "Ana Souza",
    grade: "8º ano",
    subject: "Matemática",
    accuracy: 42,
    attempts: 12,
    difficulty: "Alta",
    time_minutes: 155,
    completed_lessons: 5,
    trend: [
      { week: "S34", accuracy: 38, difficulty_score: 62, attempts: 4, level: "Alta" },
      { week: "S35", accuracy: 46, difficulty_score: 54, attempts: 5, level: "Alta" },
      { week: "S36", accuracy: 58, difficulty_score: 42, attempts: 3, level: "Alta" },
    ],
    difficulties: [{ topic: "Frações", accuracy: 40, attempts: 5 }],
    recent_attempts: [
      { answered_at: "2026-09-08", topic: "Frações equivalentes", correct: true },
      { answered_at: "2026-09-07", topic: "Porcentagem", correct: false },
    ],
  },
  {
    id: "demo-bruno",
    full_name: "Bruno Lima",
    grade: "8º ano",
    subject: "Matemática",
    accuracy: 78,
    attempts: 18,
    difficulty: "Média",
    time_minutes: 194,
    completed_lessons: 7,
    trend: [
      { week: "S34", accuracy: 62, difficulty_score: 38, attempts: 6, level: "Média" },
      { week: "S35", accuracy: 72, difficulty_score: 28, attempts: 6, level: "Média" },
      { week: "S36", accuracy: 83, difficulty_score: 17, attempts: 6, level: "Baixa" },
    ],
    difficulties: [{ topic: "Equações", accuracy: 68, attempts: 6 }],
    recent_attempts: [
      { answered_at: "2026-09-08", topic: "Equações", correct: true },
      { answered_at: "2026-09-06", topic: "Frações", correct: true },
    ],
  },
];

const demoTeacherClasses: TeacherClass[] = [
  {
    id: "demo-class-a",
    name: "8º ano A",
    school_year: "2026",
    subject: "Matemática",
    student_count: 2,
    students: demoTeacherStudents,
    trend: [
      { week: "S34", accuracy: 50, difficulty_score: 50, attempts: 10, level: "Alta" },
      { week: "S35", accuracy: 59, difficulty_score: 41, attempts: 11, level: "Alta" },
      { week: "S36", accuracy: 71, difficulty_score: 29, attempts: 9, level: "Média" },
    ],
  },
  {
    id: "demo-class-b",
    name: "9º ano B",
    school_year: "2026",
    subject: "Matemática",
    student_count: 0,
    students: [],
    trend: [],
  },
];

const demoTeacherContents: TeacherContent[] = [
  {
    id: "demo-content-1",
    title: "Frações com apoio visual",
    description: "Sequência curta para retomar equivalência e comparação.",
    content_type: "lesson",
    source_url: "",
  },
  {
    id: "demo-content-2",
    title: "Lista guiada de porcentagem",
    description: "Exercícios progressivos com situações do dia a dia.",
    content_type: "exercise",
    source_url: "",
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
  // O atalho de apresentação só existe sem Supabase; ele não cria sessão nem
  // atravessa as permissões do backend.
  const demoTeacher = !isSupabaseConfigured && new URLSearchParams(window.location.search).get("demo") === "teacher";
  const [view, setView] = useState<View>(demoTeacher ? "teacher" : "login");
  const [profile, setProfile] = useState<UserProfile>(demoTeacher ? { ...initialProfile, role: "teacher" } : initialProfile);
  const [practiceSubject, setPracticeSubject] = useState("Matemática");
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
        onPractice={(subject = "Matemática") => {
          setPracticeSubject(subject);
          setView("practice");
        }}
      />
    );
  if (view === "practice")
    if (profile.role !== "student")
      return <AccessDenied onLogout={logout} />;
  if (view === "practice")
    return (
      <PracticeProfile
        initialSubject={practiceSubject}
        onBack={() => setView("student")}
        onLogout={logout}
      />
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
  onPractice: (subject?: string) => void;
}) {
  const [gamification, setGamification] = useState<GamificationSummary | null>(
    isSupabaseConfigured ? null : demoGamification,
  );
  const [gamificationError, setGamificationError] = useState("");
  const [subjectQuery, setSubjectQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("Todas");

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

  const normalizedQuery = subjectQuery.trim().toLocaleLowerCase("pt-BR");
  const visibleSubjects = subjects.filter((subject) => {
    const matchesCategory =
      activeCategory === "Todas" || subject.category === activeCategory;
    const matchesSearch =
      !normalizedQuery ||
      `${subject.name} ${subject.module} ${subject.category}`
        .toLocaleLowerCase("pt-BR")
        .includes(normalizedQuery);
    return matchesCategory && matchesSearch;
  });

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
        <button className="primary-button practice-button" onClick={() => onPractice()}>
          Praticar questões com IA
        </button>
        <section className="section subject-catalog" aria-labelledby="subjects-title">
          <div className="catalog-heading">
            <div>
              <h2 id="subjects-title">Todas as matérias</h2>
              <p>Escolha uma matéria e continue pelo módulo em andamento.</p>
            </div>
            <label className="subject-search">
              <span>Buscar matéria</span>
              <input
                type="search"
                value={subjectQuery}
                onChange={(event) => setSubjectQuery(event.target.value)}
                placeholder="Ex.: Matemática"
              />
            </label>
          </div>
          <div className="category-filters" role="group" aria-label="Filtrar matérias por área">
            {subjectCategories.map((category) => (
              <button
                className={activeCategory === category ? "active" : ""}
                type="button"
                aria-pressed={activeCategory === category}
                onClick={() => setActiveCategory(category)}
                key={category}
              >
                {category}
              </button>
            ))}
          </div>
          {visibleSubjects.length ? (
            <div className="subject-grid">
            {visibleSubjects.map((subject) => (
              <article className="subject-card" key={subject.name}>
                <div className={`subject-cover ${subject.coverTone}`}>
                  <span>{subject.category}</span>
                  <strong aria-hidden="true">{subject.code}</strong>
                </div>
                <div className="subject-card-body">
                  <div className="subject-card-heading">
                    <span className={`difficulty ${subject.tone}`}>{subject.difficulty}</span>
                  <h3>{subject.name}</h3>
                  <p>{subject.module}</p>
                  </div>
                  <div className="course-meta" aria-label={`Progresso em ${subject.name}`}>
                    <span><strong>{subject.total}</strong> aulas</span>
                    <span><strong>{subject.completed}</strong> concluídas</span>
                  </div>
                  <progress
                    className="course-progress"
                    value={subject.completed}
                    max={subject.total}
                    aria-label={`${subject.completed} de ${subject.total} aulas concluídas`}
                  />
                  <div className="subject-card-footer">
                    <span>Faltam {subject.total - subject.completed} aulas</span>
                    <button type="button" onClick={() => onPractice(subject.name)}>
                      Continuar
                    </button>
                  </div>
                </div>
              </article>
            ))}
            </div>
          ) : (
            <div className="catalog-empty" role="status">
              <strong>Nenhuma matéria encontrada.</strong>
              <span>Limpe a busca ou escolha outra área.</span>
            </div>
          )}
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

// Cada matéria tem uma reserva coerente para a demonstração funcionar sem a API.
const fallbackQuestions: Record<string, Question> = {
  Matemática: {
    id: "seed-fracoes-1", subject: "Matemática", topic: "Frações", difficulty: "basic",
    question: "Qual fração representa a metade de uma pizza?",
    options: ["1/2", "1/3", "2/3", "3/4"], correct_index: 0,
    explanation: "Uma metade divide o todo em duas partes iguais e considera uma delas: 1/2.",
  },
  Português: {
    id: "seed-portugues-1", subject: "Português", topic: "Interpretação", difficulty: "basic",
    question: "Em uma notícia, qual parte costuma resumir o assunto principal?",
    options: ["O título", "A assinatura", "A data", "A legenda"], correct_index: 0,
    explanation: "O título apresenta de forma curta o assunto principal da notícia.",
  },
  Ciências: {
    id: "seed-ciencias-1", subject: "Ciências", topic: "Sistema solar", difficulty: "basic",
    question: "Qual planeta é conhecido como Planeta Vermelho?",
    options: ["Vênus", "Marte", "Júpiter", "Mercúrio"], correct_index: 1,
    explanation: "Marte recebe esse nome por causa dos minerais de ferro presentes em sua superfície.",
  },
  História: {
    id: "seed-historia-1", subject: "História", topic: "Brasil República", difficulty: "basic",
    question: "Em que ano foi proclamada a República no Brasil?",
    options: ["1822", "1888", "1889", "1930"], correct_index: 2,
    explanation: "A República foi proclamada em 15 de novembro de 1889.",
  },
  Geografia: {
    id: "seed-geografia-1", subject: "Geografia", topic: "Clima", difficulty: "basic",
    question: "Qual instrumento é usado para medir a temperatura do ar?",
    options: ["Barômetro", "Termômetro", "Pluviômetro", "Anemômetro"], correct_index: 1,
    explanation: "O termômetro mede a temperatura do ar; os outros instrumentos medem pressão, chuva e vento.",
  },
  Inglês: {
    id: "seed-ingles-1", subject: "Inglês", topic: "Vocabulário", difficulty: "basic",
    question: "Qual é a tradução mais comum de 'book'?",
    options: ["Caderno", "Caneta", "Livro", "Mesa"], correct_index: 2,
    explanation: "A palavra 'book' significa 'livro' em português.",
  },
};

function fallbackForSubject(subject: string) {
  return fallbackQuestions[subject] ?? fallbackQuestions.Matemática;
}

/** Executa o ciclo adaptativo: buscar, responder, explicar e avançar. */
function PracticeProfile({
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
            <option>História</option>
            <option>Geografia</option>
            <option>Inglês</option>
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

/** Reúne as tarefas diárias do professor sem misturar funções administrativas. */
function TeacherProfile({ onLogout }: { onLogout: () => void }) {
  type TeacherTab = "overview" | "classes" | "reports" | "contents" | "ai";
  const [activeTab, setActiveTab] = useState<TeacherTab>("overview");
  const [overview, setOverview] = useState<TeacherOverview>({
    subject: "Matemática",
    class_count: 2,
    student_count: 2,
    active_alerts: 1,
    average_accuracy: 60,
  });
  const [classes, setClasses] = useState<TeacherClass[]>(demoTeacherClasses);
  const [selectedClassId, setSelectedClassId] = useState(demoTeacherClasses[0].id);
  const [selectedClass, setSelectedClass] = useState<TeacherClass>(demoTeacherClasses[0]);
  const [selectedStudentId, setSelectedStudentId] = useState(demoTeacherStudents[0].id);
  const [alerts, setAlerts] = useState<TeacherAlert[]>(demoTeacherAlerts);
  const [contents, setContents] = useState<TeacherContent[]>(demoTeacherContents);
  const [recommendation, setRecommendation] = useState<TeacherRecommendation | null>(null);
  const [message, setMessage] = useState("Painel pronto para acompanhar sua disciplina.");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadDashboard() {
      if (!supabase) return;
      setBusy(true);
      try {
        const [overviewResponse, classesResponse, alertsResponse, contentsResponse] = await Promise.all([
          apiFetch("/teacher/overview"),
          apiFetch("/teacher/classes"),
          apiFetch("/teacher/difficulty-alerts"),
          apiFetch("/teacher/contents"),
        ]);
        if (![overviewResponse, classesResponse, alertsResponse, contentsResponse].every((item) => item.ok)) {
          throw new Error("dashboard-data");
        }
        const nextClasses = (await classesResponse.json()) as TeacherClass[];
        if (!active) return;
        setOverview((await overviewResponse.json()) as TeacherOverview);
        setClasses(nextClasses);
        setAlerts((await alertsResponse.json()) as TeacherAlert[]);
        setContents((await contentsResponse.json()) as TeacherContent[]);
        setSelectedClassId(nextClasses[0]?.id ?? "");
        setMessage("Dados atualizados com segurança.");
      } catch {
        if (active) setMessage("Não foi possível atualizar o painel. Tente novamente.");
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
          setSelectedStudentId(demoClass.students?.[0]?.id ?? "");
        }
        return;
      }
      try {
        const response = await apiFetch(`/teacher/classes/${selectedClassId}`);
        if (!response.ok) throw new Error("class-data");
        const nextClass = (await response.json()) as TeacherClass;
        if (!active) return;
        setSelectedClass(nextClass);
        setSelectedStudentId(nextClass.students?.[0]?.id ?? "");
      } catch {
        if (active) setMessage("Não foi possível abrir esta turma.");
      }
    }
    void loadClass();
    return () => {
      active = false;
    };
  }, [selectedClassId]);

  const selectedStudent = selectedClass.students?.find((student) => student.id === selectedStudentId);
  const tabs: { id: TeacherTab; label: string }[] = [
    { id: "overview", label: "Visão geral" },
    { id: "classes", label: "Turmas" },
    { id: "reports", label: "Relatórios" },
    { id: "contents", label: "Conteúdos" },
    { id: "ai", label: "Recomendação IA" },
  ];

  async function createClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const draft = {
      name: String(data.get("name")),
      school_year: String(data.get("school_year")),
    };
    setBusy(true);
    try {
      let created: TeacherClass;
      if (supabase) {
        const response = await apiFetch("/teacher/classes", { method: "POST", body: JSON.stringify(draft) });
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail);
        created = (await response.json()) as TeacherClass;
      } else {
        created = { id: `demo-${Date.now()}`, subject: overview.subject, student_count: 0, students: [], trend: [], ...draft };
      }
      setClasses((current) => [...current, created]);
      setSelectedClass(created);
      setSelectedClassId(created.id);
      setActiveTab("classes");
      setMessage("Turma criada com sucesso.");
      form.reset();
    } catch (error) {
      setMessage(error instanceof Error && error.message ? error.message : "Não foi possível criar a turma.");
    } finally {
      setBusy(false);
    }
  }

  async function addStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = String(new FormData(form).get("student_email"));
    if (!selectedClassId) return;
    setBusy(true);
    try {
      if (supabase) {
        const response = await apiFetch(`/teacher/classes/${selectedClassId}/students`, {
          method: "POST",
          body: JSON.stringify({ student_email: email }),
        });
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail);
        const refreshed = await apiFetch(`/teacher/classes/${selectedClassId}`);
        setSelectedClass((await refreshed.json()) as TeacherClass);
      } else {
        setMessage("No modo de demonstração, use os alunos que já aparecem na turma.");
        return;
      }
      setMessage("Estudante incluído na turma. Os dados pessoais não foram alterados.");
      form.reset();
    } catch (error) {
      setMessage(error instanceof Error && error.message ? error.message : "Não foi possível incluir o estudante.");
    } finally {
      setBusy(false);
    }
  }

  async function removeStudent(studentId: string) {
    if (!supabase || !selectedClassId) {
      setMessage("A remoção fica disponível quando o projeto estiver conectado ao Supabase.");
      return;
    }
    setBusy(true);
    try {
      const response = await apiFetch(`/teacher/classes/${selectedClassId}/students/${studentId}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Não foi possível remover o vínculo.");
      setSelectedClass((current) => ({
        ...current,
        student_count: Math.max(0, current.student_count - 1),
        students: current.students?.filter((student) => student.id !== studentId),
      }));
      setMessage("Estudante removido da turma. O histórico foi preservado.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível remover o estudante.");
    } finally {
      setBusy(false);
    }
  }

  async function exportReport() {
    if (!selectedClassId) return;
    if (!supabase) {
      setMessage("Relatório de demonstração preparado. Conecte o Supabase para baixar dados reais.");
      return;
    }
    const response = await apiFetch(`/teacher/reports/export?class_id=${encodeURIComponent(selectedClassId)}`);
    if (!response.ok) {
      setMessage("Não foi possível exportar o relatório.");
      return;
    }
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `relatorio-${selectedClass.name}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage("Relatório exportado em CSV.");
  }

  async function createContent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const draft = {
      title: String(data.get("title")),
      description: String(data.get("description")),
      content_type: String(data.get("content_type")) as TeacherContent["content_type"],
      source_url: String(data.get("source_url")),
    };
    setBusy(true);
    try {
      let created: TeacherContent;
      if (supabase) {
        const response = await apiFetch("/teacher/contents", { method: "POST", body: JSON.stringify(draft) });
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail);
        created = (await response.json()) as TeacherContent;
      } else {
        created = { id: `demo-content-${Date.now()}`, ...draft };
      }
      setContents((current) => [created, ...current]);
      setMessage("Conteúdo salvo na sua disciplina.");
      form.reset();
    } catch (error) {
      setMessage(error instanceof Error && error.message ? error.message : "Não foi possível salvar o conteúdo.");
    } finally {
      setBusy(false);
    }
  }

  async function importContents(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = (new FormData(form).get("content_file") as File | null);
    if (!file || !/\.(csv|json)$/i.test(file.name) || file.size > 100_000) {
      setMessage("Escolha um arquivo CSV ou JSON de até 100 KB.");
      return;
    }
    if (!supabase) {
      setMessage("Arquivo validado. A importação real precisa do Supabase conectado.");
      return;
    }
    setBusy(true);
    try {
      const response = await apiFetch("/teacher/contents/import", {
        method: "POST",
        body: JSON.stringify({ format: file.name.toLowerCase().endsWith(".json") ? "json" : "csv", content: await file.text() }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail);
      const result = await response.json();
      setContents((current) => [...result.contents, ...current]);
      setMessage(`${result.imported} conteúdo(s) importado(s).`);
      form.reset();
    } catch (error) {
      setMessage(error instanceof Error && error.message ? error.message : "Não foi possível importar o arquivo.");
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
        const response = await apiFetch("/teacher/recommendations", {
          method: "POST",
          body: JSON.stringify({ class_id: selectedClassId, student_id: selectedStudentId || undefined }),
        });
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail);
        setRecommendation((await response.json()) as TeacherRecommendation);
      } else {
        setRecommendation({
          diagnosis: "A turma está avançando, mas frações ainda concentram erros recorrentes.",
          objective: "Consolidar equivalência de frações antes de avançar para porcentagem.",
          actions: [
            "Retomar o conceito com representações visuais.",
            "Formar duplas para comparar estratégias de resolução.",
            "Aplicar uma verificação curta no fim da aula.",
          ],
          content_suggestion: "Use a sequência Frações com apoio visual e finalize com cinco questões progressivas.",
        });
      }
      setMessage("Recomendação pedagógica gerada para o contexto selecionado.");
    } catch (error) {
      setMessage(error instanceof Error && error.message ? error.message : "Não foi possível gerar a recomendação.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="profile-page teacher-workspace">
      <Header area="ÁREA DO PROFESSOR" onLogout={onLogout} />
      <div className="teacher-app-shell">
        <aside className="teacher-sidebar" aria-label="Navegação do professor">
          <div className="teacher-subject-stamp">
            <span>DISCIPLINA</span>
            <strong>{overview.subject}</strong>
            <small>Acesso restrito à sua matéria</small>
          </div>
          <nav className="teacher-nav">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={activeTab === tab.id ? "active" : ""}
                onClick={() => setActiveTab(tab.id)}
                aria-pressed={activeTab === tab.id}
              >
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>
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
            <p className="teacher-status" role="status" aria-live="polite">{busy ? "Atualizando dados..." : message}</p>
          </header>

          {activeTab === "overview" && (
            <div className="teacher-view-stack">
              <section className="teacher-metric-strip" aria-label="Resumo da disciplina">
                <div><span>Turmas</span><strong>{overview.class_count}</strong></div>
                <div><span>Estudantes</span><strong>{overview.student_count}</strong></div>
                <div className="metric-emphasis"><span>Precisam de atenção</span><strong>{overview.active_alerts}</strong></div>
                <div><span>Média de acertos</span><strong>{overview.average_accuracy}%</strong></div>
              </section>
              <div className="teacher-overview-grid">
                <section className="teacher-surface teacher-alert-feed">
                  <div className="teacher-section-title">
                    <div><span className="section-index">01</span><h2>Prioridades de hoje</h2></div>
                    <small>{alerts.length} alerta(s) ativo(s)</small>
                  </div>
                  {alerts.length ? alerts.map((alert) => (
                    <button
                      className="teacher-alert-row"
                      key={alert.id}
                      onClick={() => {
                        setSelectedStudentId(alert.student_id ?? "");
                        setActiveTab("classes");
                      }}
                    >
                      <span className="alert-marker" />
                      <span><strong>{alert.student_name}</strong><small>{alert.topic}</small></span>
                      <span className="alert-score">{alert.accuracy}%</span>
                    </button>
                  )) : <p className="teacher-empty">Nenhum alerta importante agora.</p>}
                </section>
                <section className="teacher-surface">
                  <div className="teacher-section-title">
                    <div><span className="section-index">02</span><h2>Evolução da turma</h2></div>
                    <small>Dificuldade por semana</small>
                  </div>
                  <DifficultyTrend points={selectedClass.trend ?? []} />
                </section>
              </div>
            </div>
          )}

          {activeTab === "classes" && (
            <div className="teacher-view-stack">
              <div className="class-toolbar">
                <label>
                  TURMA ATUAL
                  <select value={selectedClassId} onChange={(event) => setSelectedClassId(event.target.value)}>
                    {classes.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.school_year}</option>)}
                  </select>
                </label>
                <form className="inline-class-form" onSubmit={createClass}>
                  <input name="name" placeholder="Nova turma" minLength={2} maxLength={80} required aria-label="Nome da nova turma" />
                  <input name="school_year" placeholder="Ano letivo" minLength={2} maxLength={30} required aria-label="Ano letivo" />
                  <button className="primary-button" disabled={busy}>Criar turma</button>
                </form>
              </div>
              <div className="class-workbench">
                <section className="teacher-surface class-roster">
                  <div className="teacher-section-title">
                    <div><span className="section-index">{String(selectedClass.student_count).padStart(2, "0")}</span><h2>Alunos da turma</h2></div>
                  </div>
                  <form className="add-student-form" onSubmit={addStudent}>
                    <input name="student_email" type="email" placeholder="email@escola.com" required aria-label="E-mail do estudante" />
                    <button className="outline-button" disabled={busy}>Incluir</button>
                  </form>
                  <div className="roster-list">
                    {selectedClass.students?.length ? selectedClass.students.map((student) => (
                      <button
                        key={student.id}
                        className={`roster-row ${selectedStudentId === student.id ? "selected" : ""}`}
                        onClick={() => setSelectedStudentId(student.id)}
                      >
                        <Avatar name={student.full_name} />
                        <span><strong>{student.full_name}</strong><small>{student.grade}</small></span>
                        <Difficulty level={student.difficulty} tone={student.difficulty === "Alta" ? "high" : student.difficulty === "Média" ? "medium" : "low"} />
                      </button>
                    )) : <p className="teacher-empty">A turma ainda não possui estudantes.</p>}
                  </div>
                </section>
                <section className="teacher-surface student-insight">
                  {selectedStudent ? (
                    <>
                      <div className="student-insight-head">
                        <div><Avatar name={selectedStudent.full_name} /><span><h2>{selectedStudent.full_name}</h2><small>{selectedStudent.grade}</small></span></div>
                        <button className="text-button danger-text" onClick={() => void removeStudent(selectedStudent.id)}>Remover da turma</button>
                      </div>
                      <div className="student-number-line">
                        <div><span>Acertos</span><strong>{selectedStudent.accuracy}%</strong></div>
                        <div><span>Tentativas</span><strong>{selectedStudent.attempts}</strong></div>
                        <div><span>Tempo</span><strong>{selectedStudent.time_minutes} min</strong></div>
                        <div><span>Aulas feitas</span><strong>{selectedStudent.completed_lessons}</strong></div>
                      </div>
                      <div className="insight-chart-block">
                        <div><h3>Trilha de dificuldade</h3><small>Quanto menor a barra, melhor a evolução.</small></div>
                        <DifficultyTrend points={selectedStudent.trend} />
                      </div>
                      <div className="student-history">
                        <h3>Histórico recente</h3>
                        {selectedStudent.recent_attempts.map((attempt, index) => (
                          <div key={`${attempt.answered_at}-${index}`}>
                            <span className={attempt.correct ? "history-dot success" : "history-dot warning"} />
                            <strong>{attempt.topic}</strong>
                            <small>{attempt.correct ? "Acertou" : "Precisa revisar"} · {attempt.answered_at.slice(0, 10)}</small>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : <p className="teacher-empty">Selecione um estudante para abrir o histórico.</p>}
                </section>
              </div>
            </div>
          )}

          {activeTab === "reports" && (
            <section className="teacher-surface report-studio">
              <div className="report-copy">
                <p className="eyebrow">EXPORTAÇÃO SEGURA</p>
                <h2>Relatório da turma</h2>
                <p>Baixe acertos, tentativas, dificuldade e tempo de estudo da turma selecionada. O arquivo não inclui senhas nem dados de outras disciplinas.</p>
              </div>
              <div className="report-preview">
                <span>RELATÓRIO ATUAL</span>
                <strong>{selectedClass.name}</strong>
                <small>{selectedClass.student_count} estudantes · {overview.subject}</small>
                <button className="primary-button" onClick={() => void exportReport()}>Exportar CSV</button>
              </div>
            </section>
          )}

          {activeTab === "contents" && (
            <div className="content-studio">
              <section className="teacher-surface">
                <div className="teacher-section-title"><div><span className="section-index">01</span><h2>Novo conteúdo</h2></div></div>
                <form className="teacher-form" onSubmit={createContent}>
                  <label>TÍTULO<input name="title" minLength={2} maxLength={120} required /></label>
                  <label>DESCRIÇÃO<textarea name="description" maxLength={1000} rows={4} /></label>
                  <div className="teacher-form-row">
                    <label>TIPO<select name="content_type"><option value="lesson">Aula</option><option value="exercise">Exercício</option><option value="video">Vídeo</option><option value="link">Link</option></select></label>
                    <label>LINK<input name="source_url" type="url" placeholder="https://" /></label>
                  </div>
                  <button className="primary-button" disabled={busy}>Salvar conteúdo</button>
                </form>
                <form className="content-import" onSubmit={importContents}>
                  <label>IMPORTAR CSV OU JSON<input name="content_file" type="file" accept=".csv,.json" required /></label>
                  <button className="outline-button" disabled={busy}>Importar arquivo</button>
                </form>
              </section>
              <section className="teacher-surface content-library">
                <div className="teacher-section-title"><div><span className="section-index">{String(contents.length).padStart(2, "0")}</span><h2>Biblioteca da disciplina</h2></div></div>
                {contents.map((content) => (
                  <article key={content.id}>
                    <span>{content.content_type}</span>
                    <strong>{content.title}</strong>
                    <p>{content.description || "Sem descrição."}</p>
                    {content.source_url && <a href={content.source_url} target="_blank" rel="noreferrer">Abrir material</a>}
                  </article>
                ))}
              </section>
            </div>
          )}

          {activeTab === "ai" && (
            <section className="ai-studio">
              <div className="ai-brief">
                <p className="eyebrow">APOIO PEDAGÓGICO</p>
                <h2>Transforme dados em uma próxima aula possível.</h2>
                <p>A IA recebe somente métricas da turma ou do aluno escolhido, sem nomes e sem conteúdo de outras disciplinas.</p>
                <label>TURMA<select value={selectedClassId} onChange={(event) => setSelectedClassId(event.target.value)}>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                <label>FOCO<select value={selectedStudentId} onChange={(event) => setSelectedStudentId(event.target.value)}><option value="">Turma inteira</option>{selectedClass.students?.map((student) => <option key={student.id} value={student.id}>{student.full_name}</option>)}</select></label>
                <button className="primary-button" onClick={() => void requestRecommendation()} disabled={busy || !selectedClassId}>{busy ? "Analisando..." : "Gerar recomendação"}</button>
              </div>
              <article className="ai-result" aria-live="polite">
                {recommendation ? (
                  <>
                    <span className="ai-result-label">RECOMENDAÇÃO PRONTA</span>
                    <h3>{recommendation.objective}</h3>
                    <p>{recommendation.diagnosis}</p>
                    <ol>{recommendation.actions.map((action) => <li key={action}>{action}</li>)}</ol>
                    <div><strong>Conteúdo sugerido</strong><p>{recommendation.content_suggestion}</p></div>
                  </>
                ) : (
                  <div className="ai-empty"><span>IA</span><h3>O plano da próxima intervenção aparece aqui.</h3><p>Escolha uma turma ou estudante e gere uma recomendação.</p></div>
                )}
              </article>
            </section>
          )}
        </section>
      </div>
    </main>
  );
}

/** Barras deixam a evolução legível sem depender de uma biblioteca pesada de gráficos. */
function DifficultyTrend({ points }: { points: TrendPoint[] }) {
  if (!points.length) return <p className="teacher-empty">Ainda não há tentativas suficientes para formar o gráfico.</p>;
  return (
    <div className="difficulty-trend" role="img" aria-label="Gráfico da dificuldade por semana">
      {points.map((point) => (
        <div className="trend-column" key={point.week} title={`${point.week}: dificuldade ${point.difficulty_score}%`}>
          <span className="trend-value">{point.difficulty_score}%</span>
          <span className="trend-bar-track"><span className="trend-bar" style={{ height: `${Math.max(8, point.difficulty_score)}%` }} /></span>
          <small>{point.week.replace(/^\d{4}-/, "")}</small>
        </div>
      ))}
    </div>
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
