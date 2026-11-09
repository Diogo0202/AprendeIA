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
const signupBody = (await db.query(`select pg_get_functiondef('private.handle_new_user()'::regprocedure) as body`)).rows[0].body;
const policyVersion = signupBody.match(/policy_version_value (?:<>|=) '(\d+\.\d+)'/)[1];
const termsVersion = signupBody.match(/terms_version_value = '(\d+\.\d+)'/)[1];
await check('cadastro vigente exige política 1.7 e preserva os Termos de Uso 1.0', async () => {
  assert.equal(policyVersion, '1.7');
  assert.equal(termsVersion, '1.0');
});
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
async function resolve(admin, id, decision = 'complete', confirmation = '', hash = 'a'.repeat(64)) {
  return (await db.query('select public.resolve_privacy_request($1,$2,$3,$4,$5,$6) as result', [admin, id, decision, 'Resposta de teste', confirmation, hash])).rows[0].result;
}
const admin = 'a0000000-0000-0000-0000-000000000001';
const otherAdmin = 'a0000000-0000-0000-0000-000000000002';
const first = 'b0000000-0000-0000-0000-000000000001';
const second = 'b0000000-0000-0000-0000-000000000002';
const third = 'b0000000-0000-0000-0000-000000000003';
await user(admin, 'admin'); await user(otherAdmin, 'admin');
await user(first); await user(second); await user(third);

await check('todas as migrations foram aplicadas no PostgreSQL isolado', async () => {
  assert.equal((await db.query(`select count(*)::integer as n from public.subjects`)).rows[0].n, 3);
});
const access = await request(first, 'access');
await check('pedido pendente duplicado é recusado', () => assert.rejects(request(first, 'access'), (error) => error.code === '23505'));
await check('cancelamento não atravessa a conta', () => assert.rejects(db.query('select public.cancel_privacy_request($1,$2)', [second, access]), (error) => error.code === 'PT404'));
await check('aluno não pode revisar pedidos', () => assert.rejects(resolve(second, access), (error) => error.code === 'PT403'));
await check('acesso pode ser concluído por outro administrador', async () => assert.equal((await resolve(admin, access)).status, 'completed'));
await check('decisão concluída não pode ser repetida', () => assert.rejects(resolve(admin, access), (error) => error.code === 'PT409'));
const own = await request(admin, 'access');
await check('administrador não revisa pedido próprio', () => assert.rejects(resolve(admin, own), (error) => error.code === 'PT403'));
const adminDelete = await request(otherAdmin, 'deletion');
await check('contas administrativas não são apagadas pelo fluxo', () => assert.rejects(resolve(admin, adminDelete, 'complete', 'EXCLUIR'), (error) => error.code === 'PT403'));
const correction = await request(first, 'correction', { full_name: 'Nome corrigido', grade: '8º ano' });
await check('correção mantém perfil e metadados do Auth coerentes', async () => {
  await resolve(admin, correction);
  assert.equal((await db.query('select full_name from public.profiles where id=$1', [first])).rows[0].full_name, 'Nome corrigido');
  assert.equal((await db.query(`select raw_user_meta_data->>'full_name' as name from auth.users where id=$1`, [first])).rows[0].name, 'Nome corrigido');
});
const attack = await request(second, 'correction', { role: 'admin' });
await check('RPC também bloqueia alteração de cargo', () => assert.rejects(resolve(admin, attack), (error) => error.code === 'PT400'));
const cancellation = await request(third, 'access');
await check('titular pode cancelar pedido pendente', async () => assert.equal((await db.query('select public.cancel_privacy_request($1,$2) as result', [third, cancellation])).rows[0].result.status, 'cancelled'));

const question = (await db.query('select id from public.questions limit 1')).rows[0].id;
const lesson = (await db.query('select id from public.lessons limit 1')).rows[0].id;
await db.query('insert into public.question_attempts(student_id,question_id,selected_index,correct) values ($1,$3,0,true),($2,$3,1,false)', [first, second, question]);
await db.query('insert into public.lesson_progress(student_id,lesson_id,completed,time_seconds) values ($1,$2,true,120)', [second, lesson]);
const conversation = (await db.query(`insert into public.conversations(kind,thread_key,created_by) values ('direct','direct:test',$1) returning id`, [first])).rows[0].id;
await db.query('insert into public.conversation_members(conversation_id,user_id) values ($1,$2),($1,$3)', [conversation, first, second]);
await db.query(`insert into public.messages(conversation_id,sender_id,sender_kind,body) values ($1,$2,'user','mensagem pessoal')`, [conversation, first]);
const deletion = await request(first, 'deletion');
await check('confirmação incorreta preserva a conta', async () => {
  await assert.rejects(resolve(admin, deletion, 'complete', 'excluir'), (error) => error.code === 'PT400');
  assert.equal((await db.query('select count(*)::integer n from auth.users where id=$1', [first])).rows[0].n, 1);
});
await check('exclusão encerra Auth e sessões e preserva o histórico de outro estudante', async () => {
  const receipt = await resolve(admin, deletion, 'complete', 'EXCLUIR');
  assert.equal(receipt.status, 'completed'); assert.equal(receipt.user_id, null); assert.equal(receipt.details, '');
  for (const table of ['auth.users','public.profiles']) assert.equal((await db.query(`select count(*)::integer n from ${table} where id=$1`, [first])).rows[0].n, 0);
  assert.equal((await db.query('select count(*)::integer n from auth.sessions where user_id=$1', [first])).rows[0].n, 0);
  assert.equal((await db.query('select count(*)::integer n from public.question_attempts where student_id=$1', [second])).rows[0].n, 1);
  assert.equal((await db.query('select count(*)::integer n from public.conversations where id=$1', [conversation])).rows[0].n, 0);
});
const anonymization = await request(second, 'anonymization');
await check('anonimização preserva apenas somas globais e remove a identidade', async () => {
  await resolve(admin, anonymization, 'complete', 'ANONIMIZAR');
  const sums = (await db.query('select * from private.anonymous_learning_totals')).rows;
  assert.equal(sums.length, 1); assert.equal(sums[0].attempts, 1); assert.equal(sums[0].correct_answers, 0);
  assert.equal(sums[0].completed_lessons, 1); assert.equal(sums[0].study_seconds, 120);
  assert.equal(Object.keys(sums[0]).some((key) => /user|student|email|name|time|date/.test(key)), false);
  assert.equal((await db.query('select count(*)::integer n from auth.users where id=$1', [second])).rows[0].n, 0);
});
const storageRequest = await request(third, 'deletion');
await db.query('insert into storage.objects(owner_id) values ($1)', [third]);
await check('arquivos Storage bloqueiam a operação inteira sem apagar metadados', async () => {
  await assert.rejects(resolve(admin, storageRequest, 'complete', 'EXCLUIR'), (error) => error.code === 'PT412');
  assert.equal((await db.query('select status from public.privacy_requests where id=$1', [storageRequest])).rows[0].status, 'pending');
});
await check('chave authenticated não executa a RPC nem consulta pedidos', async () => {
  await db.exec('set role authenticated');
  try {
    await assert.rejects(db.query('select * from public.privacy_requests'), (error) => error.code === '42501');
    await assert.rejects(resolve(admin, storageRequest, 'reject'), (error) => error.code === '42501');
  } finally { await db.exec('reset role'); }
});
await db.query(`update public.privacy_requests set expires_at=now()-interval '1 hour' where id=$1`, [storageRequest]);
await check('pedido expirado não é executado', () => assert.rejects(resolve(admin, storageRequest, 'reject'), (error) => error.code === 'PT404'));
await check('limpeza remove os pedidos expirados', async () => {
  assert.ok((await db.query('select public.purge_expired_privacy_requests() as count')).rows[0].count >= 1);
});
await check('exclusão docente preserva turma, materiais e progresso dos alunos', async () => {
  const teacher = 'c0000000-0000-0000-0000-000000000001';
  await user(teacher, 'teacher');
  const subject = (await db.query('select subject_id from public.questions where id=$1', [question])).rows[0].subject_id;
  await db.query('insert into public.teacher_subjects(teacher_id,subject_id) values ($1,$2)', [teacher, subject]);
  const classroom = (await db.query(`insert into public.classes(teacher_id,subject_id,name,school_year) values ($1,$2,'Turma de teste','2026') returning id`, [teacher, subject])).rows[0].id;
  await db.query('insert into public.class_students(class_id,student_id) values ($1,$2)', [classroom, third]);
  await db.query('update public.questions set created_by=$1 where id=$2', [teacher, question]);
  await db.query('insert into public.lesson_progress(student_id,lesson_id,time_seconds) values ($1,$2,360)', [third, lesson]);
  const material = (await db.query(`insert into public.learning_contents(teacher_id,subject_id,title) values ($1,$2,'Material de teste') returning id`, [teacher, subject])).rows[0].id;
  const id = await request(teacher, 'deletion');
  await resolve(admin, id, 'complete', 'EXCLUIR');
  assert.equal((await db.query('select count(*)::integer n from public.classes where id=$1', [classroom])).rows[0].n, 1);
  assert.equal((await db.query('select teacher_id from public.classes where id=$1', [classroom])).rows[0].teacher_id, null);
  assert.equal((await db.query('select teacher_id from public.learning_contents where id=$1', [material])).rows[0].teacher_id, null);
  assert.equal((await db.query('select count(*)::integer n from public.class_students where class_id=$1 and student_id=$2', [classroom, third])).rows[0].n, 1);
  assert.equal((await db.query('select time_seconds from public.lesson_progress where student_id=$1 and lesson_id=$2', [third, lesson])).rows[0].time_seconds, 360);
  assert.equal((await db.query('select created_by from public.questions where id=$1', [question])).rows[0].created_by, null);
});
await check('política histórica 1.5 não cria conta nem libera novo aceite com termos atuais', async () => {
  const id = 'e0000000-0000-0000-0000-000000000004';
  await assert.rejects(db.query(`insert into auth.users(id,email,raw_user_meta_data) values ($1,$2,$3::jsonb)`,
    [id, `${id}@example.test`, JSON.stringify(consent({ privacy_policy_version: '1.5' }))]), /Política de Privacidade/);
  await assert.rejects(db.query('select public.record_privacy_policy_acceptance($1,$2,$3)',
    [admin, '1.5', termsVersion]), /Versão da política inválida/);
});
await check('cadastro sem aceite dos Termos de Uso é recusado', async () => {
  const id = 'e0000000-0000-0000-0000-000000000001';
  for (const extra of [{ terms_of_use_accepted: false }, { terms_of_use_version: '0.9' }, { terms_of_use_version: undefined }]) {
    await assert.rejects(db.query(`insert into auth.users(id,email,raw_user_meta_data) values ($1,$2,$3::jsonb)`, [id, `${id}@example.test`, JSON.stringify(consent(extra))]), /Termos de Uso/);
  }
  assert.equal((await db.query('select count(*)::integer n from public.profiles where id=$1', [id])).rows[0].n, 0);
});
await check('cadastro registra versão e horário dos termos no perfil, na evidência e na auditoria', async () => {
  const id = 'e0000000-0000-0000-0000-000000000002';
  await user(id);
  const profile = (await db.query('select privacy_policy_version policy, terms_of_use_version v, terms_of_use_accepted_at t from public.profiles where id=$1', [id])).rows[0];
  assert.equal(profile.policy, policyVersion);
  assert.equal(profile.v, termsVersion); assert.ok(profile.t);
  assert.equal((await db.query('select terms_version from public.privacy_policy_acceptances where user_id=$1', [id])).rows[0].terms_version, termsVersion);
  assert.equal((await db.query(`select metadata->>'terms_version' v from public.access_audit_logs where user_id=$1 and action='CREATE_USER'`, [id])).rows[0].v, termsVersion);
});
await check('conta que aceitou só a política registra os termos com a mesma versão da política', async () => {
  const id = 'e0000000-0000-0000-0000-000000000003';
  await user(id);
  // Simula uma conta anterior aos termos: mesma versão da política, sem os termos.
  await db.query('delete from public.privacy_policy_acceptances where user_id=$1', [id]);
  await db.query(`insert into public.privacy_policy_acceptances(user_id,policy_version) values ($1,$2)`, [id, policyVersion]);
  await db.query('update public.profiles set terms_of_use_version=null, terms_of_use_accepted_at=null where id=$1', [id]);
  const first = (await db.query('select public.record_privacy_policy_acceptance($1,$2,$3) t', [id, policyVersion, termsVersion])).rows[0].t;
  const again = (await db.query('select public.record_privacy_policy_acceptance($1,$2,$3) t', [id, policyVersion, termsVersion])).rows[0].t;
  assert.equal(String(first), String(again));
  assert.equal((await db.query('select terms_of_use_version v from public.profiles where id=$1', [id])).rows[0].v, termsVersion);
  assert.equal((await db.query('select count(*)::integer n from public.privacy_policy_acceptances where user_id=$1 and terms_version=$2', [id, termsVersion])).rows[0].n, 1);
});
await check('RPC de aceite recusa versão errada dos termos e não existe mais sem os termos', async () => {
  await assert.rejects(db.query('select public.record_privacy_policy_acceptance($1,$2,$3)', [second, policyVersion, '0.9']), /Termos de Uso/);
  await assert.rejects(db.query('select public.record_privacy_policy_acceptance($1,$2)', [second, policyVersion]), (error) => error.code === '42883');
  await db.exec('set role authenticated');
  try {
    await assert.rejects(db.query('select public.record_privacy_policy_acceptance($1,$2,$3)', [second, policyVersion, termsVersion]), (error) => error.code === '42501');
    await assert.rejects(db.query(`update public.profiles set terms_of_use_version='1.0'`), (error) => error.code === '42501');
  } finally { await db.exec('reset role'); }
});
await check('limpeza remove o horário detalhado do aceite dos termos', async () => {
  const id = 'e0000000-0000-0000-0000-000000000002';
  await db.query(`update public.profiles set terms_of_use_accepted_at=now()-interval '7 days' where id=$1`, [id]);
  await db.query('select public.purge_expired_access_audit_logs()');
  const row = (await db.query('select terms_of_use_version v, terms_of_use_accepted_at t from public.profiles where id=$1', [id])).rows[0];
  assert.equal(row.t, null); assert.equal(row.v, termsVersion);
});
await check('expirar evidência detalhada não revoga ciência ainda vigente no perfil', async () => {
  const id = 'e0000000-0000-0000-0000-000000000004';
  await user(id);
  await db.query('update public.profiles set privacy_policy_accepted_at=null, terms_of_use_accepted_at=null where id=$1', [id]);
  assert.equal((await db.query('select private.gamification_visible($1) visible', [id])).rows[0].visible, true);
  await db.query('update public.profiles set privacy_policy_version=null where id=$1', [id]);
  assert.equal((await db.query('select private.gamification_visible($1) visible', [id])).rows[0].visible, false);
});
await check('exclusão da conta não deixa dados identificáveis do responsável órfãos', async () => {
  const id = 'e0000000-0000-0000-0000-000000000005';
  await user(id);
  await db.query(`insert into public.account_admissions(user_id,responsible_name,responsible_contact,institutional_reference,version) values($1,'Responsável de teste','responsavel@example.test','protocolo-teste','1')`, [id]);
  await db.query('delete from auth.users where id=$1', [id]);
  assert.equal((await db.query("select count(*)::integer n from public.account_admissions where institutional_reference='protocolo-teste'")).rows[0].n, 0);
});
await db.close();
console.log(`POSTGRESQL_RF08_OK: ${passed} cenários; Auth, Storage e Cron simulados, SQL da aplicação real.`);
