// PostgreSQL WASM isolado: verifica RLS real sem credenciais ou dados pessoais.
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
for (const file of readdirSync(directory).filter((name) => name.endsWith('.sql')).sort()) {
  let sql = readFileSync(new URL(file, directory), 'utf8');
  sql = sql.replace('create extension if not exists pg_cron with schema pg_catalog;', '');
  try {
    await db.exec(sql);
  } catch (error) {
    throw new Error(`Migration ${file}: ${error.message}`);
  }
}

await db.exec('grant select on all tables in schema public to authenticated, service_role');
const ids = {
  teacher: 'a2000000-0000-0000-0000-000000000001',
  student: 'a2000000-0000-0000-0000-000000000002',
  otherStudent: 'a2000000-0000-0000-0000-000000000003',
  admin: 'a2000000-0000-0000-0000-000000000004',
};
for (const [key, id] of Object.entries(ids)) {
  await db.query(`insert into auth.users(id,email,raw_app_meta_data) values ($1,$2,'{"account_origin":"admin_provisioned"}')`, [id, `${key}@example.test`]);
  const role = key === 'teacher' ? 'teacher' : key === 'admin' ? 'admin' : 'student';
  await db.query(`update public.profiles set role=$2::public.app_role, registration_status='active',age_band='adult' where id=$1`, [id, role]);
}
const subject = (await db.query('select id from public.subjects order by id limit 1')).rows[0].id;
await db.query('insert into public.teacher_subjects(teacher_id,subject_id) values ($1,$2)', [ids.teacher, subject]);
await db.query('insert into public.enrollments(student_id,subject_id) values ($1,$3),($2,$3) on conflict do nothing', [ids.student, ids.otherStudent, subject]);

async function authenticatedAs(id, query) {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec('set role authenticated');
  try { return await query(); } finally { await db.exec('reset role'); }
}
const visibleProfileIds = (id) => authenticatedAs(id, async () =>
  (await db.query('select id from public.profiles order by id')).rows.map((row) => row.id));

assert.deepEqual(await visibleProfileIds(ids.student), [ids.student]);
assert.deepEqual(await visibleProfileIds(ids.teacher), [ids.teacher]);
assert.deepEqual(await visibleProfileIds(ids.admin), [ids.admin]);

await db.exec('set role service_role');
try {
  assert.equal((await db.query('select count(*)::int as count from public.profiles')).rows[0].count, 4);
} finally {
  await db.exec('reset role');
}

await db.close();
console.log('POSTGRESQL_PROFILE_ACCESS_OK: aluno, professor e admin só leem o próprio perfil; service_role lê os quatro; sem PII.');
