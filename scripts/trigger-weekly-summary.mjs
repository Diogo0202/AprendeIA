// RF22: uma chamada autenticada, sem replay após resultado ambíguo.
import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
const ROUTE = "/internal/weekly-difficulty-summary";

export function readConfig(env) {
  const base = (env.WEEKLY_SUMMARY_API_URL || "").trim();
  const secret = (env.WEEKLY_SUMMARY_CRON_SECRET || "").trim();
  if (!base) throw new Error("Defina WEEKLY_SUMMARY_API_URL.");
  if (!secret) throw new Error("Defina WEEKLY_SUMMARY_CRON_SECRET.");
  let url;
  try { url = new URL(base); } catch { throw new Error("WEEKLY_SUMMARY_API_URL inválida."); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) throw new Error("A API precisa usar HTTPS.");
  if (url.username || url.password) throw new Error("A URL não pode conter credenciais.");
  url.pathname = `${url.pathname.replace(/\/+$/, "")}${ROUTE}`;
  url.search = "";
  url.hash = "";
  return { endpoint: url.toString(), secret };
}

const fields = ["smtp_accepted", "provider_accepted", "received", "teachers_skipped", "failed_deliveries", "unknown_deliveries", "processing_deliveries"];
export function interpret(status, body) {
  const counts = Object.fromEntries(fields.map((key) => [key, body?.[key]]));
  const valid = fields.every((key) => Number.isSafeInteger(counts[key]) && counts[key] >= 0);
  const success = ["smtp_accepted", "provider_accepted", "no_deliveries"].includes(body?.status);
  const ok = status === 200 && valid && success && counts.failed_deliveries === 0 && counts.unknown_deliveries === 0 && counts.processing_deliveries === 0;
  // Nunca ecoa detail/status arbitrário recebido pela rede.
  const outcome = status !== 200 ? `http_${Number.isInteger(status) ? status : 0}` :
    !valid ? "invalid_response" : ["smtp_accepted", "provider_accepted", "no_deliveries", "failed", "unknown", "processing"].includes(body?.status) ? body.status : "invalid_response";
  return { ok, outcome, ...Object.fromEntries(fields.map((key) => [key, valid ? counts[key] : 0])) };
}

export async function triggerSummary(config, { fetchImpl = fetch } = {}) {
  try {
    const response = await fetchImpl(config.endpoint, {
      method: "POST", redirect: "error",
      headers: { "X-Cron-Secret": config.secret, Accept: "application/json" },
      signal: AbortSignal.timeout(240_000),
    });
    return interpret(response.status, await response.json().catch(() => ({})));
  } catch {
    return { ...interpret(0, {}), outcome: "unknown" };
  }
}

export function report(result) {
  return ["## Resumo semanal de dificuldades", "",
    `- Resultado: ${result.outcome}`,
    `- Aceitos pelo SMTP: ${result.smtp_accepted}`,
    `- Aceitos pelo provedor HTTPS: ${result.provider_accepted}`,
    `- Recebimentos confirmados externamente: ${result.received}`,
    `- Professores que desligaram o resumo: ${result.teachers_skipped}`,
    `- Falhas: ${result.failed_deliveries}`,
    `- Resultado desconhecido: ${result.unknown_deliveries}`,
    `- Em processamento: ${result.processing_deliveries}`, ""].join("\n");
}

export async function main(env = process.env) {
  let result;
  try { result = await triggerSummary(readConfig(env)); }
  catch { result = { ...interpret(0, {}), outcome: "config" }; }
  const text = report(result);
  console.log(text);
  if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY, text);
  return result.ok ? 0 : 1;
}
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) process.exitCode = await main();
