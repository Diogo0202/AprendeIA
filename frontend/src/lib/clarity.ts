const consentKey = "aprendeia:analytics-consent";

type AnalyticsConsent = "granted" | "denied";

const runtimeConfig = window.__APP_CONFIG__;
const projectId =
  runtimeConfig?.CLARITY_PROJECT_ID?.trim() ||
  import.meta.env.VITE_CLARITY_PROJECT_ID?.trim() ||
  "";
const enabledValue =
  runtimeConfig?.ENABLE_CLARITY?.trim() ||
  import.meta.env.VITE_ENABLE_CLARITY?.trim() ||
  "false";

// Duas condições evitam ativação acidental: a flag precisa estar ligada e o ID
// deve usar apenas o formato simples fornecido pela Microsoft.
export const isClarityConfigured =
  enabledValue.toLowerCase() === "true" && /^[a-z0-9]+$/i.test(projectId);

export function readAnalyticsConsent(): AnalyticsConsent | null {
  const saved = window.localStorage.getItem(consentKey);
  return saved === "granted" || saved === "denied" ? saved : null;
}

export function saveAnalyticsConsent(consent: AnalyticsConsent) {
  window.localStorage.setItem(consentKey, consent);
  if (consent === "granted") loadClarity();
}

/**
 * Carrega a telemetria somente depois da escolha positiva. Não enviamos nome,
 * e-mail ou ID do usuário e todo o conteúdo React permanece mascarado no HTML.
 */
export function loadClarity() {
  if (!isClarityConfigured || readAnalyticsConsent() !== "granted") return;
  if (document.querySelector("script[data-aprendeia-clarity]")) return;

  window.clarity =
    window.clarity ||
    Object.assign(
      (...args: unknown[]) => {
        if (!window.clarity) return;
        window.clarity.q = window.clarity.q || [];
        window.clarity.q.push(args);
      },
      { q: [] as unknown[][] },
    );

  // O consentimento de anúncios continua negado: a integração serve apenas para
  // entender problemas de uso no ambiente adulto de demonstração.
  window.clarity("consentv2", {
    ad_Storage: "denied",
    analytics_Storage: "granted",
  });

  const script = document.createElement("script");
  script.async = true;
  script.fetchPriority = "low";
  script.referrerPolicy = "strict-origin-when-cross-origin";
  script.dataset.aprendeiaClarity = "true";
  script.src = `https://www.clarity.ms/tag/${projectId}`;
  document.head.appendChild(script);
}
