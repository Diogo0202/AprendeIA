import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../../lib/api';
import {
  GamificationAchievements,
  type GamificationAchievementsData,
} from './GamificationAchievements';

vi.mock('../../lib/api', () => ({ apiFetch: vi.fn() }));
const achievement = {
  id: 'first',
  title: 'Primeiro passo',
  description: 'Conclua uma atividade.',
  icon: 'star',
  bonus_xp: 10,
  unlocked: false,
  progress: 1,
  target: 5,
};
const data: GamificationAchievementsData = {
  achievements: [],
  catalog: [achievement],
  points: 120,
  weekly_xp: 40,
  bonus_xp: 10,
};
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

describe('GamificationAchievements', () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset();
  });

  it('loads the connected catalog and shows locked progress and XP', async () => {
    vi.mocked(apiFetch).mockResolvedValue(response(data));
    render(<GamificationAchievements />);
    expect(screen.getByText('Carregando conquistas...')).toBeInTheDocument();
    const progress = await screen.findByRole('progressbar', {
      name: 'Progresso de Primeiro passo',
    });
    expect(progress).toHaveAttribute('value', '1');
    expect(progress).toHaveAttribute('max', '5');
    expect(screen.getByText('Bloqueada')).toBeInTheDocument();
    expect(screen.getByText('XP semanal')).toBeInTheDocument();
    expect(screen.getByText('Bônus: 10 XP')).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith('/student/gamification', expect.anything());
  });

  it('merges unlocked state into catalog without duplicate achievements or another request', async () => {
    render(
      <GamificationAchievements
        data={{ ...data, achievements: [{ ...achievement, unlocked: true }] }}
      />,
    );
    await screen.findByText('Desbloqueada');
    expect(screen.getAllByText('Primeiro passo')).toHaveLength(1);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('handles an empty catalog', async () => {
    render(<GamificationAchievements data={{ ...data, catalog: [] }} />);
    expect(await screen.findByText('Nenhuma conquista disponível.')).toBeInTheDocument();
  });

  it.each([403, 500])('shows a safe error for %i and retries', async (status) => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(response({ detail: 'private@example.test' }, status))
      .mockResolvedValueOnce(response(data));
    const view = render(<GamificationAchievements />);
    await screen.findByRole('alert');
    expect(view.container.innerHTML).not.toContain('private@example.test');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Primeiro passo')).toBeInTheDocument();
  });

  it('clamps progress and handles a zero target without NaN', async () => {
    render(
      <GamificationAchievements
        data={{
          ...data,
          catalog: [
            { ...achievement, progress: 99 },
            { ...achievement, id: 'zero', title: 'Outra meta', target: 0 },
          ],
        }}
      />,
    );
    expect(await screen.findByRole('progressbar')).toHaveAttribute('value', '5');
    expect(screen.getByText('Meta ainda não disponível.')).toBeInTheDocument();
  });

  it('renders server text as text and never creates arbitrary icon URLs or HTML', async () => {
    const view = render(
      <GamificationAchievements
        data={
          {
            ...data,
            email: 'private@example.test',
            catalog: [
              {
                ...achievement,
                title: '<img src=x onerror=alert(1)>',
                icon: 'https://private.example/avatar',
              },
            ],
          } as GamificationAchievementsData
        }
      />,
    );
    await screen.findByText('<img src=x onerror=alert(1)>');
    expect(view.container.querySelector('img')).toBeNull();
    expect(view.container.innerHTML).not.toMatch(/private@example|private.example/);
  });

  it('requires explicit demo data and makes no network calls', async () => {
    const view = render(<GamificationAchievements connected={false} demoData={data} />);
    await screen.findByText('Primeiro passo');
    expect(screen.getByText(/Demonstração:/)).toBeInTheDocument();
    view.rerender(<GamificationAchievements connected={false} />);
    await screen.findByRole('alert');
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
