import { CSSProperties, FormEvent, useEffect, useState } from "react";
import FallbackAvatar, { type AvatarKey } from "./components/FallbackAvatar";
import { accessToken, apiUrl, isSupabaseConfigured, supabase } from "./lib/supabase";

// As visualizações funcionam como uma navegação leve para este protótipo.
type View = "login" | "signup" | "student" | "teacher" | "teacher-pending" | "admin" | "practice";
type Role = "student" | "teacher" | "admin";
type SignupRole = Extract<Role, "student" | "teacher">;
type AccentTheme = "wine" | "ocean" | "forest" | "amber";
type LoginSessionPayload = {
  access_token?: string;
  refresh_token?: string;
  detail?: string;
};
type UserProfile = {
  id?: string;
  name: string;
  email: string;
  grade: string;
  goal: string;
  role: Role;
  registrationStatus?: "active" | "pending_teacher";
  requestedSubject?: string;
  avatarKey: AvatarKey;
  featuredBadgeId: string | null;
  accentTheme: AccentTheme;
  profileSetupComplete: boolean;
};

const avatarOptions: { id: AvatarKey; label: string }[] = [
  { id: "orbit", label: "Órbita" },
  { id: "spark", label: "Faísca" },
  { id: "books", label: "Cadernos" },
  { id: "prism", label: "Prisma" },
  { id: "trail", label: "Trilha" },
];

const accentOptions: { id: AccentTheme; label: string; color: string }[] = [
  { id: "wine", label: "Vinho", color: "#c7193b" },
  { id: "ocean", label: "Oceano", color: "#176b87" },
  { id: "forest", label: "Floresta", color: "#2f6f4e" },
  { id: "amber", label: "Âmbar", color: "#995216" },
];

function applyAccentTheme(theme: AccentTheme) {
  document.documentElement.dataset.accent = theme;
}

// Dados de demonstração permitem apresentar o TCC sem serviços externos.
const initialProfile: UserProfile = {
  name: "Diogo Mendes Baptista",
  email: "diogo@email.com",
  grade: "Graduação",
  goal: "Reforçar meus estudos",
  role: "student",
  avatarKey: "orbit",
  featuredBadgeId: null,
  accentTheme: "wine",
  profileSetupComplete: false,
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
    { id: "first_lesson", title: "Primeiro passo", description: "Concluiu sua primeira aula.", icon: "🌱" },
    { id: "study_streak", title: "Ritmo de estudo", description: "Estudou por 3 dias seguidos.", icon: "🔥" },
    { id: "ten_correct_answers", title: "Mente afiada", description: "Acertou 10 questões.", icon: "🎯" },
    { id: "excellent_accuracy", title: "Em ótima fase", description: "Chegou a 80% de acertos.", icon: "⭐" },
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

type TeacherRegistrationRequest = {
  id: string;
  full_name: string;
  email: string;
  requested_subject: string;
  created_at: string;
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

const emptyTeacherClass: TeacherClass = {
  id: "",
  name: "Nenhuma turma selecionada",
  school_year: "",
  subject: "",
  student_count: 0,
  students: [],
  trend: [],
};

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

  useEffect(() => applyAccentTheme(profile.accentTheme), [profile.accentTheme]);

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
      .select("id,email,full_name,role,grade,goal,registration_status,requested_subject,avatar_key,featured_badge_id,accent_theme,profile_setup_complete")
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
      registrationStatus: data.registration_status,
      requestedSubject: data.requested_subject || undefined,
      avatarKey: (data.avatar_key || "orbit") as AvatarKey,
      featuredBadgeId: data.featured_badge_id || null,
      accentTheme: (data.accent_theme || "wine") as AccentTheme,
      profileSetupComplete: Boolean(data.profile_setup_complete),
    });
    setView(data.registration_status === "pending_teacher" ? "teacher-pending" : role);
    setAuthMessage("");
    setAuthLoading(false);
  }

  /** Passa pelo backend para aplicar o limite antes de criar a sessão Supabase. */
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
    try {
      const loginResponse = await fetch(`${apiUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: String(data.get("email")),
          password: String(data.get("password")),
        }),
      });
      const payload = (await loginResponse.json().catch(() => ({}))) as LoginSessionPayload;
      if (!loginResponse.ok) {
        if (loginResponse.status === 429) {
          const seconds = Number(loginResponse.headers.get("Retry-After") || 900);
          const minutes = Math.max(1, Math.ceil(seconds / 60));
          setAuthMessage(`Limite de tentativas atingido. Tente novamente em ${minutes} minuto${minutes === 1 ? "" : "s"}.`);
        } else if (loginResponse.status >= 500) {
          setAuthMessage("O login está temporariamente indisponível. Tente novamente mais tarde.");
        } else {
          setAuthMessage("E-mail ou senha inválidos.");
        }
        setAuthLoading(false);
        return;
      }
      if (!payload.access_token || !payload.refresh_token) {
        setAuthMessage("O login está temporariamente indisponível. Tente novamente mais tarde.");
        setAuthLoading(false);
        return;
      }
      const { error } = await supabase.auth.setSession({
        access_token: payload.access_token,
        refresh_token: payload.refresh_token,
      });
      if (error) {
        setAuthMessage("Não foi possível abrir sua sessão. Tente novamente.");
        setAuthLoading(false);
      }
    } catch {
      setAuthMessage("Não foi possível conectar ao servidor. Tente novamente.");
      setAuthLoading(false);
    }
  }

  /** Mantém professor como solicitação até a administradora confirmar a disciplina. */
  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setAuthMessage("");
    setAuthLoading(true);
    const requestedRole = String(data.get("role") || "student") as SignupRole;
    const requestedSubject = String(data.get("subject") || "");
    const nextProfile: UserProfile = {
      name: String(data.get("name") || initialProfile.name),
      email: String(data.get("email") || initialProfile.email),
      grade: requestedRole === "student" ? String(data.get("grade") || "Ensino Médio") : "Professor",
      goal: "Reforçar meus estudos",
      role: requestedRole,
      avatarKey: "orbit",
      featuredBadgeId: null,
      accentTheme: "wine",
      profileSetupComplete: requestedRole !== "student",
    };
    if (!supabase) {
      // No modo de apresentação não existe permissão real; o atalho serve apenas
      // para conferir a experiência de cada perfil no navegador local.
      setProfile(nextProfile);
      setView(requestedRole);
      setAuthLoading(false);
      return;
    }
    const { data: signUpData, error } = await supabase.auth.signUp({
      email: nextProfile.email,
      password: String(data.get("password")),
      options: {
        data: {
          full_name: nextProfile.name,
          grade: nextProfile.grade,
          requested_role: requestedRole === "teacher" ? "teacher" : undefined,
          requested_subject: requestedRole === "teacher" ? requestedSubject : undefined,
        },
      },
    });
    if (error) {
      setAuthMessage(error.message);
      setAuthLoading(false);
      return;
    }
    if (requestedRole === "teacher") {
      // Mesmo quando a confirmação de e-mail está desativada, a pessoa não fica
      // autenticada como estudante enquanto aguarda a análise do cadastro.
      if (signUpData.session) await supabase.auth.signOut();
      setAuthMessage("Solicitação de professor enviada. Após a aprovação da administradora, entre com este e-mail e senha.");
      setView("login");
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
    setProfile(initialProfile);
    applyAccentTheme("wine");
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
        onProfileChange={setProfile}
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
  if (view === "teacher-pending")
    return profile.registrationStatus === "pending_teacher" ? (
      <TeacherPending profile={profile} onLogout={logout} />
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

/** Explica o próximo passo sem liberar ferramentas docentes antes da aprovação. */
function TeacherPending({ profile, onLogout }: { profile: UserProfile; onLogout: () => void }) {
  return (
    <main className="profile-page">
      <Header area="CADASTRO DE PROFESSOR" onLogout={onLogout} />
      <section className="profile-content narrow pending-teacher-page">
        <span className="pending-seal" aria-hidden="true">P</span>
        <p className="eyebrow">SOLICITAÇÃO RECEBIDA</p>
        <h1>Seu espaço docente está quase pronto.</h1>
        <p className="subtitle">
          A administradora precisa confirmar seu cadastro em {profile.requestedSubject || "sua disciplina"}. Depois disso, este mesmo login abre o painel de turmas, conteúdos e relatórios.
        </p>
        <div className="pending-steps" aria-label="Etapas do cadastro de professor">
          <span className="done"><strong>1</strong> Solicitação enviada</span>
          <span className="current"><strong>2</strong> Validação da disciplina</span>
          <span><strong>3</strong> Painel liberado</span>
        </div>
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
function Avatar({
  name,
  className = "",
  avatarKey = "orbit",
  size = 38,
}: {
  name: string;
  className?: string;
  avatarKey?: AvatarKey;
  size?: number;
}) {
  return (
    <FallbackAvatar
      name={name}
      avatarKey={avatarKey}
      className={className}
      size={size}
    />
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

/** Separa a jornada de estudante da solicitação docente sem confiar no navegador. */
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
  const [selectedRole, setSelectedRole] = useState<SignupRole>("student");

  return (
    <>
      <h1>Crie sua conta</h1>
      <p className="subtitle">
        {selectedRole === "student"
          ? "Comece sua jornada e acompanhe seu progresso em cada matéria."
          : "Solicite seu acesso para acompanhar uma disciplina e suas turmas."}
      </p>
      <form onSubmit={onSubmit} className="auth-form">
        <fieldset className="account-type-picker">
          <legend>COMO VOCÊ VAI USAR O APRENDEIA?</legend>
          <label className={selectedRole === "student" ? "account-type active" : "account-type"}>
            <input
              type="radio"
              name="role"
              value="student"
              checked={selectedRole === "student"}
              onChange={() => setSelectedRole("student")}
            />
            <span aria-hidden="true">A</span>
            <strong>Aluno</strong>
            <small>Estudar e praticar</small>
          </label>
          <label className={selectedRole === "teacher" ? "account-type active" : "account-type"}>
            <input
              type="radio"
              name="role"
              value="teacher"
              checked={selectedRole === "teacher"}
              onChange={() => setSelectedRole("teacher")}
            />
            <span aria-hidden="true">P</span>
            <strong>Professor</strong>
            <small>Gerenciar turmas</small>
          </label>
        </fieldset>
        <label>
          NOME COMPLETO
          <input name="name" placeholder="Ex: Maria Silva" autoComplete="name" required />
        </label>
        {selectedRole === "student" ? (
          <label>
            GRAU DE ESCOLARIDADE
            <select name="grade" defaultValue="" required>
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
        ) : (
          <label>
            DISCIPLINA
            <select name="subject" defaultValue="" required>
              <option value="" disabled>
                Selecione sua disciplina...
              </option>
              {subjects.map((subject) => (
                <option key={subject.name} value={subject.name}>{subject.name}</option>
              ))}
            </select>
          </label>
        )}
        <label>
          E-MAIL
          <input
            name="email"
            type="email"
            placeholder="seuemail@exemplo.com"
            autoComplete="email"
            required
          />
        </label>
        <label>
          SENHA
          <input
            name="password"
            type="password"
            placeholder="Crie uma senha"
            autoComplete="new-password"
            required
            minLength={8}
          />
        </label>
        {selectedRole === "teacher" && (
          <p className="registration-note">
            Seu painel é liberado depois que a administradora confirma o cadastro e a disciplina. Sua senha fica protegida pelo Supabase e não é salva no banco do AprendeIA.
          </p>
        )}
        {message && (
          <p className="form-message" role="status">
            {message}
          </p>
        )}
        <button className="primary-button" type="submit" disabled={loading}>
          {loading
            ? "Enviando..."
            : selectedRole === "teacher"
              ? "Solicitar acesso de professor"
              : "Criar conta de aluno"}
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
  onProfileChange,
  onLogout,
  onPractice,
}: {
  profile: UserProfile;
  onProfileChange: (profile: UserProfile) => void;
  onLogout: () => void;
  onPractice: (subject?: string) => void;
}) {
  const [gamification, setGamification] = useState<GamificationSummary | null>(
    isSupabaseConfigured ? null : demoGamification,
  );
  const [gamificationError, setGamificationError] = useState("");
  const [subjectQuery, setSubjectQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("Todas");
  const [isEditingProfile, setIsEditingProfile] = useState(!profile.profileSetupComplete);

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

  if (isEditingProfile) {
    return (
      <main className="profile-page">
        <Header area="PERSONALIZAR PERFIL" onLogout={onLogout} />
        <ProfileSetup
          profile={profile}
          achievements={gamification?.achievements ?? []}
          canCancel={profile.profileSetupComplete}
          onCancel={() => {
            applyAccentTheme(profile.accentTheme);
            setIsEditingProfile(false);
          }}
          onSave={(nextProfile) => {
            onProfileChange(nextProfile);
            setIsEditingProfile(false);
          }}
        />
      </main>
    );
  }

  return (
    <main className="profile-page">
      <Header area="ÁREA DO ESTUDANTE" onLogout={onLogout} />
      <section className="profile-content">
        <section className="student-hero" aria-labelledby="student-name">
          <div className="student-avatar-column">
            <div className="student-avatar-wrap">
              <Avatar
                name={profile.name}
                avatarKey={profile.avatarKey}
                className="student-avatar"
                size={104}
              />
              {gamification?.achievements.find(
                (achievement) => achievement.id === profile.featuredBadgeId,
              ) && (
                <span className="featured-badge" title="Insígnia em destaque">
                  {
                    gamification.achievements.find(
                      (achievement) => achievement.id === profile.featuredBadgeId,
                    )?.icon
                  }
                </span>
              )}
            </div>
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
            <button
              type="button"
              className="profile-edit-button"
              onClick={() => setIsEditingProfile(true)}
            >
              Personalizar perfil
            </button>
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

/**
 * Junta as escolhas visuais em uma única etapa curta. A prévia usa o mesmo
 * componente de avatar que aparece depois no painel.
 */
function ProfileSetup({
  profile,
  achievements,
  canCancel,
  onCancel,
  onSave,
}: {
  profile: UserProfile;
  achievements: Achievement[];
  canCancel: boolean;
  onCancel: () => void;
  onSave: (profile: UserProfile) => void;
}) {
  const initialBadge = achievements.some(
    (achievement) => achievement.id === profile.featuredBadgeId,
  )
    ? profile.featuredBadgeId
    : null;
  const [avatarKey, setAvatarKey] = useState<AvatarKey>(profile.avatarKey);
  const [featuredBadgeId, setFeaturedBadgeId] = useState<string | null>(initialBadge);
  const [accentTheme, setAccentTheme] = useState<AccentTheme>(profile.accentTheme);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const featuredBadge = achievements.find(
    (achievement) => achievement.id === featuredBadgeId,
  );

  // A troca aparece na hora para o estudante decidir olhando o resultado real.
  useEffect(() => applyAccentTheme(accentTheme), [accentTheme]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      if (isSupabaseConfigured) {
        const response = await apiFetch("/student/profile-personalization", {
          method: "PUT",
          body: JSON.stringify({
            avatar_key: avatarKey,
            featured_badge_id: featuredBadgeId,
            accent_theme: accentTheme,
          }),
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { detail?: string };
          throw new Error(payload.detail || "Não foi possível salvar sua personalização.");
        }
      }
      onSave({
        ...profile,
        avatarKey,
        featuredBadgeId,
        accentTheme,
        profileSetupComplete: true,
      });
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar sua personalização.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="profile-content narrow profile-setup-page" aria-labelledby="profile-setup-title">
      <header className="profile-setup-heading">
        <p className="eyebrow">SEU PERFIL, SEU JEITO</p>
        <h1 id="profile-setup-title">Escolha como você aparece.</h1>
        <p>
          Monte seu avatar, destaque uma conquista e escolha a cor que acompanha
          sua jornada.
        </p>
      </header>

      <div className="profile-setup-layout">
        <aside className="profile-preview" aria-label="Prévia do perfil">
          <div className="profile-preview-avatar">
            <FallbackAvatar name={profile.name} avatarKey={avatarKey} size={128} />
            {featuredBadge && (
              <span className="featured-badge preview-badge" title={featuredBadge.title}>
                {featuredBadge.icon}
              </span>
            )}
          </div>
          <strong>{profile.name}</strong>
          <span>{profile.grade}</span>
          <small>
            {featuredBadge ? `Em destaque: ${featuredBadge.title}` : "Sem insígnia em destaque"}
          </small>
        </aside>

        <form className="profile-setup-form" onSubmit={saveProfile}>
          <fieldset className="profile-choice-group">
            <legend>Escolha seu avatar</legend>
            <div className="avatar-picker">
              {avatarOptions.map((option) => (
                <label
                  className={avatarKey === option.id ? "avatar-option selected" : "avatar-option"}
                  key={option.id}
                >
                  <input
                    type="radio"
                    name="avatar"
                    value={option.id}
                    checked={avatarKey === option.id}
                    onChange={() => setAvatarKey(option.id)}
                  />
                  <FallbackAvatar name={profile.name} avatarKey={option.id} size={48} />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="profile-choice-group">
            <legend>Insígnia em destaque</legend>
            <p className="choice-help">Você só pode usar conquistas que já desbloqueou.</p>
            <div className="badge-picker">
              <label className={featuredBadgeId === null ? "badge-option selected" : "badge-option"}>
                <input
                  type="radio"
                  name="badge"
                  checked={featuredBadgeId === null}
                  onChange={() => setFeaturedBadgeId(null)}
                />
                <span aria-hidden="true">○</span>
                <strong>Sem destaque</strong>
              </label>
              {achievements.map((achievement) => (
                <label
                  className={featuredBadgeId === achievement.id ? "badge-option selected" : "badge-option"}
                  key={achievement.id}
                >
                  <input
                    type="radio"
                    name="badge"
                    value={achievement.id}
                    checked={featuredBadgeId === achievement.id}
                    onChange={() => setFeaturedBadgeId(achievement.id)}
                  />
                  <span aria-hidden="true">{achievement.icon}</span>
                  <strong>{achievement.title}</strong>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="profile-choice-group">
            <legend>Cor de destaque</legend>
            <div className="accent-picker">
              {accentOptions.map((option) => (
                <label
                  className={accentTheme === option.id ? "accent-option selected" : "accent-option"}
                  key={option.id}
                >
                  <input
                    type="radio"
                    name="accent"
                    value={option.id}
                    checked={accentTheme === option.id}
                    onChange={() => setAccentTheme(option.id)}
                  />
                  <span style={{ backgroundColor: option.color }} aria-hidden="true" />
                  <strong>{option.label}</strong>
                </label>
              ))}
            </div>
          </fieldset>

          {message && <p className="form-message" role="alert">{message}</p>}
          <div className="profile-setup-actions">
            {canCancel && (
              <button type="button" className="outline-button" onClick={onCancel} disabled={saving}>
                Cancelar
              </button>
            )}
            <button type="submit" className="primary-button" disabled={saving}>
              {saving ? "Salvando..." : "Salvar perfil"}
            </button>
          </div>
        </form>
      </div>
    </section>
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
  const [overview, setOverview] = useState<TeacherOverview>(
    supabase
      ? { subject: "Sua disciplina", class_count: 0, student_count: 0, active_alerts: 0, average_accuracy: 0 }
      : { subject: "Matemática", class_count: 2, student_count: 2, active_alerts: 1, average_accuracy: 60 },
  );
  const [classes, setClasses] = useState<TeacherClass[]>(supabase ? [] : demoTeacherClasses);
  const [selectedClassId, setSelectedClassId] = useState(supabase ? "" : demoTeacherClasses[0].id);
  const [selectedClass, setSelectedClass] = useState<TeacherClass>(supabase ? emptyTeacherClass : demoTeacherClasses[0]);
  const [selectedStudentId, setSelectedStudentId] = useState(supabase ? "" : demoTeacherStudents[0].id);
  const [alerts, setAlerts] = useState<TeacherAlert[]>(supabase ? [] : demoTeacherAlerts);
  const [contents, setContents] = useState<TeacherContent[]>(supabase ? [] : demoTeacherContents);
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
        if (!nextClasses.length) {
          setSelectedClass(emptyTeacherClass);
          setSelectedStudentId("");
        }
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
              <nav className="teacher-quick-actions" aria-label="Atalhos do painel">
                <button onClick={() => setActiveTab("classes")}>
                  <span>01</span><strong>Organizar turmas</strong><small>Crie uma turma e inclua alunos</small>
                </button>
                <button onClick={() => setActiveTab("contents")}>
                  <span>02</span><strong>Adicionar conteúdo</strong><small>Publique ou importe materiais</small>
                </button>
                <button onClick={() => setActiveTab("reports")}>
                  <span>03</span><strong>Exportar relatório</strong><small>Baixe o resumo da turma em CSV</small>
                </button>
              </nav>
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
                    {!classes.length && <option value="">Crie sua primeira turma</option>}
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
                    <input name="student_email" type="email" placeholder="email@escola.com" required disabled={!selectedClassId} aria-label="E-mail do estudante" />
                    <button className="outline-button" disabled={busy || !selectedClassId}>Incluir</button>
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
                <button className="primary-button" onClick={() => void exportReport()} disabled={!selectedClassId}>Exportar CSV</button>
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
  const [people, setPeople] = useState(
    supabase
      ? []
      : [
          { name: "Ana Souza", role: "Estudante" },
          { name: "Prof. Carlos Lima", role: "Professor" },
        ],
  );
  const [teacherRequests, setTeacherRequests] = useState<TeacherRegistrationRequest[]>([]);
  const [message, setMessage] = useState("");
  const [selectedRole, setSelectedRole] = useState<"student" | "teacher">("student");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadTeacherRequests() {
      if (!supabase) return;
      const response = await apiFetch("/admin/teacher-requests");
      if (!active) return;
      if (!response.ok) {
        setMessage("Não foi possível carregar as solicitações de professor.");
        return;
      }
      setTeacherRequests((await response.json()) as TeacherRegistrationRequest[]);
    }
    void loadTeacherRequests();
    return () => {
      active = false;
    };
  }, []);

  /** Envia dados ao servidor, onde o token e o cargo de admin são verificados. */
  async function addPerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setMessage("");
    const name = String(data.get("name"));
    const role = String(data.get("role")) as Role;
    const label = role === "teacher" ? "Professor" : "Estudante";
    setBusy(true);
    try {
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
      setPeople((current) => [...current, { name, role: label }]);
      setMessage("Usuário incluído com sucesso.");
      form.reset();
    } finally {
      setBusy(false);
    }
  }

  /** Aprova o pedido sem receber ou redefinir a senha escolhida pelo professor. */
  async function approveTeacherRequest(event: FormEvent<HTMLFormElement>, request: TeacherRegistrationRequest) {
    event.preventDefault();
    const subject = String(new FormData(event.currentTarget).get("subject"));
    setBusy(true);
    setMessage("");
    try {
      const response = await apiFetch(`/admin/teacher-requests/${request.id}/approve`, {
        method: "POST",
        body: JSON.stringify({ subject }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        setMessage(detail.detail || "Não foi possível aprovar o cadastro.");
        return;
      }
      setTeacherRequests((current) => current.filter((item) => item.id !== request.id));
      setPeople((current) => [...current, { name: request.full_name, role: "Professor" }]);
      setMessage(`Cadastro de ${request.full_name} aprovado em ${subject}.`);
    } finally {
      setBusy(false);
    }
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
        <section className="teacher-request-queue" aria-labelledby="teacher-requests-title">
          <div className="request-queue-heading">
            <div>
              <p className="eyebrow">APROVAÇÃO DOCENTE</p>
              <h2 id="teacher-requests-title">Solicitações de professores</h2>
            </div>
            <span>{teacherRequests.length} pendente(s)</span>
          </div>
          {teacherRequests.length ? (
            <div className="teacher-request-list">
              {teacherRequests.map((request) => (
                <article className="teacher-request-row" key={request.id}>
                  <Avatar name={request.full_name} />
                  <div>
                    <strong>{request.full_name}</strong>
                    <small>{request.email}</small>
                  </div>
                  <form onSubmit={(event) => void approveTeacherRequest(event, request)}>
                    <label>
                      <span className="sr-only">Disciplina de {request.full_name}</span>
                      <select name="subject" defaultValue={request.requested_subject} required>
                        {subjects.map((subject) => (
                          <option key={subject.name} value={subject.name}>{subject.name}</option>
                        ))}
                      </select>
                    </label>
                    <button className="outline-button" disabled={busy}>Aprovar</button>
                  </form>
                </article>
              ))}
            </div>
          ) : (
            <p className="teacher-empty">Nenhuma solicitação aguardando aprovação.</p>
          )}
        </section>
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
                  <select name="subject" defaultValue="" required aria-describedby="subject-help">
                    <option value="" disabled>Selecione...</option>
                    {subjects.map((subject) => (
                      <option key={subject.name} value={subject.name}>{subject.name}</option>
                    ))}
                  </select>
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
              <button className="primary-button" disabled={busy}>Adicionar usuário</button>
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
