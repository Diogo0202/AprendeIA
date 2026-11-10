import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const SERVICES = ["frontend", "api"];
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REASONS = new Set([
  "ok",
  "configuration",
  "timeout",
  "network",
  "redirect",
  "http",
  "content",
  "body-limit",
  "latency",
]);
const marker = (service) => `<!-- aprendeia-rf32:${service}:v1 -->`;

class Failure extends Error {}

export function readConfig(env = process.env) {
  const config = {};
  const rawThreshold = env.MONITOR_MAX_LATENCY_MS?.trim() || "5000";
  const threshold = /^\d+$/.test(rawThreshold) ? Number(rawThreshold) : NaN;
  for (const service of SERVICES) {
    const name = service === "api" ? "MONITOR_API_URL" : "MONITOR_FRONTEND_URL";
    try {
      if (!env[name]?.trim()) throw new Error();
      if (!Number.isInteger(threshold) || threshold < 100 || threshold > 9000)
        throw new Error();
      const url = new URL(env[name]);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        throw new Error();
      // A base pode conter /api quando o proxy publica o backend nesse prefixo.
      if (service === "api")
        url.pathname = `${url.pathname.replace(/\/$/, "")}/health/ready`;
      config[service] = { url: url.href, latencyThresholdMs: threshold };
    } catch {
      config[service] = { error: "configuration" };
    }
  }
  return config;
}

// O prazo cobre conexão e leitura, inclusive clientes injetados que ignorem abort.
async function bounded(operation, timeoutMs) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => operation(controller.signal)),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Failure("timeout"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

async function readBody(response, limit = 262144) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Failure("body-limit");
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    reader.cancel().catch(() => {});
  }
}

export function isAppHtml(html) {
  // Comentários e texto de scripts não comprovam a presença do elemento da aplicação.
  const markup = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/(<script\b[^>]*>)[\s\S]*?<\/script\s*>/gi, "$1</script>");
  const title = markup.match(/<title\b[^>]*>([^<]*)<\/title\s*>/i)?.[1] ?? "";
  if (
    !/AprendeIA/i.test(title) ||
    /sign\s*in|log\s*in|authentication|access denied|vercel|cloudflare|just a moment|security checkpoint/i.test(
      title,
    )
  )
    return false;
  if (/<input\b[^>]*\btype\s*=\s*["']?password\b/i.test(markup)) return false;
  return (
    /<div\b[^>]*\s+id\s*=\s*(["'])root\1(?=\s|>)[^>]*>/i.test(markup) &&
    /<script\b[^>]*\s+type\s*=\s*(["'])module\1[^>]*>/i.test(markup)
  );
}

export async function probe(
  service,
  target,
  {
    fetchImpl = globalThis.fetch,
    timeoutMs = 10000,
    now = () => performance.now(),
  } = {},
) {
  if (!SERVICES.includes(service)) throw new Error("Serviço inválido.");
  const start = now();
  let status = null;
  let requestId;
  let reason = "ok";
  try {
    if (!target || target.error) throw new Failure("configuration");
    await bounded(async (signal) => {
      // Probes públicas nunca recebem o token do GitHub ou cookies.
      const response = await fetchImpl(target.url, {
        method: "GET",
        redirect: "manual",
        credentials: "omit",
        signal,
        headers: {
          accept: service === "api" ? "application/json" : "text/html",
        },
      });
      status =
        Number.isInteger(response.status) &&
        response.status >= 100 &&
        response.status <= 599
          ? response.status
          : null;
      const id = response.headers.get("x-request-id");
      if (id && UUID.test(id)) requestId = id;
      if (status >= 300 && status < 400) throw new Failure("redirect");
      if (!status || status < 200 || status >= 300) throw new Failure("http");
      const contentType = response.headers.get("content-type") ?? "";
      const body = await readBody(response);
      if (service === "api") {
        if (!/^application\/json(?:\s*;|$)/i.test(contentType))
          throw new Failure("content");
        let payload;
        try {
          payload = JSON.parse(body);
        } catch {
          throw new Failure("content");
        }
        if (payload?.status !== "ready" || payload?.service !== "aprendeIA")
          throw new Failure("content");
      } else if (
        !/^text\/html(?:\s*;|$)/i.test(contentType) ||
        !isAppHtml(body)
      ) {
        throw new Failure("content");
      }
    }, timeoutMs);
  } catch (error) {
    reason =
      error instanceof Failure && REASONS.has(error.message)
        ? error.message
        : "network";
  }
  const latencyMs = Math.max(0, Math.round(now() - start));
  const latencyThresholdMs = target?.latencyThresholdMs ?? 5000;
  // Só uma resposta já validada pode ser classificada como lenta. Um 503
  // demorado continua sendo indisponibilidade, não vira aviso de desempenho.
  if (reason === "ok" && latencyMs > latencyThresholdMs) reason = "latency";
  return {
    service,
    ok: reason === "ok",
    reason,
    status,
    latencyMs,
    ...(reason === "latency" ? { latencyThresholdMs } : {}),
    ...(requestId ? { requestId } : {}),
  };
}

export async function confirmProbe(service, target, options = {}) {
  const check = options.probeImpl ?? probe;
  const pause = options.sleep ?? delay;
  // Uma segunda tentativa confirma falha ou lentidão antes de notificar.
  // Configuração inválida não exige rede nem uma espera que não a corrigiria.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const result = await check(service, target, options);
    if (result.ok || result.reason === "configuration" || attempt === 2) {
      return { ...result, attempts: attempt };
    }
    await pause(1000);
  }
}

// Só campos de vocabulário fechado chegam ao log e ao Markdown das issues.
export function safeReport(result) {
  if (!SERVICES.includes(result.service)) throw new Error("Serviço inválido.");
  const reason = REASONS.has(result.reason) ? result.reason : "network";
  return {
    service: result.service,
    ok: result.ok === true && reason === "ok",
    reason,
    status:
      Number.isInteger(result.status) &&
      result.status >= 100 &&
      result.status <= 599
        ? result.status
        : null,
    latencyMs: Number.isFinite(result.latencyMs)
      ? Math.max(0, Math.round(result.latencyMs))
      : 0,
    ...(Number.isInteger(result.attempts) &&
    result.attempts >= 1 &&
    result.attempts <= 2
      ? { attempts: result.attempts }
      : {}),
    ...(reason === "latency" &&
    Number.isInteger(result.latencyThresholdMs) &&
    result.latencyThresholdMs >= 100 &&
    result.latencyThresholdMs <= 9000
      ? { latencyThresholdMs: result.latencyThresholdMs }
      : {}),
    ...(typeof result.requestId === "string" && UUID.test(result.requestId)
      ? { requestId: result.requestId }
      : {}),
  };
}

function issueBody(result) {
  return [
    marker(result.service),
    `<!-- state:${result.reason}:${result.status ?? "none"} -->`,
    "Falha detectada pelo monitor externo RF32.",
    "",
    `Serviço: ${result.service}`,
    `Motivo: ${result.reason}`,
    `HTTP: ${result.status ?? "indisponível"}`,
    `Latência: ${result.latencyMs} ms`,
    ...(result.requestId ? [`Request ID: ${result.requestId}`] : []),
    ...(result.latencyThresholdMs
      ? [`Limite de latência: ${result.latencyThresholdMs} ms`]
      : []),
    `Tentativas nesta verificação: ${result.attempts ?? 1}`,
    "",
    "Este registro será fechado após uma resposta válida dentro do limite de latência.",
  ].join("\n");
}

export async function reconcileAlert(input, clientGH) {
  const result = safeReport(input);
  // Um usuário público pode copiar o marcador. Só o bot é dono dos alertas que editamos.
  const issues = (await clientGH.listOpenIssues()).filter(
    (issue) =>
      !issue.pull_request &&
      issue.user?.login === "github-actions[bot]" &&
      issue.body?.split(/\r?\n/).includes(marker(result.service)),
  );
  if (result.ok) {
    for (const issue of issues)
      await clientGH.updateIssue(issue.number, {
        state: "closed",
        state_reason: "completed",
      });
    return;
  }
  const body = issueBody(result);
  const category =
    result.reason === "latency"
      ? "Lentidão"
      : result.reason === "configuration"
        ? "Configuração"
        : "Indisponibilidade";
  const title = `[RF32] ${category}: ${result.service}`;
  if (!issues.length) await clientGH.createIssue({ title, body });
  else {
    // Latência e request-id variam a cada execução e não devem gerar notificações.
    const state = body.split("\n")[1];
    if (!issues[0].body.split(/\r?\n/).includes(state))
      await clientGH.updateIssue(issues[0].number, { title, body });
  }
}

export function createGitHubClient({
  repository,
  token,
  fetchImpl = globalThis.fetch,
  timeoutMs = 10000,
}) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? "") || !token)
    throw new Error("Configuração GitHub inválida.");
  const base = `https://api.github.com/repos/${repository}`;
  async function request(path, method = "GET", payload) {
    try {
      return await bounded(async (signal) => {
        const response = await fetchImpl(`${base}${path}`, {
          method,
          signal,
          redirect: "error",
          credentials: "omit",
          headers: {
            authorization: `Bearer ${token}`,
            accept: "application/vnd.github+json",
            "content-type": "application/json",
            "x-github-api-version": "2022-11-28",
          },
          ...(payload ? { body: JSON.stringify(payload) } : {}),
        });
        if (!response.ok) throw new Error();
        return JSON.parse(await readBody(response, 2097152));
      }, timeoutMs);
    } catch {
      throw new Error("Falha na API GitHub; detalhes omitidos.");
    }
  }
  return {
    async listOpenIssues() {
      const issues = [];
      for (let page = 1; page <= 20; page++) {
        const batch = await request(
          `/issues?state=open&creator=github-actions%5Bbot%5D&per_page=100&page=${page}`,
        );
        if (!Array.isArray(batch)) throw new Error("Resposta GitHub inválida.");
        issues.push(...batch);
        if (batch.length < 100) return issues;
      }
      // Falhar evita criar uma cópia se o alerta estiver numa página ainda não lida.
      throw new Error("Limite de paginação GitHub atingido.");
    },
    createIssue: (payload) => request("/issues", "POST", payload),
    updateIssue: (number, payload) => {
      if (!Number.isSafeInteger(number) || number <= 0)
        throw new Error("Issue inválida.");
      return request(`/issues/${number}`, "PATCH", payload);
    },
  };
}

export async function runMonitor({
  env = process.env,
  fetchImpl = globalThis.fetch,
  clientGH,
  log = console.log,
  timeoutMs = 10000,
  notify = true,
  sleep = delay,
} = {}) {
  const config = readConfig(env);
  const results = await Promise.all(
    SERVICES.map((service) =>
      confirmProbe(service, config[service], { fetchImpl, timeoutMs, sleep }),
    ),
  );
  for (const result of results) log(JSON.stringify(safeReport(result)));
  // A prévia permite validar URLs sem token ou escrita no GitHub.
  if (!notify) return results.some((result) => !result.ok) ? 1 : 0;
  const github =
    clientGH ??
    createGitHubClient({
      repository: env.GITHUB_REPOSITORY,
      token: env.GITHUB_TOKEN,
      fetchImpl,
      timeoutMs,
    });
  let alertFailed = false;
  for (const result of results) {
    try {
      await reconcileAlert(result, github);
    } catch {
      log(`Alerta GitHub indisponível: ${result.service}.`);
      alertFailed = true;
    }
  }
  return results.some((result) => !result.ok) || alertFailed ? 1 : 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--check-only") || args.length > 1) {
    console.error(
      "Argumento inválido. Use --check-only para conferir sem alertas.",
    );
    process.exitCode = 1;
  } else
    runMonitor({ notify: !args.includes("--check-only") })
      .then((code) => {
        process.exitCode = code;
      })
      .catch(() => {
        console.error("Monitor RF32 falhou; detalhes omitidos.");
        process.exitCode = 1;
      });
}
