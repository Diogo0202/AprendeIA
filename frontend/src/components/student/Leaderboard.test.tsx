import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../../lib/api';
import { Leaderboard, type LeaderboardData } from './Leaderboard';

vi.mock('../../lib/api', () => ({ apiFetch: vi.fn() }));
const classId = '10000000-0000-0000-0000-000000000001';
const entry = {
  alias: 'Cometa',
  avatar_key: 'orbit',
  weekly_xp: 80,
  level: 2,
  rank: 1,
  is_me: true,
};
const data: LeaderboardData = {
  entries: [entry, { ...entry, alias: 'Lua', is_me: false }],
  my_position: entry,
  total: 2,
  page: 1,
  page_size: 20,
  week_start: '2026-11-02',
  week_end: '2026-11-08',
  classes: [{ id: classId, name: 'Turma A' }],
  school_opt_in: false,
  alias: 'Cometa',
};
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
function mockData(value = data) {
  vi.mocked(apiFetch).mockImplementation(async () => response(value));
}
function mount() {
  return render(<Leaderboard initialClassId={classId} />);
}

describe('Leaderboard', () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it('starts connected, shows loading, ties and own position without private fields', async () => {
    let resolve!: (value: Response) => void;
    vi.mocked(apiFetch).mockImplementation(
      () =>
        new Promise((value) => {
          resolve = value;
        }),
    );
    const view = mount();
    expect(screen.getByText('Carregando ranking...')).toBeInTheDocument();
    resolve(response({ ...data, email: 'private@example.test', student_id: 'secret-id' }));
    const podium = await screen.findByLabelText('Pódio semanal');
    expect(within(podium).getAllByText('1º lugar')).toHaveLength(2);
    expect(screen.getByLabelText('Sua posição')).toHaveTextContent('Sua posição: 1º');
    expect(view.container.innerHTML).not.toMatch(/private@example|secret-id/);
    expect(apiFetch).toHaveBeenCalledWith(
      `/student/leaderboard?scope=class&page=1&page_size=20&class_id=${classId}`,
      expect.anything(),
    );
  });

  it('discovers an authorized class then requests its ranking', async () => {
    mockData();
    render(<Leaderboard />);
    await screen.findByRole('table');
    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(apiFetch).mock.calls[1][0]).toContain(`class_id=${classId}`);
    fireEvent.click(screen.getByRole('tab', { name: 'Turma' }));
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('shows empty ranking and missing own position', async () => {
    mockData({ ...data, entries: [], total: 0, my_position: null });
    mount();
    expect(await screen.findByText('Nenhuma posição nesta semana.')).toBeInTheDocument();
    expect(screen.getByText('Você ainda não tem posição nesta semana.')).toBeInTheDocument();
  });

  it('does not show entries when no authorized class exists', async () => {
    mockData({ ...data, classes: [] });
    mount();
    expect(await screen.findByText('Você ainda não participa de uma turma.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it.each([401, 403, 500])('fails closed on HTTP %i and supports retry', async (status) => {
    vi.mocked(apiFetch).mockResolvedValueOnce(response({ detail: 'private@example.test' }, status));
    mount();
    expect(await screen.findByRole('alert')).not.toHaveTextContent('private@example.test');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar preferências' })).not.toBeInTheDocument();
    mockData();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('changes tabs with keyboard and hides school data until confirmed opt-in', async () => {
    mockData();
    mount();
    await screen.findByRole('table');
    const classTab = screen.getByRole('tab', { name: 'Turma' });
    classTab.focus();
    fireEvent.keyDown(classTab, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Escola' })).toHaveFocus();
    await screen.findByText(/Ative a participação/);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Sua posição')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(apiFetch).toHaveBeenLastCalledWith(
      '/student/leaderboard?scope=school&page=1&page_size=20',
      expect.anything(),
    );
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Escola' }), { key: 'Home' });
    expect(screen.getByRole('tab', { name: 'Turma' })).toHaveFocus();
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('saves alias and opt-in only through PUT and refreshes server state', async () => {
    let saved = false;
    vi.mocked(apiFetch).mockImplementation(async (_path, init) => {
      if (init?.method === 'PUT') {
        saved = true;
        return new Response(null, { status: 204 });
      }
      return response({ ...data, school_opt_in: saved, alias: saved ? 'Astro' : data.alias });
    });
    const onSaved = vi.fn();
    render(<Leaderboard initialClassId={classId} onPreferencesSaved={onSaved} />);
    await screen.findByRole('table');
    fireEvent.change(screen.getByLabelText('Apelido público'), { target: { value: 'Astro' } });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.submit(screen.getByRole('form', { name: 'Preferências do ranking' }));
    await waitFor(() =>
      expect(onSaved).toHaveBeenCalledWith({ alias: 'Astro', school_opt_in: true }),
    );
    expect(apiFetch).toHaveBeenCalledWith(
      '/student/leaderboard-preferences',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ alias: 'Astro', school_opt_in: true }),
      }),
    );
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('tab', { name: 'Escola' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('keeps school ranking hidden when preference validation fails', async () => {
    vi.mocked(apiFetch).mockImplementation(async (_path, init) =>
      init?.method === 'PUT' ? response({ detail: 'private@example.test' }, 422) : response(data),
    );
    mount();
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('tab', { name: 'Escola' }));
    await screen.findByText(/Ative a participação/);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar preferências' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível salvar.');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('paginates with server ranks and retains own position outside the page', async () => {
    vi.mocked(apiFetch).mockImplementation(async (path) =>
      response({
        ...data,
        total: 21,
        page: String(path).includes('page=2&') ? 2 : 1,
        entries: String(path).includes('page=2&')
          ? [{ ...entry, alias: 'Saturno', rank: 21, is_me: false }]
          : data.entries,
      }),
    );
    mount();
    await screen.findByRole('table');
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Próxima' }));
    await screen.findByText('Página 2 de 2');
    expect(screen.getByText('Saturno')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Próxima' })).toBeDisabled();
    expect(screen.getByLabelText('Sua posição')).toHaveTextContent('Cometa');
    expect(screen.queryByLabelText('Pódio semanal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }));
    await screen.findByText('Página 1 de 2');
  });

  it('ignores a stale class response after switching to school', async () => {
    let resolve!: (value: Response) => void;
    vi.mocked(apiFetch).mockImplementation((path) =>
      String(path).includes('scope=class')
        ? new Promise((value) => {
            resolve = value;
          })
        : Promise.resolve(response(data)),
    );
    mount();
    fireEvent.click(screen.getByRole('tab', { name: 'Escola' }));
    await screen.findByText(/Ative a participação/);
    resolve(response({ ...data, school_opt_in: true }));
    await waitFor(() => expect(screen.queryByRole('table')).not.toBeInTheDocument());
  });

  it('labels explicit demos and never requests or saves live data', async () => {
    render(<Leaderboard connected={false} demoData={data} initialClassId={classId} />);
    await screen.findByRole('table');
    expect(screen.getByText(/Demonstração:/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar preferências' })).toBeDisabled();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('does not invent demo data when no fixture is passed', async () => {
    render(<Leaderboard connected={false} />);
    await screen.findByRole('alert');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('uses the teacher endpoint with a 50 item limit and hides student settings', async () => {
    mockData();
    const view = render(<Leaderboard teacherClassId={classId} pageSize={100} />);
    await screen.findByRole('table');
    expect(apiFetch).toHaveBeenCalledWith(
      `/teacher/classes/${classId}/leaderboard?page=1&page_size=50`,
      expect.anything(),
    );
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Sua posição')).not.toBeInTheDocument();
    const nextClass = '10000000-0000-0000-0000-000000000002';
    view.rerender(<Leaderboard teacherClassId={nextClass} />);
    await waitFor(() =>
      expect(apiFetch).toHaveBeenLastCalledWith(
        `/teacher/classes/${nextClass}/leaderboard?page=1&page_size=20`,
        expect.anything(),
      ),
    );
  });

  it('enforces public alias length in the form', async () => {
    mockData();
    mount();
    const input = await screen.findByLabelText('Apelido público');
    expect(input).toHaveAttribute('minlength', '3');
    expect(input).toHaveAttribute('maxlength', '24');
    fireEvent.change(input, { target: { value: 'ab' } });
    expect(screen.getByRole('button', { name: 'Salvar preferências' })).toBeDisabled();
  });
});
