import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NotificationPreferences } from './NotificationPreferences';
import { apiFetch } from '../lib/api';

const configuration = vi.hoisted(() => ({ enabled: true }));
vi.mock('../lib/supabase', () => ({
  get isSupabaseConfigured() {
    return configuration.enabled;
  },
}));
vi.mock('../lib/api', () => ({
  apiFetch: vi.fn(),
  apiError: vi.fn(
    async (response: Response, fallback: string) => (await response.json()).detail || fallback,
  ),
}));
const fetchMock = vi.mocked(apiFetch);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  configuration.enabled = true;
  fetchMock.mockReset();
});
afterEach(() => cleanup());

it('carrega a escolha salva e envia as duas preferências', async () => {
  fetchMock
    .mockResolvedValueOnce(json({ email_difficulty_alerts: true, email_weekly_summary: false }))
    .mockResolvedValueOnce(json({ email_difficulty_alerts: false, email_weekly_summary: false }));
  render(<NotificationPreferences />);
  const weekly = await screen.findByRole('checkbox', { name: /Resumo semanal/ });
  await waitFor(() => expect(weekly).toBeEnabled());
  expect(weekly).not.toBeChecked();

  fireEvent.click(screen.getByRole('checkbox', { name: /Alerta imediato/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Salvar preferências' }));

  expect(await screen.findByRole('status')).toHaveTextContent('Preferências salvas.');
  expect(fetchMock).toHaveBeenLastCalledWith('/teacher/notification-preferences', {
    method: 'PUT',
    body: JSON.stringify({ email_difficulty_alerts: false, email_weekly_summary: false }),
  });
});

it('não permite salvar quando a leitura falha', async () => {
  fetchMock.mockResolvedValueOnce(json({ detail: 'Você não tem permissão.' }, 403));
  render(<NotificationPreferences />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Você não tem permissão.');
  expect(screen.getByRole('button', { name: 'Salvar preferências' })).toBeDisabled();
});

it('sem Supabase não chama a API', () => {
  configuration.enabled = false;
  render(<NotificationPreferences />);
  expect(screen.getByText('Conecte o Supabase para salvar suas preferências.')).toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalled();
});
