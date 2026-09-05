import { FormEvent, useState } from 'react'

type View = 'login' | 'signup' | 'student' | 'teacher' | 'admin' | 'practice'
type Role = 'student' | 'teacher' | 'admin'
const initialProfile = { name: 'Diogo Mendes Baptista', email: 'diogo@email.com', grade: 'Graduação', goal: 'Reforçar meus estudos' }
const subjects = [
  { name: 'Matemática', module: 'Frações e porcentagens', completed: 5, total: 8, difficulty: 'Alta', tone: 'high' },
  { name: 'Português', module: 'Interpretação de texto', completed: 4, total: 6, difficulty: 'Média', tone: 'medium' },
  { name: 'Ciências', module: 'Sistema solar', completed: 6, total: 6, difficulty: 'Baixa', tone: 'low' },
]
const students = [
  { name: 'Ana Souza', grade: '8º ano', subject: 'Matemática', time: '2h 35min', difficulty: 'Alta', tone: 'high' },
  { name: 'Bruno Lima', grade: '8º ano', subject: 'Português', time: '1h 45min', difficulty: 'Média', tone: 'medium' },
  { name: 'Carla Reis', grade: '9º ano', subject: 'Ciências', time: '3h 10min', difficulty: 'Baixa', tone: 'low' },
]

export default function App() {
  const [view, setView] = useState<View>('login')
  const [profile, setProfile] = useState(initialProfile)
  const enter = (role: Role) => setView(role)
  function handleLogin(event: FormEvent<HTMLFormElement>) { event.preventDefault(); enter(String(new FormData(event.currentTarget).get('role')) as Role) }
  function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget)
    setProfile({ name: String(data.get('name') || initialProfile.name), email: String(data.get('email') || initialProfile.email), grade: String(data.get('grade') || 'Ensino Médio'), goal: 'Reforçar meus estudos' }); setView('student')
  }
  const logout = () => setView('login')
  if (view === 'student') return <StudentProfile profile={profile} onLogout={logout} onPractice={() => setView('practice')} />
  if (view === 'practice') return <PracticeProfile onBack={() => setView('student')} onLogout={logout} />
  if (view === 'teacher') return <TeacherProfile onLogout={logout} />
  if (view === 'admin') return <AdminProfile onLogout={logout} />
  return <main className="page-shell"><section className="auth-card"><Brand />{view === 'login' ? <Login onSubmit={handleLogin} onSignup={() => setView('signup')} /> : <Signup onSubmit={handleSignup} onLogin={() => setView('login')} />}</section></main>
}

function Brand() { return <div className="brand"><span className="brand-mark"><span /></span><span>aprendeIA</span></div> }
function Header({ onLogout, area }: { onLogout: () => void, area: string }) { return <header className="topbar"><Brand /><span className="area-name">{area}</span><button className="logout" onClick={onLogout}>Sair</button></header> }
function Avatar({ name }: { name: string }) { return <span className="small-avatar">{name.split(' ').map((word) => word[0]).slice(0, 2).join('')}</span> }

function Login({ onSubmit, onSignup }: { onSubmit: (e: FormEvent<HTMLFormElement>) => void, onSignup: () => void }) {
  return <><h1>Bem-vindo de volta</h1><p className="subtitle">Entre para continuar sua jornada de aprendizagem.</p><form onSubmit={onSubmit} className="auth-form">
    <label>E-MAIL<input name="email" type="email" placeholder="seuemail@exemplo.com" required /></label><label>SENHA<div className="password-field"><input name="password" type="password" placeholder="Digite sua senha" required /><button type="button" aria-label="Mostrar senha">◉</button></div></label>
    <label>ACESSAR COMO<select name="role" defaultValue="student"><option value="student">Estudante</option><option value="teacher">Professor</option><option value="admin">Administradora</option></select></label>
    <div className="form-row"><label className="check"><input type="checkbox" /><span>Lembrar de mim</span></label><a href="#forgot" onClick={(e) => e.preventDefault()}>Esqueci minha senha</a></div><button className="primary-button" type="submit">Entrar</button>
  </form><p className="switch-copy">Ainda não tem uma conta? <button className="text-button" onClick={onSignup}>Crie sua conta</button></p></>
}
function Signup({ onSubmit, onLogin }: { onSubmit: (e: FormEvent<HTMLFormElement>) => void, onLogin: () => void }) {
  return <><h1>Crie sua conta</h1><p className="subtitle">Preencha os dados abaixo para começar.</p><form onSubmit={onSubmit} className="auth-form"><label>NOME COMPLETO<input name="name" placeholder="Ex: Maria Silva" required /></label><label>GRAU DE ESCOLARIDADE<select name="grade" defaultValue=""><option value="" disabled>Selecione...</option><option>Ensino Fundamental I</option><option>Ensino Fundamental II</option><option>Ensino Médio</option><option>Graduação</option><option>Pós-Graduação</option></select></label><label>E-MAIL<input name="email" type="email" placeholder="seuemail@exemplo.com" required /></label><label>SENHA<input name="password" type="password" placeholder="Crie uma senha" required minLength={6} /></label><button className="primary-button" type="submit">Criar conta</button></form><p className="switch-copy">Já tem uma conta? <button className="text-button" onClick={onLogin}>Faça login</button></p></>
}

function StudentProfile({ profile, onLogout, onPractice }: { profile: typeof initialProfile, onLogout: () => void, onPractice: () => void }) {
  return <main className="profile-page"><Header area="ÁREA DO ESTUDANTE" onLogout={onLogout} /><section className="profile-content"><p className="eyebrow">MEU APRENDIZADO</p><h1>Olá, {profile.name.split(' ')[0]}!</h1><p className="subtitle">Acompanhe suas matérias e continue de onde parou.</p><button className="primary-button practice-button" onClick={onPractice}>Praticar questões com IA</button><section className="section"><div className="section-heading"><h2>Minhas matérias</h2><span>Progresso dos módulos</span></div><div className="subject-grid">{subjects.map((subject) => <article className="subject-card" key={subject.name}><div><h3>{subject.name}</h3><p>{subject.module}</p></div><div className="progress-copy"><strong>{subject.completed}/{subject.total}</strong><span>aulas concluídas</span></div><div className="progress"><i style={{ width: `${subject.completed / subject.total * 100}%` }} /></div><p className="classes-left">Faltam <strong>{subject.total - subject.completed} aulas</strong> neste módulo</p></article>)}</div></section><section className="section"><div className="section-heading"><h2>Minhas dificuldades</h2><span>Identificadas pelas suas atividades</span></div><div className="difficulty-list">{subjects.map((subject) => <article className="difficulty-row" key={subject.name}><div><strong>{subject.name}</strong><span>{subject.module}</span></div><Difficulty level={subject.difficulty} tone={subject.tone} /></article>)}</div></section></section></main>
}

type Question = { id: string, subject: string, topic: string, difficulty: string, question: string, options: string[], correct_index: number, explanation: string }
const fallbackQuestion: Question = { id: 'seed-fracoes-1', subject: 'Matemática', topic: 'Frações', difficulty: 'basic', question: 'Qual fração representa a metade de uma pizza?', options: ['1/2', '1/3', '2/3', '3/4'], correct_index: 0, explanation: 'Uma metade significa dividir o todo em duas partes iguais e considerar uma delas: 1/2.' }
function PracticeProfile({ onBack, onLogout }: { onBack: () => void, onLogout: () => void }) {
  const [subject, setSubject] = useState('Matemática'); const [question, setQuestion] = useState<Question>(fallbackQuestion); const [selected, setSelected] = useState<number | null>(null); const [result, setResult] = useState<{ correct: boolean, explanation: string, next_difficulty: string } | null>(null); const [loading, setLoading] = useState(false)
  async function loadQuestion() { setLoading(true); setSelected(null); setResult(null); try { const response = await fetch(`http://localhost:8000/question-bank/next?subject=${encodeURIComponent(subject)}`); if (!response.ok) throw new Error(); setQuestion(await response.json()) } catch { setQuestion({ ...fallbackQuestion, subject }) } finally { setLoading(false) } }
  async function submit() { if (selected === null) return; try { const response = await fetch(`http://localhost:8000/question-bank/${question.id}/answer`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ selected_index: selected }) }); if (!response.ok) throw new Error(); setResult(await response.json()) } catch { setResult({ correct: selected === question.correct_index, explanation: question.explanation, next_difficulty: selected === question.correct_index ? 'intermediate' : 'basic' }) } }
  return <main className="profile-page"><Header area="PRÁTICA ADAPTATIVA" onLogout={onLogout} /><section className="profile-content narrow"><button className="back-button" onClick={onBack}>← Voltar ao perfil</button><p className="eyebrow">BANCO DE QUESTÕES</p><h1>Praticar com IA</h1><p className="subtitle">As próximas questões são ajustadas conforme suas respostas.</p><div className="practice-toolbar"><select value={subject} onChange={(event) => setSubject(event.target.value)}><option>Matemática</option><option>Português</option><option>Ciências</option></select><button className="outline-button" onClick={loadQuestion}>{loading ? 'Gerando...' : 'Nova questão'}</button></div><article className="profile-panel question-card"><span className="badge">{question.subject} · {question.topic}</span><h2>{question.question}</h2><div className="options">{question.options.map((option, index) => <button key={option} className={`option ${selected === index ? 'chosen' : ''}`} disabled={Boolean(result)} onClick={() => setSelected(index)}><b>{String.fromCharCode(65 + index)}</b>{option}</button>)}</div>{!result ? <button className="primary-button" disabled={selected === null} onClick={submit}>Verificar resposta</button> : <div className={`answer-feedback ${result.correct ? 'correct' : 'incorrect'}`}><strong>{result.correct ? 'Muito bem! Resposta correta.' : 'Vamos revisar este conteúdo.'}</strong><p>{result.explanation}</p><small>Próxima dificuldade sugerida: {result.next_difficulty === 'basic' ? 'básica' : result.next_difficulty === 'intermediate' ? 'intermediária' : 'avançada'}.</small><button className="outline-button" onClick={loadQuestion}>Próxima questão</button></div>}</article></section></main>
}

function TeacherProfile({ onLogout }: { onLogout: () => void }) {
  const [selected, setSelected] = useState(students[0])
  return <main className="profile-page"><Header area="ÁREA DO PROFESSOR" onLogout={onLogout} /><section className="profile-content"><p className="eyebrow">ACOMPANHAMENTO DE TURMA</p><h1>Visão dos estudantes</h1><p className="subtitle">Selecione um estudante para acompanhar acesso, tempo de estudo e dificuldades.</p><div className="teacher-layout"><section className="profile-panel student-list"><h2>Estudantes</h2>{students.map((student) => <button key={student.name} onClick={() => setSelected(student)} className={`student-item ${selected.name === student.name ? 'selected' : ''}`}><Avatar name={student.name} /><span><strong>{student.name}</strong><small>{student.grade}</small></span></button>)}</section><section className="profile-panel tracking-panel"><div className="selected-student"><Avatar name={selected.name} /><div><h2>{selected.name}</h2><p>{selected.grade}</p></div></div><h3>Matérias acessadas</h3><div className="access-row"><strong>{selected.subject}</strong><span>Último acesso: hoje</span></div><div className="metrics"><div><span>Tempo na matéria</span><strong>{selected.time}</strong></div><div><span>Nível de dificuldade</span><Difficulty level={selected.difficulty} tone={selected.tone} /></div></div><div className="teacher-note"><strong>Ponto de atenção</strong><p>{selected.difficulty === 'Alta' ? 'Recomendar exercícios guiados e revisão do conteúdo.' : 'Manter acompanhamento e sugerir a próxima aula do módulo.'}</p></div></section></div></section></main>
}

function AdminProfile({ onLogout }: { onLogout: () => void }) {
  const [people, setPeople] = useState([{ name: 'Ana Souza', role: 'Estudante' }, { name: 'Prof. Carlos Lima', role: 'Professor' }])
  function addPerson(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); setPeople([...people, { name: String(data.get('name')), role: String(data.get('role')) }]); event.currentTarget.reset() }
  return <main className="profile-page"><Header area="ÁREA DA ADMINISTRADORA" onLogout={onLogout} /><section className="profile-content narrow"><p className="eyebrow">GERENCIAMENTO DE USUÁRIOS</p><h1>Adicionar pessoas</h1><p className="subtitle">Inclua estudantes e professores em seus respectivos cargos.</p><div className="admin-layout"><section className="profile-panel"><h2>Novo usuário</h2><form className="auth-form compact-form" onSubmit={addPerson}><label>NOME COMPLETO<input name="name" placeholder="Ex: Maria Silva" required /></label><label>CARGO<select name="role" defaultValue="Estudante"><option>Estudante</option><option>Professor</option></select></label><button className="primary-button">Adicionar usuário</button></form></section><section className="profile-panel"><h2>Usuários incluídos</h2><div className="people-list">{people.map((person, index) => <div className="person-row" key={`${person.name}-${index}`}><Avatar name={person.name} /><strong>{person.name}</strong><span className="badge">{person.role}</span></div>)}</div></section></div></section></main>
}
function Difficulty({ level, tone }: { level: string, tone: string }) { return <span className={`difficulty ${tone}`}>{level}</span> }
