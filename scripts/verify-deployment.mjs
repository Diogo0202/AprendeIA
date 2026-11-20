import { pathToFileURL } from "node:url";

const RAILWAY_URL = "https://backboard.railway.com/graphql/v2";

export function readConfig(env = process.env) {
  const required = [
    "EXPECTED_SHA",
    "VERCEL_TOKEN",
    "VERCEL_PROJECT_ID",
    "VERCEL_PRODUCTION_DOMAIN",
    "RAILWAY_TOKEN",
    "RAILWAY_BACKEND_SERVICE_ID",
    "RAILWAY_ENVIRONMENT_ID",
  ];
  const missing = required.filter((key) => !env[key]?.trim());
  if (missing.length) throw new Error(`Configuração ausente: ${missing.join(", ")}`);
  if (!/^[a-f0-9]{40}$/i.test(env.EXPECTED_SHA))
    throw new Error("EXPECTED_SHA precisa ser um SHA Git completo.");
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i.test(env.VERCEL_PRODUCTION_DOMAIN))
    throw new Error("VERCEL_PRODUCTION_DOMAIN deve conter apenas o hostname público.");
  const waitMs = Number(env.DEPLOYMENT_WAIT_MS || 900000);
  if (!Number.isInteger(waitMs) || waitMs < 0 || waitMs > 1800000)
    throw new Error("DEPLOYMENT_WAIT_MS fora do limite permitido.");
  return { ...Object.fromEntries(required.map((key) => [key, env[key].trim()])), teamId: env.VERCEL_TEAM_ID?.trim(), waitMs };
}

async function jsonRequest(url, options, fetchImpl) {
  const response = await fetchImpl(url, { ...options, redirect: "error", credentials: "omit", signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`API de publicação respondeu HTTP ${response.status}.`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("API de publicação sem resposta JSON.");
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2097152) throw new Error("Resposta de publicação acima do limite.");
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder().decode(bytes)); }
    catch { throw new Error("API de publicação retornou JSON inválido."); }
  } finally { await reader.cancel().catch(() => {}); }
}

export async function checkVercel(config, fetchImpl = fetch) {
  // Consultar o domínio resolve a versão servida agora; listar deploys antigos
  // aceitaria um SHA que já saiu de produção após rollback ou nova publicação.
  const query = new URLSearchParams();
  if (config.teamId) query.set("teamId", config.teamId);
  const data = await jsonRequest(`https://api.vercel.com/v13/deployments/${encodeURIComponent(config.VERCEL_PRODUCTION_DOMAIN)}?${query}`, {
    headers: { authorization: `Bearer ${config.VERCEL_TOKEN}`, accept: "application/json" },
  }, fetchImpl);
  if (data.projectId !== config.VERCEL_PROJECT_ID) throw new Error("Domínio Vercel não pertence ao projeto esperado.");
  const exactSha = data.meta?.githubCommitSha?.toLowerCase() === config.EXPECTED_SHA.toLowerCase();
  if (exactSha && data.target === "production" && data.readyState === "READY")
    return { provider: "Vercel", id: data.uid ?? data.id, sha: config.EXPECTED_SHA, state: "READY" };
  if (exactSha && ["ERROR", "CANCELED"].includes(data.readyState))
    throw new Error(`Deploy Vercel do SHA esperado terminou em ${data.readyState}.`);
  return null;
}

export async function checkRailway(config, fetchImpl = fetch) {
  const query = `query VerifyDeployment($serviceId: String!, $environmentId: String!) { serviceInstance(serviceId: $serviceId, environmentId: $environmentId) { latestDeployment { id status meta } } }`;
  const result = await jsonRequest(RAILWAY_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${config.RAILWAY_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ query, variables: { serviceId: config.RAILWAY_BACKEND_SERVICE_ID, environmentId: config.RAILWAY_ENVIRONMENT_ID } }),
  }, fetchImpl);
  if (result.errors?.length) throw new Error("Railway GraphQL retornou erro.");
  const deployment = result.data?.serviceInstance?.latestDeployment;
  if (!deployment) return null;
  let meta;
  try { meta = typeof deployment.meta === "string" ? JSON.parse(deployment.meta) : deployment.meta; }
  catch { throw new Error("Railway retornou metadados inválidos."); }
  const sha = meta?.commitSha ?? meta?.gitCommitSha ?? meta?.githubCommitSha;
  if (sha?.toLowerCase() === config.EXPECTED_SHA.toLowerCase() && deployment.status === "SUCCESS")
    return { provider: "Railway", id: deployment.id, sha, state: deployment.status };
  if (sha?.toLowerCase() === config.EXPECTED_SHA.toLowerCase() && ["FAILED", "CRASHED"].includes(deployment.status))
    throw new Error(`Deploy Railway do SHA esperado terminou em ${deployment.status}.`);
  return null;
}

export async function verifyDeployments({ env = process.env, fetchImpl = fetch, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), now = Date.now, log = console.log } = {}) {
  const config = readConfig(env);
  const deadline = now() + config.waitMs;
  let vercel;
  let railway;
  do {
    [vercel, railway] = await Promise.all([checkVercel(config, fetchImpl), checkRailway(config, fetchImpl)]);
    if (vercel && railway) {
      log(JSON.stringify({ expectedSha: config.EXPECTED_SHA, deployments: [vercel, railway] }));
      return 0;
    }
    if (now() >= deadline) break;
    await sleep(Math.min(10000, deadline - now()));
  } while (true);
  throw new Error(`Deploy terminal do SHA esperado não confirmado em: ${[!vercel && "Vercel", !railway && "Railway"].filter(Boolean).join(", ")}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyDeployments().then((code) => { process.exitCode = code; }).catch((error) => {
    console.error(`Verificação de publicação falhou: ${error.message}`);
    process.exitCode = 1;
  });
}
