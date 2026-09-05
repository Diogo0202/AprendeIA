import { createClient } from "@supabase/supabase-js";

// Vite só expõe ao navegador variáveis iniciadas por VITE_. A chave usada aqui
// é publicável; a chave secreta permanece exclusivamente no backend.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

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
