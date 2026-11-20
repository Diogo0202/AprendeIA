import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminPerformance, AdminTeachersClasses, AdminUsers, type AdminUser } from './AdminPanels';
import { AuditLogPanel } from './AuditLogPanel';
import { CommunicationCenter } from '../CommunicationCenter';
import { apiFetch } from '../../lib/api';

vi.mock('../../lib/supabase', () => ({ isSupabaseConfigured: true }));
vi.mock('../../lib/api', () => ({
  apiFetch: vi.fn(),
  apiError: vi.fn(
    async (response: Response, fallback: string) => (await response.json()).detail || fallback,
  ),
}));
const fetchMock = vi.mocked(apiFetch);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const users: AdminUser[] = [
  { id: 'student-1', full_name: 'Ana Souza', email: 'ana@escola.com', role: 'student' },
  { id: 'teacher-1', full_name: 'Carlos Lima', email: 'carlos@escola.com', role: 'teacher' },
  { id: 'admin-1', full_name: 'Bia Admin', email: 'bia@escola.com', role: 'admin' },
];
const group = {
  small_sample: false,
  attempts: 30,
  accuracy: 70,
  completed_lessons: 4,
  active_alerts: 1,
  trend: [{ week_start: '2026-11-02', attempts: 30, accuracy: 70 }],
};

beforeEach(() => {
  fetchMock.mockReset();
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    },
  });
});
afterEach(() => cleanup());

describe('Usuários', () => {
  it('não oferece exclusão de contas administrativas', () => {
    render(<AdminUsers users={users} onViewActivity={vi.fn()} onDeleted={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Excluir Ana Souza' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excluir Carlos Lima' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir Bia Admin' })).not.toBeInTheDocument();
  });

  it('filtra por nome e perfil e abre as atividades da pessoa', () => {
    const onViewActivity = vi.fn();
    render(<AdminUsers users={users} onViewActivity={onViewActivity} onDeleted={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('PERFIL'), { target: { value: 'teacher' } });
    expect(screen.queryByText('Ana Souza')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver atividades' }));
    expect(onViewActivity).toHaveBeenCalledWith(users[1]);
  });

  it('só exclui depois de digitar EXCLUIR e informar o motivo', async () => {
    const onDeleted = vi.fn();
    fetchMock.mockResolvedValueOnce(json({ deleted: true, deleted_role: 'student' }));
    render(<AdminUsers users={users} onViewActivity={vi.fn()} onDeleted={onDeleted} />);
    fireEvent.click(screen.getByRole('button', { name: 'Excluir Ana Souza' }));
    const dialog = screen.getByRole('dialog', { hidden: true });
    const submit = within(dialog).getByRole('button', { name: 'Excluir conta', hidden: true });
    expect(submit).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText(/MOTIVO/), {
      target: { value: 'Saiu da escola' },
    });
    fireEvent.change(within(dialog).getByLabelText(/DIGITE EXCLUIR/), {
      target: { value: 'excluir' },
    });
    expect(submit).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText(/DIGITE EXCLUIR/), {
      target: { value: 'EXCLUIR' },
    });
    fireEvent.click(submit);
    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(users[0]));
    expect(fetchMock).toHaveBeenCalledWith('/admin/users/student-1/delete', {
      method: 'POST',
      body: JSON.stringify({ confirmation: 'EXCLUIR', reason: 'Saiu da escola' }),
    });
    expect(screen.getByRole('status')).toHaveTextContent('Conta de Ana Souza excluída.');
  });

  it('mostra a recusa do servidor e mantém a conta', async () => {
    const onDeleted = vi.fn();
    fetchMock.mockResolvedValueOnce(
      json({ detail: 'A conta tem arquivos armazenados. Remova-os antes de excluir.' }, 409),
    );
    render(<AdminUsers users={users} onViewActivity={vi.fn()} onDeleted={onDeleted} />);
    fireEvent.click(screen.getByRole('button', { name: 'Excluir Carlos Lima' }));
    const dialog = screen.getByRole('dialog', { hidden: true });
    fireEvent.change(within(dialog).getByLabelText(/MOTIVO/), { target: { value: 'Encerrado' } });
    fireEvent.change(within(dialog).getByLabelText(/DIGITE EXCLUIR/), {
      target: { value: 'EXCLUIR' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Excluir conta', hidden: true }));
    expect(await within(dialog).findByRole('alert', { hidden: true })).toHaveTextContent(
      'arquivos',
    );
    expect(onDeleted).not.toHaveBeenCalled();
  });
});

describe('Desempenho', () => {
  it('mostra totais e esconde indicadores de amostra pequena', async () => {
    fetchMock.mockImplementation(async (path) =>
      String(path).startsWith('/admin/performance')
        ? json({
            min_group_size: 3,
            classes: [
              {
                id: 'c1',
                name: '8A',
                school_year: '8º',
                subject: 'Matemática',
                teacher_id: 't1',
                teacher_name: 'Carlos',
                students: 12,
                ...group,
              },
              {
                id: 'c2',
                name: '8B',
                school_year: '8º',
                subject: 'Matemática',
                teacher_id: 't1',
                teacher_name: 'Carlos',
                students: 2,
                small_sample: true,
                attempts: null,
                accuracy: null,
                completed_lessons: null,
                active_alerts: null,
                trend: [],
              },
            ],
            teachers: [
              {
                id: 't1',
                full_name: 'Carlos',
                subject: 'Matemática',
                classes: 2,
                students: 14,
                ...group,
              },
            ],
          })
        : json([
            {
              id: 't1',
              full_name: 'Carlos',
              email: 'c@e.com',
              registration_status: 'active',
              subject: 'Matemática',
              classes: 2,
              students: 14,
            },
          ]),
    );
    render(<AdminPerformance />);
    expect(await screen.findByText('8B')).toBeInTheDocument();
    const small = screen.getByText('8B').closest('tr')!;
    expect(within(small).getByText('Amostra pequena')).toBeInTheDocument();
    expect(within(small).getAllByText('—').length).toBeGreaterThanOrEqual(4);
    expect(within(screen.getByText('8A').closest('tr')!).getByText('70%')).toBeInTheDocument();
  });

  it('filtra pelo professor escolhido', async () => {
    fetchMock.mockImplementation(async (path) =>
      String(path).startsWith('/admin/performance')
        ? json({ min_group_size: 3, classes: [], teachers: [] })
        : json([
            {
              id: 't1',
              full_name: 'Carlos',
              email: 'c@e.com',
              registration_status: 'active',
              subject: 'Matemática',
              classes: 0,
              students: 0,
            },
          ]),
    );
    render(<AdminPerformance />);
    await screen.findByRole('option', { name: 'Carlos' });
    fireEvent.change(screen.getByLabelText('PROFESSOR'), { target: { value: 't1' } });
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('/admin/performance?teacher_id=t1', expect.anything()),
    );
  });
});

describe('Professores e turmas', () => {
  it('lista professores e turmas', async () => {
    fetchMock.mockImplementation(async (path) =>
      path === '/admin/teachers'
        ? json([
            {
              id: 't1',
              full_name: 'Carlos',
              email: 'c@e.com',
              registration_status: 'active',
              subject: 'Matemática',
              classes: 1,
              students: 20,
            },
          ])
        : json([
            {
              id: 'c1',
              name: '8A',
              school_year: '8º ano',
              subject: 'Matemática',
              teacher_name: 'Carlos',
              students: 20,
            },
          ]),
    );
    render(<AdminTeachersClasses />);
    expect(await screen.findByText('c@e.com')).toBeInTheDocument();
    expect(await screen.findByText('8A')).toBeInTheDocument();
  });
});

describe('Atividades por usuário', () => {
  it('filtra a auditoria pela pessoa escolhida', async () => {
    fetchMock.mockResolvedValue(json([]));
    const onClearUser = vi.fn();
    render(
      <AuditLogPanel user={{ id: 'teacher-1', name: 'Carlos Lima' }} onClearUser={onClearUser} />,
    );
    expect(screen.getByRole('heading', { name: 'Atividades de Carlos Lima' })).toBeInTheDocument();
    await waitFor(() => expect(String(fetchMock.mock.calls[0][0])).toContain('user_id=teacher-1'));
    fireEvent.click(screen.getByRole('button', { name: 'Ver todos os usuários' }));
    expect(onClearUser).toHaveBeenCalled();
  });
});

describe('Mensagens da administração', () => {
  it('não oferece o tutor de IA', async () => {
    fetchMock.mockImplementation(async (path) =>
      path === '/communications/contacts'
        ? json([{ id: 't1', full_name: 'Carlos Lima', role: 'teacher', context: 'Professor' }])
        : json([]),
    );
    render(<CommunicationCenter role="admin" requestedMode="direct" />);
    expect(await screen.findByText('Carlos Lima')).toBeInTheDocument();
    expect(screen.queryByText('Tutor IA')).not.toBeInTheDocument();
  });
});
