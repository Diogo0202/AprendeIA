import { FormEvent, useEffect, useState } from 'react';
import { AdminCatalog, type AdminSubject } from './AdminCatalog';
import { AdminPerformance, AdminTeachersClasses, AdminUsers, type AdminUser } from './AdminPanels';
import { AdminAdmissionPanel } from '../AdminAdmissionPanel';
import { AuditLogPanel } from './AuditLogPanel';
import { CommunicationCenter } from '../CommunicationCenter';
import { AdminPrivacyRequests } from '../PrivacyRequests';
import { NavigationDock } from '../NavigationDock';
import { LegalDocuments } from '../LegalDocuments';
import { apiError, apiFetch } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import type { Role } from '../../types/app';
import { Header, Avatar } from '../layout/Chrome';

type TeacherRegistrationRequest = {
  id: string;
  full_name: string;
  email: string;
  requested_subject: string;
  created_at: string;
};

/** Permite que apenas a administradora crie contas e atribua cargos iniciais. */
type AdminTab =
  | 'overview'
  | 'performance'
  | 'staff'
  | 'users'
  | 'activity'
  | 'messages'
  | 'content'
  | 'privacy'
  | 'legal';

const adminTabs: { id: AdminTab; label: string; glyph: string }[] = [
  { id: 'overview', label: 'Visão geral', glyph: 'VG' },
  { id: 'performance', label: 'Desempenho', glyph: 'DS' },
  { id: 'staff', label: 'Professores e turmas', glyph: 'PT' },
  { id: 'users', label: 'Usuários', glyph: 'US' },
  { id: 'activity', label: 'Atividades', glyph: 'AT' },
  { id: 'messages', label: 'Mensagens', glyph: 'MS' },
  { id: 'content', label: 'Conteúdo', glyph: 'CO' },
  { id: 'privacy', label: 'Privacidade', glyph: 'PV' },
  { id: 'legal', label: 'Termos e privacidade', glyph: 'TP' },
];

type AdminOverview = {
  users: number;
  students: number;
  teachers: number;
  admins: number;
  subjects: number;
  lessons: number;
  questions: number;
  draft_questions: number;
};

const demoAdminUsers: AdminUser[] = [
  { id: 'demo-student', full_name: 'Ana Souza', email: 'ana@escola.com', role: 'student' },
  {
    id: 'demo-teacher',
    full_name: 'Prof. Carlos Lima',
    email: 'carlos@escola.com',
    role: 'teacher',
  },
];

export function AdminProfile({ onLogout }: { onLogout: () => void }) {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [people, setPeople] = useState<AdminUser[]>(supabase ? [] : demoAdminUsers);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [activityUser, setActivityUser] = useState<{ id: string; name: string } | null>(null);
  const [adminSubjects, setAdminSubjects] = useState<AdminSubject[]>([]);
  const [teacherRequests, setTeacherRequests] = useState<TeacherRegistrationRequest[]>([]);
  const [message, setMessage] = useState('');
  const [selectedRole, setSelectedRole] = useState<'student' | 'teacher'>('student');
  const [busy, setBusy] = useState(false);

  async function loadUsers() {
    if (!supabase) return;
    const response = await apiFetch('/admin/users');
    if (response.ok) setPeople((await response.json()) as AdminUser[]);
    else setMessage(await apiError(response, 'Não foi possível carregar os usuários.'));
  }

  useEffect(() => {
    let active = true;
    async function loadAdminData() {
      if (!supabase) return;
      const [requestsResponse, usersResponse, overviewResponse] = await Promise.all([
        apiFetch('/admin/teacher-requests'),
        apiFetch('/admin/users'),
        apiFetch('/admin/overview'),
      ]);
      if (!active) return;
      if (!requestsResponse.ok || !usersResponse.ok) {
        setMessage('Não foi possível carregar os dados administrativos.');
        return;
      }
      setTeacherRequests((await requestsResponse.json()) as TeacherRegistrationRequest[]);
      setPeople((await usersResponse.json()) as AdminUser[]);
      if (overviewResponse.ok) setOverview((await overviewResponse.json()) as AdminOverview);
    }
    void loadAdminData();
    return () => {
      active = false;
    };
  }, []);

  /** Envia dados ao servidor, onde o token e o cargo de admin são verificados. */
  async function addPerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setMessage('');
    const name = String(data.get('name'));
    const role = String(data.get('role')) as Role;
    const label = role === 'teacher' ? 'Professor' : 'Estudante';
    setBusy(true);
    try {
      if (supabase) {
        const response = await apiFetch('/admin/users', {
          method: 'POST',
          body: JSON.stringify({
            name,
            email: String(data.get('email')),
            password: String(data.get('password')),
            role,
            subject: role === 'teacher' ? String(data.get('subject')) : undefined,
          }),
        });
        if (!response.ok) {
          const detail = await response.json().catch(() => ({}));
          setMessage(detail.detail || 'Não foi possível incluir o usuário.');
          return;
        }
      }
      if (supabase) await loadUsers();
      else
        setPeople((current) => [
          ...current,
          { id: `demo-${current.length}`, full_name: name, email: String(data.get('email')), role },
        ]);
      setMessage(`${label} incluído com sucesso.`);
      form.reset();
    } finally {
      setBusy(false);
    }
  }

  /** Aprova o pedido sem receber ou redefinir a senha escolhida pelo professor. */
  async function approveTeacherRequest(
    event: FormEvent<HTMLFormElement>,
    request: TeacherRegistrationRequest,
  ) {
    event.preventDefault();
    const subject = String(new FormData(event.currentTarget).get('subject'));
    setBusy(true);
    setMessage('');
    try {
      const response = await apiFetch(`/admin/teacher-requests/${request.id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ subject }),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        setMessage(detail.detail || 'Não foi possível aprovar o cadastro.');
        return;
      }
      setTeacherRequests((current) => current.filter((item) => item.id !== request.id));
      await loadUsers();
      setMessage(`Cadastro de ${request.full_name} aprovado em ${subject}.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main id="main-content" tabIndex={-1} className="profile-page teacher-workspace">
      <Header area="ÁREA DA ADMINISTRADORA" onLogout={onLogout} />
      <div className="teacher-app-shell">
        <aside className="teacher-sidebar" aria-label="Navegação da administração">
          <NavigationDock
            ariaLabel="Navegação da administração"
            items={adminTabs.map((tab) => ({
              id: tab.id,
              label: tab.label,
              glyph: tab.glyph,
              active: activeTab === tab.id,
              onSelect: () => setActiveTab(tab.id),
            }))}
          />
          <div className="teacher-privacy-note">
            <strong>Privacidade ativa</strong>
            <p>Desempenho só em totais. Logs ficam no máximo 7 dias.</p>
          </div>
        </aside>

        <section className="teacher-main">
          <header className="teacher-heading">
            <div>
              <p className="eyebrow">ADMINISTRAÇÃO</p>
              <h1>{adminTabs.find((tab) => tab.id === activeTab)?.label}</h1>
            </div>
            <p className="teacher-status" role="status" aria-live="polite">
              {busy ? 'Atualizando dados...' : message}
            </p>
          </header>

          {/* O catálogo fica montado para fornecer as disciplinas aos formulários. */}
          <div hidden={activeTab !== 'content'}>
            <AdminCatalog onSubjectsChange={setAdminSubjects} />
          </div>

          {activeTab === 'performance' && <AdminPerformance />}
          {activeTab === 'staff' && <AdminTeachersClasses />}
          {activeTab === 'activity' && (
            <AuditLogPanel user={activityUser} onClearUser={() => setActivityUser(null)} />
          )}
          {activeTab === 'messages' && <CommunicationCenter role="admin" requestedMode="direct" />}
          {activeTab === 'privacy' && (
            <div className="teacher-view-stack">
              <AdminPrivacyRequests />
              <AdminAdmissionPanel />
            </div>
          )}
          {activeTab === 'legal' && <LegalDocuments />}

          {activeTab === 'overview' && (
            <div className="teacher-view-stack">
              {overview && (
                <section className="teacher-metric-strip" aria-label="Resumo do sistema">
                  <div>
                    <span>Estudantes</span>
                    <strong>{overview.students}</strong>
                  </div>
                  <div>
                    <span>Professores</span>
                    <strong>{overview.teachers}</strong>
                  </div>
                  <div>
                    <span>Disciplinas</span>
                    <strong>{overview.subjects}</strong>
                  </div>
                  <div>
                    <span>Aulas</span>
                    <strong>{overview.lessons}</strong>
                  </div>
                  <div>
                    <span>Questões em rascunho</span>
                    <strong>{overview.draft_questions}</strong>
                  </div>
                </section>
              )}
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
                            <select
                              name="subject"
                              defaultValue={request.requested_subject}
                              required
                            >
                              {adminSubjects.map((subject) => (
                                <option key={subject.name} value={subject.name}>
                                  {subject.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button className="outline-button" disabled={busy}>
                            Aprovar
                          </button>
                        </form>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="teacher-empty">Nenhuma solicitação aguardando aprovação.</p>
                )}
              </section>
            </div>
          )}

          {activeTab === 'users' && (
            <div className="teacher-view-stack">
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
                      <input name="email" type="email" placeholder="usuario@escola.com" required />
                    </label>
                    <label>
                      SENHA TEMPORÁRIA
                      <input
                        name="password"
                        type="password"
                        minLength={6}
                        maxLength={128}
                        pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,128}"
                        title="Use pelo menos 6 caracteres, incluindo uma letra maiúscula, uma minúscula e um número."
                        required
                      />
                    </label>
                    <label>
                      CARGO
                      <select
                        name="role"
                        value={selectedRole}
                        onChange={(event) =>
                          setSelectedRole(event.target.value as 'student' | 'teacher')
                        }
                      >
                        <option value="student">Estudante</option>
                        <option value="teacher">Professor</option>
                      </select>
                    </label>
                    {selectedRole === 'teacher' && (
                      <label>
                        DISCIPLINA
                        <select
                          name="subject"
                          defaultValue=""
                          required
                          aria-describedby="subject-help"
                        >
                          <option value="" disabled>
                            Selecione...
                          </option>
                          {adminSubjects.map((subject) => (
                            <option key={subject.name} value={subject.name}>
                              {subject.name}
                            </option>
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
                    <button className="primary-button" disabled={busy}>
                      Adicionar usuário
                    </button>
                  </form>
                </section>
              </div>
              <AdminUsers
                users={people}
                onViewActivity={(person) => {
                  setActivityUser({ id: person.id, name: person.full_name });
                  setActiveTab('activity');
                }}
                onDeleted={(person) =>
                  setPeople((current) => current.filter((item) => item.id !== person.id))
                }
              />
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
