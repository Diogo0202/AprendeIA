// Carrega os tipos das variáveis e recursos fornecidos pelo Vite.
/// <reference types="vite/client" />

interface Window {
  /** Valores públicos inseridos pelo container em produção. */
  __APP_CONFIG__?: {
    SUPABASE_URL?: string;
    SUPABASE_PUBLISHABLE_KEY?: string;
    API_URL?: string;
  };
}
