import { accessToken, apiUrl } from '../supabase/client';

/** Centraliza sessão e JSON para nenhuma tela montar autenticação por conta própria. */
export async function apiFetch(path: string, init: RequestInit = {}) {
  const token = await accessToken();
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${apiUrl}${path}`, { ...init, headers });
}
/** Lê a mensagem segura do backend sem espalhar try/catch pelos componentes. */
export async function apiError(response: Response, fallback: string) {
  // 422 traz uma lista e o 403 de conta expirada traz um objeto: só texto chega à tela.
  const payload = (await response.json().catch(() => ({}))) as { detail?: unknown };
  return typeof payload.detail === 'string' && payload.detail ? payload.detail : fallback;
}
