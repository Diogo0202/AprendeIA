import test from "node:test";
import assert from "node:assert/strict";
import { checkRailway, checkVercel, readConfig, verifyDeployments } from "./verify-deployment.mjs";

const sha = "a".repeat(40);
const env = {
  EXPECTED_SHA: sha, VERCEL_TOKEN: "token", VERCEL_PROJECT_ID: "prj_123",
  VERCEL_PRODUCTION_DOMAIN: "aprendeia.example",
  RAILWAY_TOKEN: "token", RAILWAY_BACKEND_SERVICE_ID: "service", RAILWAY_ENVIRONMENT_ID: "environment",
  DEPLOYMENT_WAIT_MS: "0",
};

test("exige credenciais e IDs de todos os provedores", () => {
  assert.throws(() => readConfig({}), /Configuração ausente/);
  assert.throws(() => readConfig({ ...env, EXPECTED_SHA: "abc" }), /SHA Git completo/);
});

test("aceita somente Vercel production READY com SHA exato", async () => {
  const fetchImpl = async (url, options) => {
    assert.ok(url.includes('/v13/deployments/aprendeia.example'));
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    return new Response(JSON.stringify({ uid: "prod", projectId: "prj_123", target: "production", readyState: "READY", meta: { githubCommitSha: sha } }), { status: 200 });
  };
  assert.equal((await checkVercel(readConfig(env), fetchImpl)).id, "prod");
});

test("aceita somente Railway SUCCESS com SHA exato", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ data: { serviceInstance: { latestDeployment: {
    id: "dep", status: "SUCCESS", meta: { commitSha: sha },
  } } } }), { status: 200 });
  assert.equal((await checkRailway(readConfig(env), fetchImpl)).state, "SUCCESS");
});

test("nega falso sucesso e falha se provedor não retornar o deploy", async () => {
  const fetchImpl = async (url) => url.includes("vercel")
    ? new Response(JSON.stringify({ projectId: 'prj_123', readyState: 'READY', target: 'production', meta: { githubCommitSha: 'b'.repeat(40) } }), { status: 200 })
    : new Response(JSON.stringify({ data: { serviceInstance: { latestDeployment: null } } }), { status: 200 });
  await assert.rejects(() => verifyDeployments({ env, fetchImpl, log: () => {} }), /não confirmado/);
});

test("falha diante de erro GraphQL mesmo com HTTP 200", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ errors: [{ message: "denied" }] }), { status: 200 });
  await assert.rejects(() => checkRailway(readConfig(env), fetchImpl), /GraphQL retornou erro/);
});

test("recusa preview, projeto trocado e versão anterior no domínio", async () => {
  for (const variant of [
    { projectId: 'prj_123', target: 'preview', readyState: 'READY', meta: { githubCommitSha: sha } },
    { projectId: 'prj_123', target: 'production', readyState: 'READY', meta: { githubCommitSha: 'b'.repeat(40) } },
  ]) assert.equal(await checkVercel(readConfig(env), async () => Response.json(variant)), null);
  await assert.rejects(() => checkVercel(readConfig(env), async () => Response.json({ projectId: 'another-project' })), /não pertence/);
});

test("falhas de JSON e metadados não expõem a resposta recebida", async () => {
  await assert.rejects(() => checkVercel(readConfig(env), async () => new Response('secret-provider-body')), /JSON inválido/);
  await assert.rejects(() => checkRailway(readConfig(env), async () => Response.json({ data: { serviceInstance: { latestDeployment: { meta: 'secret-provider-body' } } } })), /metadados inválidos/);
});
