// PostgreSQL WASM isolado: exclusão pela administração e chat administração <-> professor.
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
  const sql = readFileSync(new URL(file, directory), 'utf8').replace('create extension if not exists pg_cron with schema pg_catalog;', '');
  try { await db.exec(sql); } catch (error) { throw new Error(`Migration ${file}: ${error.message}`); }
}

let passed = 0;
async function check(name, operation) {
  await operation();
  passed++;
  console.log(`OK ${name}`);
}
async function user(id, role = 'student') {
  await db.query(`insert into auth.users(id,email,raw_app_meta_data) values ($1,$2,'{"account_origin":"admin_provisioned"}')`, [id, `${id}@example.test`]);
  await db.query(`update public.profiles set role=$2::public.app_role, registration_status='active' where id=$1`, [id, role]);
}
const hash = 'c'.repeat(64);
const remove = (actor, target, confirmation = 'EXCLUIR', reason = 'Encerramento de teste') =>
  db.query('select public.admin_delete_account($1,$2,$3,$4,$5) as result', [actor, target, confirmation, reason, hash]);
const chat = (actor, recipient) => db.query('select public.get_or_create_direct_conversation($1,$2) as id', [actor, recipient]);

const admin = 'a1000000-0000-0000-0000-000000000001';
const otherAdmin = 'a1000000-0000-0000-0000-000000000002';
const teacher = 'c1000000-0000-0000-0000-000000000001';
const teacher2 = 'c1000000-0000-0000-0000-000000000002';
const student = 'd1000000-0000-0000-0000-000000000001';
const student2 = 'd1000000-0000-0000-0000-000000000002';
await user(admin, 'admin'); await user(otherAdmin, 'admin');
await user(teacher, 'teacher'); await user(teacher2, 'teacher');
await user(student); await user(student2);
const subject = (await db.query('select id from public.subjects order by id limit 1')).rows[0].id;
await db.query('insert into public.teacher_subjects(teacher_id,subject_id) values ($1,$2)', [teacher, subject]);
await db.query('insert into public.enrollments(student_id,subject_id) values ($1,$3),($2,$3) on conflict do nothing', [student, student2, subject]);
const klass = (await db.query(`insert into public.classes(teacher_id,subject_id,name,school_year) values ($1,$2,'8A','8º ano') returning id`, [teacher, subject])).rows[0].id;
await db.query('insert into public.class_students(class_id,student_id) values ($1,$2),($1,$3)', [klass, student, student2]);
const question = (await db.query('select id from public.questions where subject_id=$1 limit 1', [subject])).rows[0]?.id
  ?? (await db.query('select id from public.questions limit 1')).rows[0].id;
await db.query('insert into public.question_attempts(student_id,question_id,selected_index,correct) values ($1,$2,0,true)', [student, question]);

await check('administração conversa com professor nos dois sentidos', async () => {
  const first = (await chat(admin, teacher)).rows[0].id;
  const back = (await chat(teacher, admin)).rows[0].id;
  assert.equal(first, back);
});
await check('administração e aluno continuam sem conversa direta', async () => {
  await assert.rejects(chat(admin, student), (e) => e.code === '42501');
  await assert.rejects(chat(student, admin), (e) => e.code === '42501');
  await assert.rejects(chat(admin, otherAdmin), (e) => e.code === '42501');
});
await check('vínculo pedagógico ainda é exigido entre professor e aluno', async () => {
  await assert.rejects(chat(teacher2, student), (e) => e.code === '42501');
  assert.ok((await chat(teacher, student)).rows[0].id);
});
await check('quem não é administração não exclui contas', () =>
  assert.rejects(remove(teacher, student), (e) => e.code === 'PT403'));
await check('administração não exclui a si mesma nem outra administração', async () => {
  await assert.rejects(remove(admin, admin), (e) => e.code === 'PT403');
  await assert.rejects(remove(admin, otherAdmin), (e) => e.code === 'PT403');
  assert.equal((await db.query('select count(*)::int n from auth.users where id=$1', [otherAdmin])).rows[0].n, 1);
});
await check('confirmação e motivo são obrigatórios', async () => {
  await assert.rejects(remove(admin, student, 'excluir'), (e) => e.code === 'PT400');
  await assert.rejects(remove(admin, student, 'EXCLUIR', 'curto'.slice(0, 3)), (e) => e.code === 'PT400');
  assert.equal((await db.query('select count(*)::int n from auth.users where id=$1', [student])).rows[0].n, 1);
});
await check('arquivos no Storage bloqueiam a exclusão sem alterar dados', async () => {
  await db.query('insert into storage.objects(owner_id) values ($1)', [student2]);
  await assert.rejects(remove(admin, student2), (e) => e.code === 'PT412');
  assert.equal((await db.query('select count(*)::int n from public.class_students where student_id=$1', [student2])).rows[0].n, 1);
});
await check('excluir professor apaga conversas, deixa a turma sem professor e preserva o progresso', async () => {
  const result = (await remove(admin, teacher)).rows[0].result;
  assert.equal(result.deleted_role, 'teacher');
  assert.equal((await db.query('select count(*)::int n from public.profiles where id=$1', [teacher])).rows[0].n, 0);
  assert.equal((await db.query('select teacher_id from public.classes where id=$1', [klass])).rows[0].teacher_id, null);
  assert.equal((await db.query('select count(*)::int n from public.conversation_members where user_id=$1', [admin])).rows[0].n, 0);
  assert.equal((await db.query('select count(*)::int n from public.question_attempts where student_id=$1', [student])).rows[0].n, 1);
});
await check('excluir aluno encerra Auth, perfil e histórico', async () => {
  await remove(admin, student);
  for (const table of ['auth.users', 'public.profiles']) {
    assert.equal((await db.query(`select count(*)::int n from ${table} where id=$1`, [student])).rows[0].n, 0);
  }
  assert.equal((await db.query('select count(*)::int n from public.question_attempts where student_id=$1', [student])).rows[0].n, 0);
});
await check('conta inexistente é 404', () => assert.rejects(remove(admin, student), (e) => e.code === 'PT404'));
await check('chaves do navegador não executam a exclusão', async () => {
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    try {
      await assert.rejects(remove(admin, teacher2), (e) => e.code === '42501');
    } finally { await db.exec('reset role'); }
  }
});
await db.close();
console.log(`POSTGRESQL_ADMIN_OK: ${passed} cenários; Auth e Storage simulados, SQL da aplicação real.`);
