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
  -- Replica uma tabela interna gerenciada: a migration não deve criar políticas nela.
  create table storage.migrations (id integer primary key);
  alter table storage.migrations enable row level security;
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


// Supabase concede SELECT por padrão; o harness precisa desse grant para testar RLS.
assert.equal((await db.query("select count(*)::integer as count from pg_policies where schemaname='storage' and tablename='migrations' and policyname like 'rf07_%'")).rows[0].count, 0);
await db.exec('grant select on all tables in schema public to authenticated');
const adult = 'd0000000-0000-0000-0000-000000000001';
const minor = 'd0000000-0000-0000-0000-000000000002';
const admin = 'd0000000-0000-0000-0000-000000000003';
const unknown = 'd0000000-0000-0000-0000-000000000004';
// A versão vem do trigger vigente, inclusive quando a migration 1.3 chega.
const legal = (await db.query('select public.get_current_legal_document_versions() as documents')).rows[0].documents;
const policy = legal.privacy.version;
const terms = legal.terms.version;
for (const [id, age] of [[adult,'adult'],[minor,'minor'],[admin,'unknown'],[unknown,'unknown']]) {
  await db.query(`insert into auth.users(id,email,raw_user_meta_data) values ($1,$2,$3)`, [id, id+'@example.test', JSON.stringify({full_name:'Teste',age_band:age,privacy_policy_accepted:true,privacy_policy_version:policy,terms_of_use_accepted:true,terms_of_use_version:terms})]);
}
await db.query("update public.profiles set role='admin' where id=$1", [admin]);
async function asUser(id, op) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec('set role authenticated');
  try { return await op(); } finally { await db.exec('reset role'); }
}
const allowed = async id => asUser(id, async () => (await db.query('select private.lifecycle_access() ok')).rows[0].ok);
assert.equal(await allowed(adult),true);
assert.equal(await allowed(minor),false);
assert.equal(await allowed(unknown),false);
assert.equal(await allowed(admin),true);
assert.equal(await asUser(minor,async () => (await db.query('select id from public.profiles')).rows.length),1);
assert.equal(await asUser(minor,async () => (await db.query('select id from public.subjects')).rows.length),0);
await asUser(adult, () => assert.rejects(db.query("update public.profiles set age_band='minor' where id=$1",[adult]),e=>e.code==='42501'));
// Mesmo com um grant acidental, o trigger impede a escrita.
await db.exec('grant update(age_band,account_expires_at) on public.profiles to authenticated');
await asUser(adult, () => assert.rejects(db.query("update public.profiles set age_band='minor' where id=$1",[adult]),e=>e.code==='42501'));
await asUser(adult, () => assert.rejects(db.query("select public.declare_account_age($1,'adult')",[minor]),e=>e.code==='42501'));
await db.query("select public.declare_account_age($1,'minor')",[unknown]);
await assert.rejects(db.query("select public.declare_account_age($1,'adult')",[unknown]),e=>e.code==='PT409');
const params=[minor,'Responsável','contato@example.test','Instituição protocolo 42','1'];
const admission=(await db.query('select public.request_account_admission($1,$2,$3,$4,$5) item',params)).rows[0].item;
await assert.rejects(db.query('select public.request_account_admission($1,$2,$3,$4,$5)',params),e=>e.code==='PT409');
await assert.rejects(db.query("select public.review_account_admission($1,$2,'approved','1','Conferido')",[adult,admission.id]),e=>e.code==='PT403');
await assert.rejects(db.query("select public.review_account_admission($1,$2,'approved','2','Conferido')",[admin,admission.id]),e=>e.code==='PT400');
await db.query("select public.review_account_admission($1,$2,'approved','1','Conferido')",[admin,admission.id]);
assert.equal(await allowed(minor),true);
await assert.rejects(db.query("select public.review_account_admission($1,$2,'rejected','1','Conferido')",[admin,admission.id]),e=>e.code==='PT409');
await db.query("update auth.users set created_at=now()-interval '168 hours' where id in ($1,$2,$3)",[adult,minor,admin]);
assert.equal(await allowed(adult),false);
assert.equal(await allowed(minor),false);
assert.equal(await allowed(admin),true);
assert.equal(await asUser(adult,async () => (await db.query('select id from public.subjects')).rows.length),0);
await db.query("update public.profiles set full_name='Nome atual' where id=$1",[adult]);
const times=(await db.query('select auth_created_at,account_expires_at from public.profiles where id=$1',[adult])).rows[0];
assert.equal(new Date(times.account_expires_at)-new Date(times.auth_created_at),168*3600*1000);
const preview=(await db.query('select public.preview_account_retention() item')).rows[0].item;
assert.equal(preview.execution_enabled,false);
assert.equal(preview.requires_summary_before_removal,true);
assert.equal(preview.expired_accounts,2);
assert.equal((await db.query('select count(*)::int n from auth.users')).rows[0].n,4);
// Cada tabela pública com RLS recebe as quatro políticas restritivas.
assert.equal((await db.query(`select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity and (select count(*) from pg_policy p where p.polrelid=c.oid and p.polname like 'rf07_%' and not p.polpermissive)<>4`)).rows[0].n,0);
await db.close();
console.log('POSTGRESQL_RF07_OK: SQL real, prazo, admissão, trigger, RLS e retenção fechada; Auth/Storage simulados.');
