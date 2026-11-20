// Aplica as migrations reais em PostgreSQL WASM, sem credenciais ou rede.
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
// O caminho depende deste arquivo, não do diretório de onde npm test foi chamado.
const directory = new URL('../../supabase/migrations/', import.meta.url);
for (const file of readdirSync(directory).filter(file => file.endsWith('.sql')).sort()) {
  const sql = readFileSync(new URL(file, directory), 'utf8')
    .replace('create extension if not exists pg_cron with schema pg_catalog;', '');
  await db.exec(sql);
}

const columns = (await db.query(`select column_name from information_schema.columns
  where table_schema='public' and table_name='email_deliveries'`)).rows.map((row) => row.column_name);
assert.ok(columns.includes('provider_accepted_at'));
const statusConstraint = (await db.query(`select pg_get_constraintdef(oid) definition
  from pg_constraint where conrelid='public.email_deliveries'::regclass
  and conname='email_deliveries_status_check'`)).rows[0].definition;
assert.match(statusConstraint, /provider_accepted/);
const finishFunction = (await db.query(`select pg_get_functiondef(
  'public.finish_email_delivery(uuid,uuid,text,boolean,text)'::regprocedure) definition`)).rows[0].definition;
assert.match(finishFunction, /provider_accepted/);
console.log('OK migrations SQL reais incluem status e horário de aceitação do Resend');

const teacher = 'f0000000-0000-0000-0000-000000000001';
const legal = (await db.query('select public.get_current_legal_document_versions() as documents')).rows[0].documents;
const policy = legal.privacy.version;
const metadata = {full_name:'Docente de teste', age_band:'adult', privacy_policy_accepted:true,
  privacy_policy_version:policy, terms_of_use_accepted:true, terms_of_use_version:'1.0'};
await db.query('insert into auth.users(id,email,raw_user_meta_data) values ($1,$2,$3::jsonb)',[teacher,'teacher@example.test',JSON.stringify(metadata)]);
await db.query("update public.profiles set role='teacher' where id=$1",[teacher]);
const subject = (await db.query('select id from public.subjects order by id limit 1')).rows[0].id;
await db.query('insert into public.teacher_subjects(teacher_id,subject_id) values ($1,$2)',[teacher,subject]);
const claim = async () => (await db.query("select * from public.claim_email_delivery($1,$2,'immediate',current_date,current_date+1)",[teacher,subject])).rows[0];
const delivery = await claim();
assert.equal(delivery.claimed,true);
assert.equal((await db.query('select public.begin_email_delivery($1,$2) as ok',[delivery.id,delivery.claim_token])).rows[0].ok,true);
assert.equal((await db.query("select public.finish_email_delivery($1,$2,'provider_accepted',false,null) as ok",[delivery.id,delivery.claim_token])).rows[0].ok,true);
const record = (await db.query('select status,provider_accepted_at,smtp_accepted_at,received_at from public.email_deliveries where id=$1',[delivery.id])).rows[0];
assert.equal(record.status,'provider_accepted');
assert.ok(record.provider_accepted_at);
assert.equal(record.smtp_accepted_at,null);
assert.equal(record.received_at,null);
assert.equal((await claim()).claimed,false);
assert.equal((await db.query("select public.finish_email_delivery($1,$2,'smtp_accepted',false,null) as ok",[delivery.id,delivery.claim_token])).rows[0].ok,false);
console.log('OK recibo HTTPS não inventa recebimento, não vira SMTP e não permite replay');
await db.query("update public.profiles set age_band='minor',admission_status='pending' where id=$1",[teacher]);
const nextClaim = async () => (await db.query("select * from public.claim_email_delivery($1,$2,'immediate',current_date+1,current_date+2)",[teacher,subject])).rows[0];
assert.equal(await nextClaim(),undefined);
await db.query("update public.profiles set age_band='adult' where id=$1",[teacher]);
const pending = await nextClaim();
assert.equal(pending.claimed,true);
await db.query("update auth.users set created_at=now()-interval '169 hours' where id=$1",[teacher]);
await db.query("update public.profiles set age_band='adult' where id=$1",[teacher]);
assert.equal((await db.query('select public.begin_email_delivery($1,$2) as ok',[pending.id,pending.claim_token])).rows[0].ok,false);
console.log('OK admissão pendente e expiração entre claim e envio não liberam e-mail');
await db.close();
