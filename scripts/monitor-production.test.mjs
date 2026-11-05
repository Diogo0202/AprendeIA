import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  readConfig,
  probe,
  confirmProbe,
  isAppHtml,
  safeReport,
  reconcileAlert,
  createGitHubClient,
  runMonitor,
} from "./monitor-production.mjs";

const html =
  '<!doctype html><title>AprendeIA | Reforço escolar</title><div id="root"></div><script type="module" src="/assets/app.js"></script>';
const env = {
  MONITOR_FRONTEND_URL: "https://web.example/",
  MONITOR_API_URL: "https://api.example/api",
};
const ready = { status: "ready", service: "aprendeIA", ai_configured: false };
const uuid = "fe387bba-7189-4d9a-81b3-aa3b26ef78b0";
const response = (
  body = ready,
  status = 200,
  type = "application/json",
  headers = {},
) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": type, ...headers },
  });
const result = (changes = {}) => ({
  service: "api",
  ok: false,
  reason: "http",
  status: 503,
  latencyMs: 14,
  ...changes,
});

function fakeGitHub(initial = []) {
  const issues = structuredClone(initial);
  const calls = [];
  return {
    issues,
    calls,
    async listOpenIssues() {
      return issues.filter((issue) => issue.state !== "closed");
    },
    async createIssue(payload) {
      calls.push(["create", payload]);
      issues.push({
        number: issues.length + 1,
        user: { login: "github-actions[bot]" },
        ...payload,
      });
    },
    async updateIssue(number, payload) {
      calls.push(["update", number, payload]);
      Object.assign(
        issues.find((issue) => issue.number === number),
        payload,
      );
    },
  };
}

test("importação direta não inicia rede nem escreve relatórios", () => {
  const moduleUrl = new URL("./monitor-production.mjs", import.meta.url).href;
  const child = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `globalThis.fetch = () => { throw new Error('rede proibida'); }; await import(${JSON.stringify(moduleUrl)});`,
    ],
    { encoding: "utf8", timeout: 5000 },
  );
  assert.equal(child.status, 0);
  assert.equal(child.stdout, "");
  assert.equal(child.stderr, "");
});

test("configuração exige escolha explícita HTTPS e preserva prefixo da API", () => {
  assert.equal(readConfig(env).api.url, "https://api.example/api/health/ready");
  assert.equal(
    readConfig({ ...env, MONITOR_API_URL: "https://api.example/" }).api.url,
    "https://api.example/health/ready",
  );
  for (const value of [
    undefined,
    "",
    "   ",
    "http://web.example",
    "https://user:secret@web.example/",
    "https://web.example/?token=secret",
    "https://web.example/#secret",
    "invalid",
  ]) {
    const config = readConfig({
      MONITOR_FRONTEND_URL: value,
      MONITOR_API_URL: value,
    });
    assert.deepEqual(config, {
      frontend: { error: "configuration" },
      api: { error: "configuration" },
    });
    assert.ok(!JSON.stringify(config).includes("secret"));
  }
});

test("configuração ausente falha antes de fetch", async () => {
  const actual = await probe("frontend", readConfig({}).frontend, {
    fetchImpl: () => assert.fail("fetch indevido"),
  });
  assert.equal(actual.reason, "configuration");
  assert.equal(actual.ok, false);
});

test("limite de lentidão tem faixa explícita e recusa configuração inválida", () => {
  assert.equal(readConfig(env).api.latencyThresholdMs, 5000);
  for (const value of ["100", "2500", "9000"]) {
    assert.equal(
      readConfig({ ...env, MONITOR_MAX_LATENCY_MS: value }).api
        .latencyThresholdMs,
      Number(value),
    );
  }
  for (const value of [
    "0",
    "99",
    "9001",
    "NaN",
    "2.5",
    "5s",
    "-1",
    "Infinity",
    "1e3",
  ]) {
    assert.equal(
      readConfig({ ...env, MONITOR_MAX_LATENCY_MS: value }).api.error,
      "configuration",
    );
  }
});

test("resposta válida lenta vira aviso, mas erro HTTP mantém a causa original", async () => {
  const options = (status = 200) => {
    let tick = 0;
    return {
      fetchImpl: async () => response(ready, status),
      now: () => (tick++ ? 6000 : 0),
    };
  };
  const slow = await probe("api", readConfig(env).api, options());
  assert.equal(slow.ok, false);
  assert.equal(slow.reason, "latency");
  assert.equal(slow.status, 200);
  assert.equal(slow.latencyMs, 6000);
  assert.equal(slow.latencyThresholdMs, 5000);
  assert.equal(
    (await probe("api", readConfig(env).api, options(503))).reason,
    "http",
  );
  assert.equal(
    (
      await probe(
        "api",
        readConfig({ ...env, MONITOR_MAX_LATENCY_MS: "7000" }).api,
        options(),
      )
    ).ok,
    true,
  );
});

test("uma falha transitória recuperada na segunda tentativa não fica confirmada", async () => {
  let calls = 0;
  const waits = [];
  const actual = await confirmProbe("api", readConfig(env).api, {
    probeImpl: async () =>
      calls++
        ? result({ ok: true, reason: "ok", status: 200 })
        : result({ reason: "network", status: null }),
    sleep: async (ms) => waits.push(ms),
  });
  assert.equal(actual.ok, true);
  assert.equal(actual.attempts, 2);
  assert.equal(calls, 2);
  assert.deepEqual(waits, [1000]);
});

test("falha persistente tem duas tentativas e registra a última resposta", async () => {
  let calls = 0;
  const actual = await confirmProbe("api", readConfig(env).api, {
    probeImpl: async () => result({ status: calls++ ? 404 : 503 }),
    sleep: async () => {},
  });
  assert.equal(actual.ok, false);
  assert.equal(actual.status, 404);
  assert.equal(actual.attempts, 2);
  assert.equal(calls, 2);
});

test("configuração inválida e resposta saudável dispensam repetição", async () => {
  for (const expected of [
    result({ reason: "configuration", status: null }),
    result({ ok: true, reason: "ok", status: 200 }),
  ]) {
    let calls = 0;
    const actual = await confirmProbe(
      "api",
      {},
      {
        probeImpl: async () => {
          calls++;
          return expected;
        },
        sleep: async () => assert.fail("espera indevida"),
      },
    );
    assert.equal(actual.attempts, 1);
    assert.equal(calls, 1);
  }
});

test("ready confirma status e serviço reais e registra apenas UUID válido", async () => {
  const actual = await probe("api", readConfig(env).api, {
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://api.example/api/health/ready");
      assert.equal(options.redirect, "manual");
      assert.equal(options.credentials, "omit");
      assert.deepEqual(options.headers, { accept: "application/json" });
      return response(ready, 200, "application/json; charset=utf-8", {
        "x-request-id": uuid,
      });
    },
  });
  assert.equal(actual.ok, true);
  assert.equal(actual.requestId, uuid);
  assert.equal(actual.status, 200);
  assert.ok(actual.latencyMs >= 0);
  for (const payload of [
    { status: "ok", service: "aprendeIA" },
    { status: "ready", service: "other" },
    null,
    "{bad",
    html,
  ]) {
    assert.equal(
      (
        await probe("api", readConfig(env).api, {
          fetchImpl: async () => response(payload),
        })
      ).reason,
      "content",
    );
  }
  const invalidId = await probe("api", readConfig(env).api, {
    fetchImpl: async () =>
      response(ready, 200, "text/html", {
        "x-request-id": "[click](https://secret)",
      }),
  });
  assert.equal(invalidId.reason, "content");
  assert.equal(invalidId.requestId, undefined);
});

test("frontend valida HTML da aplicação, inclusive o index atual do checkout", async () => {
  assert.equal(isAppHtml(html), true);
  assert.equal(
    isAppHtml(
      await readFile(
        new URL("../frontend/index.html", import.meta.url),
        "utf8",
      ),
    ),
    true,
  );
  // O teste lê o contrato atual sem alterar o frontend.
  for (const body of [
    "ok",
    '<title>Login</title><div id="root"></div>',
    html.replace(
      "AprendeIA | Reforço escolar",
      "Vercel Authentication AprendeIA",
    ),
    html.replace('<div id="root"></div>', '<!-- <div id="root"></div> -->'),
    html.replace(
      '<div id="root"></div>',
      "<script>const text = '<div id=\"root\"></div>';</script>",
    ),
    html + '<input type="password">',
    html.replace('id="root"', 'id="other"'),
  ]) {
    assert.equal(isAppHtml(body), false);
  }
  assert.equal(
    (
      await probe("frontend", readConfig(env).frontend, {
        fetchImpl: async () => response(html, 201, "text/html"),
      })
    ).ok,
    true,
  );
  assert.equal(
    (
      await probe("frontend", readConfig(env).frontend, {
        fetchImpl: async () => response(html, 200, "text/plain"),
      })
    ).reason,
    "content",
  );
});

test("redirects e erros HTTP não publicam corpo nem localização", async () => {
  for (const status of [301, 302, 307, 308, 401, 403, 429, 503]) {
    let count = 0;
    const actual = await probe("api", readConfig(env).api, {
      fetchImpl: async () => {
        count++;
        return response("private token", status, "text/plain", {
          location: "https://secret.example/?token=private",
        });
      },
    });
    assert.equal(count, 1);
    assert.equal(actual.reason, status < 400 ? "redirect" : "http");
    assert.ok(!JSON.stringify(actual).includes("private"));
  }
});

test("prazo cobre conexão e leitura, com limite de corpo e erro sanitizado", async () => {
  assert.equal(
    (
      await probe("api", readConfig(env).api, {
        timeoutMs: 15,
        fetchImpl: () => new Promise(() => {}),
      })
    ).reason,
    "timeout",
  );
  assert.equal(
    (
      await probe("api", readConfig(env).api, {
        timeoutMs: 15,
        fetchImpl: async () =>
          new Response(new ReadableStream({ start() {} }), {
            headers: { "content-type": "application/json" },
          }),
      })
    ).reason,
    "timeout",
  );
  assert.equal(
    (
      await probe("api", readConfig(env).api, {
        fetchImpl: async () => response("x".repeat(262145)),
      })
    ).reason,
    "body-limit",
  );
  const actual = await probe("api", readConfig(env).api, {
    fetchImpl: async () => {
      throw new Error("https://private.example/?password=secret");
    },
  });
  assert.equal(actual.reason, "network");
  assert.ok(!JSON.stringify(actual).includes("secret"));
});

test("fetch nativo contra HTTP em loopback verifica parsing, redirect e abort", async (t) => {
  let destinationHits = 0;
  const server = createServer((req, res) => {
    if (req.url === "/redirect") {
      res.writeHead(302, { location: "/destination" });
      res.end();
    } else if (req.url === "/destination") {
      destinationHits++;
      res.end();
    } else if (req.url === "/slow") {
      res.writeHead(200, { "content-type": "application/json" });
      res.flushHeaders();
    } else {
      assert.equal(req.headers.authorization, undefined);
      assert.equal(req.headers.cookie, undefined);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(ready));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const localFetch = (url, options) =>
    fetch(origin + new URL(url).pathname, options);
  assert.equal(
    (
      await probe(
        "api",
        { url: "https://test.example/ready" },
        { fetchImpl: localFetch },
      )
    ).ok,
    true,
  );
  assert.equal(
    (
      await probe(
        "api",
        { url: "https://test.example/redirect" },
        { fetchImpl: localFetch },
      )
    ).reason,
    "redirect",
  );
  assert.equal(destinationHits, 0);
  assert.equal(
    (
      await probe(
        "api",
        { url: "https://test.example/slow" },
        { fetchImpl: localFetch, timeoutMs: 50 },
      )
    ).reason,
    "timeout",
  );
});

test("alerta persistente cria, fica quieto, atualiza mudança e fecha recuperação", async () => {
  const client = fakeGitHub();
  await reconcileAlert(result(), client);
  assert.equal(client.calls.length, 1);
  assert.match(client.issues[0].body, /<!-- aprendeia-rf32:api:v1 -->/);
  assert.match(client.issues[0].title, /api/);
  await reconcileAlert(result({ latencyMs: 999, requestId: uuid }), client);
  assert.equal(client.calls.length, 1);
  await reconcileAlert(result({ status: 502 }), client);
  assert.equal(client.calls.length, 2);
  await reconcileAlert(result({ ok: true, reason: "ok", status: 200 }), client);
  assert.equal(client.issues[0].state, "closed");
  await reconcileAlert(result({ ok: true, reason: "ok", status: 200 }), client);
  assert.equal(client.calls.length, 3);
  await reconcileAlert(result(), client);
  assert.equal(client.calls.at(-1)[0], "create");
});

test("serviços independentes ignoram PR e marcador parcial; recovery fecha duplicatas antigas", async () => {
  const client = fakeGitHub([
    { number: 1, body: "texto <!-- aprendeia-rf32:api:v1 -->" },
    { number: 2, body: "<!-- aprendeia-rf32:api:v1 -->", pull_request: {} },
  ]);
  await reconcileAlert(result(), client);
  await reconcileAlert(result({ service: "frontend" }), client);
  assert.equal(client.calls.filter(([kind]) => kind === "create").length, 2);
  client.issues.push({
    number: 5,
    body: "<!-- aprendeia-rf32:api:v1 -->",
    user: { login: "github-actions[bot]" },
  });
  await reconcileAlert(result({ ok: true, reason: "ok" }), client);
  assert.equal(
    client.issues.find((issue) => issue.number === 5).state,
    "closed",
  );
  assert.equal(
    client.issues.find((issue) => issue.pull_request).state,
    undefined,
  );
});

test("marcador copiado por outra pessoa não bloqueia nem recebe alterações do monitor", async () => {
  const outsider = {
    number: 8,
    body: "<!-- aprendeia-rf32:api:v1 -->",
    user: { login: "outra-pessoa" },
  };
  const client = fakeGitHub([outsider]);
  await reconcileAlert(result(), client);
  assert.equal(client.calls[0][0], "create");
  await reconcileAlert(result({ ok: true, reason: "ok", status: 200 }), client);
  assert.equal(client.issues[0].state, undefined);
  assert.equal(client.issues[1].state, "closed");
});

test("lentidão tem categoria própria, fica quieta e muda de causa se houver queda", async () => {
  const client = fakeGitHub();
  await reconcileAlert(
    result({
      reason: "latency",
      status: 200,
      latencyMs: 6000,
      latencyThresholdMs: 5000,
      attempts: 2,
    }),
    client,
  );
  assert.equal(client.calls.length, 1);
  assert.match(client.issues[0].title, /Lentidão/);
  assert.match(client.issues[0].body, /Limite de latência: 5000 ms/);
  assert.match(client.issues[0].body, /Tentativas nesta verificação: 2/);
  await reconcileAlert(
    result({ reason: "latency", status: 200, latencyMs: 8000, attempts: 2 }),
    client,
  );
  assert.equal(client.calls.length, 1);
  await reconcileAlert(result(), client);
  assert.equal(client.calls.length, 2);
  assert.match(client.issues[0].title, /Indisponibilidade/);
  await reconcileAlert(result({ ok: true, reason: "ok", status: 200 }), client);
  assert.equal(client.issues[0].state, "closed");
});

test("metadados de tentativas e limite não permitem campos livres no alerta", () => {
  const report = safeReport(
    result({
      reason: "latency",
      attempts: "2\n@everyone",
      latencyThresholdMs: Infinity,
    }),
  );
  assert.equal(report.attempts, undefined);
  assert.equal(report.latencyThresholdMs, undefined);
  assert.ok(!JSON.stringify(report).includes("@everyone"));
});

test("relatório e Markdown bloqueiam injeção e campos livres", async () => {
  const malicious = result({
    reason: "[x](https://secret)",
    requestId: uuid + "\n@everyone",
    status: "200\nsecret",
    latencyMs: Infinity,
    url: "https://secret",
  });
  assert.deepEqual(safeReport(malicious), {
    service: "api",
    ok: false,
    reason: "network",
    status: null,
    latencyMs: 0,
  });
  const client = fakeGitHub();
  await reconcileAlert(malicious, client);
  assert.ok(!JSON.stringify(client.calls).includes("secret"));
  assert.ok(!JSON.stringify(client.calls).includes("@everyone"));
  await assert.rejects(
    reconcileAlert(result({ service: "@everyone" }), client),
  );
});

test("cliente GitHub pagina antes de criar e mantém token apenas na API fixa", async () => {
  const calls = [];
  const client = createGitHubClient({
    repository: "owner/repo",
    token: "private-token",
    fetchImpl: async (url, options) => {
      calls.push([url, options]);
      assert.ok(url.startsWith("https://api.github.com/repos/owner/repo/"));
      assert.equal(options.redirect, "error");
      assert.equal(options.headers.authorization, "Bearer private-token");
      if (new URL(url).searchParams.get("page") === "1")
        return response(
          Array.from({ length: 100 }, (_, index) => ({
            number: index + 1,
            body: "",
          })),
        );
      if (new URL(url).searchParams.get("page") === "2")
        return response([
          {
            number: 101,
            user: { login: "github-actions[bot]" },
            body: "<!-- aprendeia-rf32:api:v1 -->\n<!-- state:http:503 -->",
          },
        ]);
      return response({});
    },
  });
  await reconcileAlert(result(), client);
  assert.equal(calls.length, 2);
  await client.createIssue({ title: "fixed", body: "fixed" });
  await client.updateIssue(101, { state: "closed" });
  assert.equal(calls.at(-1)[1].method, "PATCH");
  assert.throws(() => client.updateIssue("../secret", {}));
  assert.throws(() =>
    createGitHubClient({ repository: "owner/repo?private", token: "x" }),
  );
});

test("cliente GitHub sanitiza erros e interrompe paginação incompleta", async () => {
  for (const fetchImpl of [
    async () => response("secret", 403),
    async () => {
      throw new Error("secret-token");
    },
    async () => response("secret", 302),
    async () => response("invalid JSON"),
  ]) {
    const client = createGitHubClient({
      repository: "owner/repo",
      token: "secret-token",
      fetchImpl,
    });
    await assert.rejects(client.listOpenIssues(), {
      message: "Falha na API GitHub; detalhes omitidos.",
    });
  }
  let count = 0;
  const client = createGitHubClient({
    repository: "owner/repo",
    token: "x",
    fetchImpl: async () => {
      count++;
      return response(Array.from({ length: 100 }, () => ({ body: "" })));
    },
  });
  await assert.rejects(reconcileAlert(result(), client), /Limite de paginação/);
  assert.equal(count, 20);
  const stalled = createGitHubClient({
    repository: "owner/repo",
    token: "secret",
    timeoutMs: 15,
    fetchImpl: () => new Promise(() => {}),
  });
  await assert.rejects(stalled.listOpenIssues(), {
    message: "Falha na API GitHub; detalhes omitidos.",
  });
});

test("fetch nativo da API GitHub rejeita redirect sem reenviar autorização", async (t) => {
  let destinationHits = 0;
  const server = createServer((req, res) => {
    if (req.url === "/destination") {
      destinationHits++;
      res.end("{}");
    } else {
      assert.equal(req.headers.authorization, "Bearer local-test-token");
      res.writeHead(302, { location: "/destination" });
      res.end("private response");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const client = createGitHubClient({
    repository: "owner/repo",
    token: "local-test-token",
    fetchImpl: (_, options) =>
      fetch(`http://127.0.0.1:${server.address().port}/redirect`, options),
  });
  await assert.rejects(client.listOpenIssues(), {
    message: "Falha na API GitHub; detalhes omitidos.",
  });
  assert.equal(destinationHits, 0);
});

test("workflow fixa frequência, permissões e concorrência sem interpolar variáveis no shell", async () => {
  const workflow = await readFile(
    new URL("../.github/workflows/external-monitor.yml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /cron: '\*\/5 \* \* \* \*'/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /timeout-minutes: 3/);
  assert.match(workflow, /runs-on: ubuntu-latest/);
  assert.match(workflow, /node-version: '22'/);
  assert.match(workflow, /contents: read\s+issues: write/);
  assert.match(
    workflow,
    /group: aprendeia-rf32-external-monitor\s+cancel-in-progress: false/,
  );
  assert.match(workflow, /persist-credentials: false/);
  assert.match(
    workflow,
    /ref: \$\{\{ github.event.repository.default_branch \}\}/,
  );
  assert.match(
    workflow,
    /MONITOR_FRONTEND_URL: \$\{\{ vars.MONITOR_FRONTEND_URL \}\}/,
  );
  assert.match(workflow, /MONITOR_API_URL: \$\{\{ vars.MONITOR_API_URL \}\}/);
  assert.match(
    workflow,
    /MONITOR_MAX_LATENCY_MS: \$\{\{ vars.MONITOR_MAX_LATENCY_MS \}\}/,
  );
  assert.doesNotMatch(workflow, /secrets\.|run:.*\$\{\{/);
});

test("orquestração retorna falha por configuração e tenta ambos os alertas", async () => {
  const logs = [];
  const client = fakeGitHub();
  assert.equal(
    await runMonitor({
      env: {},
      clientGH: client,
      fetchImpl: () => assert.fail("rede indevida"),
      log: (message) => logs.push(message),
    }),
    1,
  );
  assert.equal(client.calls.length, 2);
  assert.ok(logs.every((entry) => !entry.includes("https://")));
  const healthyFetch = async (url) =>
    url.includes("/health/ready")
      ? response()
      : response(html, 200, "text/html");
  assert.equal(
    await runMonitor({
      env,
      clientGH: client,
      fetchImpl: healthyFetch,
      log() {},
    }),
    0,
  );
  assert.ok(client.issues.every((issue) => issue.state === "closed"));
  let attempts = 0;
  assert.equal(
    await runMonitor({
      env,
      clientGH: {
        async listOpenIssues() {
          attempts++;
          throw new Error("secret");
        },
      },
      fetchImpl: healthyFetch,
      log: (message) => logs.push(message),
    }),
    1,
  );
  assert.equal(attempts, 2);
  assert.ok(!logs.join("\n").includes("secret"));
});

test("orquestração não abre incidente para erro transitório recuperado", async () => {
  const counts = { api: 0, frontend: 0 };
  const client = fakeGitHub();
  const code = await runMonitor({
    env,
    clientGH: client,
    sleep: async () => {},
    log() {},
    fetchImpl: async (url) => {
      const service = url.includes("/health/ready") ? "api" : "frontend";
      counts[service]++;
      if (service === "api" && counts.api === 1) return response(ready, 503);
      return service === "api" ? response() : response(html, 200, "text/html");
    },
  });
  assert.equal(code, 0);
  assert.deepEqual(counts, { api: 2, frontend: 1 });
  assert.equal(client.calls.length, 0);
});

test("prévia sem notificações dispensa credencial e não escreve no GitHub", async () => {
  const forbidden = {
    async listOpenIssues() {
      assert.fail("GitHub não deve ser consultado");
    },
  };
  const logs = [];
  const goodFetch = async (url) =>
    url.includes("/health/ready")
      ? response()
      : response(html, 200, "text/html");
  assert.equal(
    await runMonitor({
      env,
      notify: false,
      clientGH: forbidden,
      fetchImpl: goodFetch,
      log: (entry) => logs.push(entry),
    }),
    0,
  );
  assert.equal(logs.length, 2);
  assert.ok(logs.every((entry) => JSON.parse(entry).attempts === 1));
  assert.equal(
    await runMonitor({ env: {}, notify: false, clientGH: forbidden, log() {} }),
    1,
  );
});

test("CLI check-only usa código de saída e argumentos desconhecidos não iniciam probes", () => {
  const script = fileURLToPath(
    new URL("./monitor-production.mjs", import.meta.url),
  );
  const environment = {
    ...process.env,
    MONITOR_FRONTEND_URL: "",
    MONITOR_API_URL: "",
    GITHUB_TOKEN: "forbidden-test-token",
  };
  const checked = spawnSync(process.execPath, [script, "--check-only"], {
    env: environment,
    encoding: "utf8",
    timeout: 5000,
  });
  assert.equal(checked.status, 1);
  assert.equal(checked.stdout.trim().split("\n").length, 2);
  assert.ok(
    checked.stdout
      .trim()
      .split("\n")
      .every((line) => JSON.parse(line).reason === "configuration"),
  );
  assert.doesNotMatch(checked.stdout + checked.stderr, /forbidden-test-token/);
  const invalid = spawnSync(process.execPath, [script, "--unknown"], {
    env: environment,
    encoding: "utf8",
    timeout: 5000,
  });
  assert.equal(invalid.status, 1);
  assert.equal(invalid.stdout, "");
  assert.match(invalid.stderr, /Argumento inválido/);
});
