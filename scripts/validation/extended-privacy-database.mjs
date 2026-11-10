// PostgreSQL WASM isolado: roda o SQL real sem credenciais ou dados de usuários.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text, created_at timestamptz not null default now(), raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}');
  create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create function public.rls_auto_enable() returns event_trigger language plpgsql as $$ begin return; end $$;
  create schema storage;
  create table storage.objects (id uuid primary key default gen_random_uuid(), owner_id text);
  create schema cron;
  create function cron.schedule(text,text,text) returns integer language sql as $$ select 1 $$;
`);
const directory = new URL('../../supabase/migrations/', import.meta.url);
for (const file of readdirSync(directory).filter((file) => file.endsWith('.sql')).sort()) {
  let sql = readFileSync(new URL(file, directory), 'utf8');
  // Apenas o agendador é substituído; tabelas, funções PL/pgSQL e políticas são reais.
  sql = sql.replace('create extension if not exists pg_cron with schema pg_catalog;', '');
  try { await db.exec(sql); } catch (error) {
    const offset = Number(error.position || 1) - 1;
    throw new Error(`Migration ${file}: ${error.message} (${error.position}); contexto: ${sql.slice(offset - 160, offset + 160)}`);
  }
}

let passed = 0;
async function check(name, operation) {
  await operation();
  passed++;
  console.log(`OK ${name}`);
}
// As versões vêm do trigger vigente, para o teste acompanhar novas versões da política.
const legal = (await db.query('select public.get_current_legal_document_versions() as documents')).rows[0].documents;
const policyVersion = legal.privacy.version;
const termsVersion = legal.terms.version;
function consent(extra = {}) {
  return { full_name: 'Nome de teste', age_band: 'adult', privacy_policy_accepted: true, privacy_policy_version: policyVersion, terms_of_use_accepted: true, terms_of_use_version: termsVersion, ...extra };
}
async function user(id, role = 'student') {
  await db.query(`insert into auth.users(id,email,raw_user_meta_data) values ($1,$2,$3::jsonb)`, [id, `${id}@example.test`, JSON.stringify(consent())]);
  if (role !== 'student') await db.query('update public.profiles set role=$2::public.app_role where id=$1', [id, role]);
  await db.query('insert into auth.sessions(user_id) values ($1)', [id]);
}
async function request(owner, kind, corrections = {}) {
  return (await db.query(`insert into public.privacy_requests(user_id,kind,details,corrections) values ($1,$2,'texto pessoal',$3::jsonb) returning id`, [owner, kind, JSON.stringify(corrections)])).rows[0].id;
}
async function resolve(admin, id, decision = 'complete', confirmation = '', hash = null, response = 'Medida aplicada; referência AT-42.') {
  return (await db.query('select public.resolve_privacy_request($1,$2,$3,$4,$5,$6) as result', [admin, id, decision, response, confirmation, hash])).rows[0].result;
}

const admin = 'a0000000-0000-0000-0000-000000000011';
const owner = 'b0000000-0000-0000-0000-000000000011';
const stranger = 'b0000000-0000-0000-0000-000000000012';
await user(admin, 'admin'); await user(owner); await user(stranger);
const kinds = ['confirmation', 'sharing', 'opposition', 'revocation', 'portability', 'automated_review'];
const denied = (operation, code) => assert.rejects(operation, error => error.code === code);
async function snapshot() {
  const tables = ['auth.users', 'auth.sessions', 'public.profiles', 'public.access_audit_logs',
    'public.privacy_policy_acceptances', 'private.login_rate_limits', 'private.api_rate_limits'];
  return Promise.all(tables.map(async table => (await db.query(`select to_jsonb(t) as row from ${table} t order by to_jsonb(t)::text`)).rows));
}
await db.query(`insert into public.access_audit_logs(actor_id,actor_role,subject_hash,action,request_method,route,status_code,outcome,request_id,resource,user_id)
  values ($1,'student',$2,'privacy.read','GET','/privacy/requests',200,'success',gen_random_uuid(),'privacy_requests',$1)`, [owner, 'a'.repeat(64)]);
await db.query("insert into private.login_rate_limits(key_kind,key_hash,failed_attempts) values ('identity',$1,2)", ['a'.repeat(64)]);
await db.query("insert into private.api_rate_limits(actor_id,action,request_count) values ($1,'privacy_request_write',3)", [owner]);
const before = await snapshot();
for (const kind of kinds) {
  const id = await request(owner, kind);
  await check(`${kind}: duplicate, actor, expiry, response and confirmation checks`, async () => {
    await denied(request(owner, kind), '23505');
    await denied(resolve(stranger, id), 'PT403');
    const own = await request(admin, kind);
    await denied(resolve(admin, own), 'PT403');
    await denied(resolve(admin, id, 'invalid'), 'PT400');
    for (const response of [null, '', ' ', 'x'.repeat(1001)])
      await denied(resolve(admin, id, 'complete', '', null, response), 'PT400');
    await db.query("update public.privacy_requests set expires_at=now()-interval '1 second' where id=$1", [id]);
    await denied(resolve(admin, id), 'PT404');
    await db.query("update public.privacy_requests set expires_at=now()+interval '1 day' where id=$1", [id]);
    const word = ['opposition', 'revocation'].includes(kind) ? 'MEDIDA CONFIRMADA' : '';
    if (word) {
      for (const confirmation of [null, '', 'medida confirmada'])
        await denied(resolve(admin, id, 'complete', confirmation), 'PT400');
      assert.equal((await db.query('select status from public.privacy_requests where id=$1', [id])).rows[0].status, 'pending');
    }
    const result = await resolve(admin, id, 'complete', word);
    assert.equal(result.kind, kind);
    assert.equal(result.status, 'completed');
    assert.equal(result.response, 'Medida aplicada; referência AT-42.');
    assert.equal(result.reviewed_by, admin);
    assert.ok(result.resolved_at);
    await denied(resolve(admin, id, 'complete', word), 'PT409');
    const rejection = await request(owner, kind);
    assert.equal((await resolve(admin, rejection, 'reject')).status, 'rejected');
    const cancellation = await request(owner, kind);
    await denied(db.query('select public.cancel_privacy_request($1,$2)', [stranger, cancellation]), 'PT404');
    assert.equal((await db.query('select public.cancel_privacy_request($1,$2) as result', [owner, cancellation])).rows[0].result.status, 'cancelled');
    await denied(db.query(`insert into public.privacy_requests(user_id,kind,corrections) values ($1,$2,'{"grade":"8"}')`, [owner, kind]), '23514');
  });
}
await check('assisted resolution preserves Auth, sessions, profiles, consent and logs', async () => {
  assert.deepEqual(await snapshot(), before);
});
await check('unknown kinds remain blocked', () => denied(request(owner, 'invented'), '23514'));
// PGlite serializes one connection; this checks duplicate decisions, not multi-session lock contention.
await check('queued competing decisions have exactly one winner', async () => {
  const id = await request(owner, 'opposition');
  const results = await Promise.allSettled([
    resolve(admin, id, 'complete', 'MEDIDA CONFIRMADA'),
    resolve(admin, id, 'reject'),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'PT409');
});
await check('RPC grants, hardened search path and RLS remain intact', async () => {
  const signature = 'public.resolve_privacy_request(uuid,uuid,text,text,text,text)';
  for (const role of ['anon', 'authenticated']) {
    assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') as allowed", [role, signature])).rows[0].allowed, false);
    await db.exec(`set role ${role}`);
    try {
      await denied(db.query('select * from public.privacy_requests'), '42501');
      await denied(resolve(admin, null), '42501');
    } finally { await db.exec('reset role'); }
  }
  assert.equal((await db.query("select has_function_privilege('service_role',$1,'EXECUTE') as allowed", [signature])).rows[0].allowed, true);
  const settings = (await db.query('select prosecdef, proconfig from pg_proc where oid=$1::regprocedure', [signature])).rows[0];
  assert.equal(settings.prosecdef, true);
  assert.ok(settings.proconfig.includes('search_path=""'));
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.privacy_requests'::regclass")).rows[0].relrowsecurity, true);
});
await db.close();
console.log(`EXTENDED_PRIVACY_SQL_OK: ${passed} scenarios; real application SQL, isolated PostgreSQL; Auth/Storage/Cron stubs.`);
