// Carrega os tipos das variáveis e recursos fornecidos pelo Vite.
/// <reference types="vite/client" />

interface Window {
  /** Valores públicos inseridos pelo container em produção. */
  __APP_CONFIG__?: {
    SUPABASE_URL?: string;
    SUPABASE_PUBLISHABLE_KEY?: string;
    API_URL?: string;
    CLARITY_PROJECT_ID?: string;
    ENABLE_CLARITY?: string;
    CLARITY_PRIVACY_APPROVED?: string;
    GA4_MEASUREMENT_ID?: string;
    ENABLE_GA4?: string;
    GA4_PRIVACY_APPROVED?: string;
    TURNSTILE_SITE_KEY?: string;
  };

  /** Fila criada pelo snippet oficial enquanto o script do Clarity carrega. */
  clarity?: ((...args: unknown[]) => void) & { q?: unknown[][] };
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
}
