import { accessToken, apiUrl } from "./supabase";

/** Centraliza sessão e JSON para nenhuma tela montar autenticação por conta própria. */
export async function apiFetch(path: string, init: RequestInit = {}) {
  const token = await accessToken();
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(`${apiUrl}${path}`, { ...init, headers });
}
/** Lê a mensagem segura do backend sem espalhar try/catch pelos componentes. */
export async function apiError(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => ({}))) as { detail?: string };
  return payload.detail || fallback;
}
