import { createClient } from "@supabase/supabase-js";

const runtimeConfig = window.__APP_CONFIG__;

// Vite só expõe ao navegador variáveis iniciadas por VITE_. A chave usada aqui
// é publicável; a chave secreta permanece exclusivamente no backend. No
// Railway, os mesmos valores públicos são inseridos ao iniciar o container.
const supabaseUrl =
  runtimeConfig?.SUPABASE_URL?.trim() || import.meta.env.VITE_SUPABASE_URL?.trim();
const publishableKey =
  runtimeConfig?.SUPABASE_PUBLISHABLE_KEY?.trim() ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

export const apiUrl =
  runtimeConfig?.API_URL?.trim() || import.meta.env.VITE_API_URL || "http://localhost:8000";

// A flag mantém o protótipo funcional sem credenciais durante demonstrações.
export const isSupabaseConfigured = Boolean(supabaseUrl && publishableKey);

// Um único cliente evita listeners e armazenamentos de sessão duplicados.
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, publishableKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null;

/** Obtém o token renovado pela biblioteca para autenticar o backend. */
export async function accessToken() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
