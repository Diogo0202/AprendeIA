// Somente PostgreSQL WASM em memória. Não lê ambiente, credenciais ou banco remoto.
// Execução: node scripts/validation/legal-versions-database.mjs
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const directory = new URL('../../supabase/migrations/', import.meta.url);
const migration = '20261110140000_legal_document_versions.sql';
const legalSQL = readFileSync(new URL(migration, directory), 'utf8');
const signatures = [
  'private.handle_new_user()',
  'public.record_privacy_policy_acceptance(uuid,text,text)',
  'private.gamification_visible(uuid)',
];
let passed = 0;
async function check(name, operation) {
  await operation();
  console.log(`OK ${++passed}: ${name}`);
}
async function asRole(role, operation) {
  assert.ok(['anon', 'authenticated', 'service_role', 'legal_untrusted'].includes(role));
  await db.exec(`set role ${role}`);
  try { return await operation(); } finally { await db.exec('reset role'); }
}
const denied = operation => assert.rejects(operation, error => error.code === '42501');
const current = async () => (await db.query(
  'select public.get_current_legal_document_versions() as documents',
)).rows[0].documents;
const visible = async id => (await db.query(
  'select private.gamification_visible($1) as visible', [id],
)).rows[0].visible;
async function definitions() {
  return (await db.query(`
    select oid::text, pg_get_functiondef(oid) as body, proacl::text, prosecdef, proconfig
    from pg_proc where oid = any($1::regprocedure[]) order by oid
  `, [signatures])).rows;
}
async function signup(privacy, terms, extra = {}, app = {}) {
  const id = randomUUID();
  await db.query(`insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data)
    values ($1,$2,$3::jsonb,$4::jsonb)`, [id, `${id}@example.test`, JSON.stringify({
    full_name: 'Pessoa de teste', age_band: 'adult',
    privacy_policy_accepted: true, privacy_policy_version: privacy,
    terms_of_use_accepted: true, terms_of_use_version: terms, ...extra,
  }), JSON.stringify(app)]);
  return id;
}
const accept = (id, privacy, terms) => asRole('service_role', () => db.query(
  'select public.record_privacy_policy_acceptance($1,$2,$3) as accepted_at', [id, privacy, terms],
));
const publish = (type, version) => asRole('service_role', () => db.query(
  'insert into public.legal_document_versions(document_type,version) values ($1,$2)', [type, version],
));
async function evidence(id) {
  return (await db.query(`select
    (select to_jsonb(p) from public.profiles p where id=$1) as profile,
    (select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]')
       from public.privacy_policy_acceptances a where user_id=$1) as acceptances,
    (select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]')
       from public.access_audit_logs a where user_id=$1) as audit`, [id])).rows[0];
}

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create role legal_untrusted;
    create schema auth;
    create table auth.users (id uuid primary key, email text,
      created_at timestamptz not null default now(),
      raw_user_meta_data jsonb default '{}', raw_app_meta_data jsonb default '{}');
    create table auth.sessions (id uuid primary key default gen_random_uuid(),
      user_id uuid references auth.users(id) on delete cascade);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function public.rls_auto_enable() returns event_trigger
      language plpgsql as $$ begin return; end $$;
    create schema storage;
    create table storage.objects (id uuid primary key default gen_random_uuid(), owner_id text);
    create schema cron;
    create function cron.schedule(text,text,text) returns integer language sql as $$ select 1 $$;
  `);
  // Ordem limitada a esta migration, sem depender de frentes posteriores (1500+).
  for (const file of readdirSync(directory).filter(file => file.endsWith('.sql') && file < migration).sort()) {
    const sql = readFileSync(new URL(file, directory), 'utf8')
      .replace('create extension if not exists pg_cron with schema pg_catalog;', '');
    try { await db.exec(sql); } catch (error) {
      throw new Error(`Migration ${file}: ${error.message}`, { cause: error });
    }
  }
  const beforeDefinitions = await definitions();
  const existingUser = await signup('1.7', '1.0');
  const existingEvidence = await evidence(existingUser);

  await check('preflight aborta marcadores ausentes ou repetidos nas três funções', async () => {
    const markers = [
      "policy_version_value = '1.7'",
      "target_terms_version is distinct from '1.0'",
      "p.privacy_policy_version='1.7'",
    ];
    for (let index = 0; index < signatures.length; index++) {
      const { body } = (await db.query('select pg_get_functiondef($1::regprocedure) as body',
        [signatures[index]])).rows[0];
      const marker = markers[index];
      for (const duplicate of [false, true]) {
        // Muda apenas um fragmento da definição instalada, sem copiar seu corpo.
        const altered = body.replace(marker, duplicate ? `${marker} /* ${marker} */` : marker.replace('1.', '8.'));
        assert.notEqual(altered, body);
        await db.exec(altered);
        try {
          await assert.rejects(db.exec(legalSQL), /marcador ausente ou repetido/);
        } finally { await db.exec('rollback'); }
        assert.equal((await db.query("select to_regclass('public.legal_document_versions') as relation")).rows[0].relation, null);
        // O rollback inclui as funções que o patch já havia processado.
        for (const saved of beforeDefinitions) {
          const actual = (await db.query('select pg_get_functiondef($1::oid) as body', [saved.oid])).rows[0].body;
          assert.equal(actual, saved.body === body ? altered : saved.body);
        }
        await db.exec(body);
      }
    }
  });

  await db.exec(legalSQL);
  await db.exec('grant usage on schema public, private to legal_untrusted');
  const installedDefinitions = await definitions();
  await check('semente 1.7/1.0 preserva perfis, evidências e propriedades das funções', async () => {
    const docs = await asRole('service_role', current);
    assert.equal(docs.privacy.version, '1.7');
    assert.equal(docs.terms.version, '1.0');
    assert.deepEqual(Object.keys(docs).sort(), ['privacy', 'terms']);
    for (const doc of Object.values(docs)) {
      assert.deepEqual(Object.keys(doc).sort(), ['effective_at', 'version']);
      assert.ok(Number.isFinite(Date.parse(doc.effective_at)));
    }
    assert.deepEqual(await evidence(existingUser), existingEvidence);
    for (let index = 0; index < installedDefinitions.length; index++) {
      const { body, ...properties } = installedDefinitions[index];
      const { body: previous, ...oldProperties } = beforeDefinitions[index];
      assert.deepEqual(properties, oldProperties);
      assert.notEqual(body, previous);
      assert.ok(body.includes("private.current_legal_document('privacy')"));
      assert.ok(body.includes("private.current_legal_document('terms')"));
      assert.doesNotMatch(body, /'1\.[07]'/);
    }
    assert.equal(await visible(existingUser), true);
  });

  await check('somente servidor lê/publica versões e executa os helpers/aceite', async () => {
    const functions = ['private.current_legal_document(text)',
      'public.get_current_legal_document_versions()', signatures[1]];
    for (const role of ['anon', 'authenticated', 'legal_untrusted']) {
      for (const signature of functions) {
        assert.equal((await db.query("select has_function_privilege($1,$2,'EXECUTE') as allowed",
          [role, signature])).rows[0].allowed, false);
      }
      await asRole(role, async () => {
        await denied(db.query('select * from public.legal_document_versions'));
        await denied(db.query("insert into public.legal_document_versions(document_type,version) values ('privacy','9.0')"));
        await denied(current());
        await denied(db.query("select private.current_legal_document('privacy')"));
        await denied(db.query('select public.record_privacy_policy_acceptance($1,$2,$3)', [existingUser, '1.7', '1.0']));
      });
    }
    for (const signature of functions) {
      assert.equal((await db.query("select has_function_privilege('service_role',$1,'EXECUTE') as allowed",
        [signature])).rows[0].allowed, true);
      const fn = (await db.query('select prosecdef,proconfig from pg_proc where oid=$1::regprocedure', [signature])).rows[0];
      assert.equal(fn.prosecdef, true);
      assert.ok(fn.proconfig.includes('search_path=""'));
    }
    await asRole('service_role', async () => {
      assert.equal((await db.query('select count(*)::int as n from public.legal_document_versions')).rows[0].n, 2);
      await denied(db.query("update public.legal_document_versions set version='9.0'"));
      await denied(db.query('delete from public.legal_document_versions'));
      await denied(db.query('truncate public.legal_document_versions'));
    });
  });

  await check('RLS bloqueia clientes mesmo com grants de tabela acidentais', async () => {
    const settings = (await db.query(`select relrowsecurity,relforcerowsecurity
      from pg_class where oid='public.legal_document_versions'::regclass`)).rows[0];
    assert.deepEqual(settings, { relrowsecurity: true, relforcerowsecurity: true });
    for (const role of ['anon', 'authenticated']) {
      await db.exec('begin');
      try {
        await db.exec(`grant select,insert on public.legal_document_versions to ${role}; set local role ${role}`);
        assert.deepEqual((await db.query('select * from public.legal_document_versions')).rows, []);
        await denied(db.query("insert into public.legal_document_versions(document_type,version) values ('privacy','9.0')"));
      } finally { await db.exec('rollback'); }
    }
  });

  await check('formato, tipo, duplicatas e datas ambíguas são recusados', async () => {
    for (const version of ['', '1', '1.2.3', '01.2', '1.02', '-1.0', ' 1.0', '1.0\n', '1e2.0', '1000000000.0', null]) {
      await assert.rejects(publish('privacy', version), error => ['23514', '23502'].includes(error.code));
    }
    await assert.rejects(publish('cookies', '1.0'), error => error.code === '23514');
    await assert.rejects(publish('privacy', '1.7'), error => error.code === '23505');
    await assert.rejects(db.query(`insert into public.legal_document_versions(document_type,version,effective_at)
      select document_type,'2.0',effective_at from public.legal_document_versions where document_type='privacy'`),
    error => error.code === '23505');
    await assert.rejects(db.query(`insert into public.legal_document_versions(document_type,version,effective_at)
      values ('privacy','2.0','infinity')`), error => error.code === '23514');
    await assert.rejects(db.query("select private.current_legal_document('cookies')"), error => error.code === 'PT400');
  });

  await check('vigência futura aguarda a data e fonte incompleta falha fechada', async () => {
    await asRole('service_role', () => db.query(`
      insert into public.legal_document_versions(document_type,version,effective_at)
      values ('privacy','99.0',statement_timestamp()+interval '1 day')`));
    assert.equal((await current()).privacy.version, '1.7');
    await db.exec('begin');
    try {
      await db.exec("delete from public.legal_document_versions where document_type='terms'");
      await assert.rejects(current(), error => error.code === 'PT503');
    } finally { await db.exec('rollback'); }
  });

  await check('INSERT de política exige 1.8 e conserva termos 1.0 sem reescrever funções', async () => {
    await publish('privacy', '1.8');
    assert.equal((await current()).privacy.version, '1.8');
    assert.equal((await current()).terms.version, '1.0');
    assert.equal(await visible(existingUser), false);
    await assert.rejects(signup('1.7', '1.0'), /versões vigentes/);
    await assert.rejects(accept(existingUser, '1.7', '1.0'), /Versão da política inválida/);
    assert.deepEqual(await evidence(existingUser), existingEvidence);
    const accepted = await accept(existingUser, '1.8', '1.0');
    const again = await accept(existingUser, '1.8', '1.0');
    assert.deepEqual(again.rows, accepted.rows);
    const updated = await evidence(existingUser);
    assert.equal(updated.profile.privacy_policy_version, '1.8');
    assert.equal(updated.profile.terms_of_use_version, '1.0');
    assert.equal(updated.acceptances.length, existingEvidence.acceptances.length + 1);
    assert.deepEqual(updated.acceptances[0], existingEvidence.acceptances[0]);
    assert.equal(await visible(existingUser), true);
    assert.equal(await visible(await signup('1.8', '1.0')), true);
    assert.deepEqual(await definitions(), installedDefinitions);
  });

  await check('INSERT de termos exige 1.1 e conserva política 1.8', async () => {
    const before = await evidence(existingUser);
    await publish('terms', '1.1');
    const docs = await current();
    assert.equal(docs.privacy.version, '1.8');
    assert.equal(docs.terms.version, '1.1');
    assert.equal(await visible(existingUser), false);
    await assert.rejects(signup('1.8', '1.0'), /versões vigentes/);
    await assert.rejects(accept(existingUser, '1.8', '1.0'), /Versão dos Termos de Uso inválida/);
    await assert.rejects(accept(existingUser, null, '1.1'), /Versão da política inválida/);
    await assert.rejects(accept(existingUser, '1.8', null), /Versão dos Termos de Uso inválida/);
    assert.deepEqual(await evidence(existingUser), before);
    await accept(existingUser, '1.8', '1.1');
    const after = await evidence(existingUser);
    assert.equal(after.profile.privacy_policy_version, '1.8');
    assert.equal(after.profile.terms_of_use_version, '1.1');
    assert.equal(after.acceptances.length, before.acceptances.length + 1);
    assert.equal(await visible(existingUser), true);
    const second = await signup('1.8', '1.1');
    assert.equal(await visible(second), true);
    assert.equal((await evidence(second)).acceptances[0].terms_version, '1.1');
    assert.deepEqual(await definitions(), installedDefinitions);
  });

  await check('demais barreiras de cadastro e gamificação permanecem ativas', async () => {
    for (const extra of [{ privacy_policy_accepted: false }, { terms_of_use_accepted: false }]) {
      await assert.rejects(signup('1.8', '1.1', extra), /versões vigentes/);
    }
    const minor = await signup('1.8', '1.1', { age_band: 'minor' });
    assert.equal(await visible(minor), false);
    const provisioned = await signup(null, null, {}, { account_origin: 'admin_provisioned' });
    assert.equal((await evidence(provisioned)).acceptances.length, 0);
    assert.equal(await visible(provisioned), false);
    await db.query("update public.profiles set registration_status='pending_teacher' where id=$1", [existingUser]);
    assert.equal(await visible(existingUser), false);
    await db.query("update public.profiles set registration_status='active' where id=$1", [existingUser]);
    await db.query("update auth.users set created_at=now()-interval '8 days' where id=$1", [existingUser]);
    assert.equal(await visible(existingUser), false);
  });

  console.log(`LEGAL_VERSIONS_SQL_OK: ${passed} scenarios; SQL real em memória, Auth/Storage/Cron simulados; sem validação remota ou concorrência entre sessões.`);
} finally {
  await db.close();
}
