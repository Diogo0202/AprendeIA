// SQL real em memória: prova rollback do par, ordem e isolamento, sem OpenAI.
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';

const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth;
  create table auth.users(id uuid primary key,email text,created_at timestamptz not null default now(),raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');
  create table auth.sessions(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id) on delete cascade);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  create function public.rls_auto_enable() returns event_trigger language plpgsql as $$ begin return; end $$;
  create schema storage; create table storage.objects(id uuid primary key default gen_random_uuid(),owner_id text);
  create schema cron; create function cron.schedule(text,text,text) returns integer language sql as $$ select 1 $$;
`);
const directory=new URL('../../supabase/migrations/',import.meta.url);
for(const name of readdirSync(directory).filter(name=>name.endsWith('.sql')).sort()) {
  await db.exec(readFileSync(new URL(name,directory),'utf8').replace('create extension if not exists pg_cron with schema pg_catalog;',''));
}
const docs=(await db.query('select public.get_current_legal_document_versions() as documents')).rows[0].documents;
const actors=['a3000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000002'];
for(const id of actors) await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3::jsonb)',[id,'test@example.test',JSON.stringify({full_name:'Teste',age_band:'adult',privacy_policy_accepted:true,privacy_policy_version:docs.privacy.version,terms_of_use_accepted:true,terms_of_use_version:docs.terms.version})]);
const conversation=(await db.query('select public.get_or_create_ai_conversation($1) as id',[actors[0]])).rows[0].id;
const send=async(actor,answer='Resposta')=>(await db.query('select public.append_ai_exchange($1,$2,$3,$4) as exchange',[actor,conversation,'Pergunta',answer])).rows[0].exchange;
const exchange=await send(actors[0]);
assert.equal(exchange.user_message.sender_id,actors[0]);
assert.equal(exchange.assistant_message.sender_kind,'assistant');
const rows=(await db.query('select sender_kind from public.messages where conversation_id=$1 order by created_at',[conversation])).rows;
assert.deepEqual(rows.map(row=>row.sender_kind),['user','assistant']);
await assert.rejects(send(actors[1]),error=>error.code==='PT403');
const before=(await db.query('select last_message_at from public.conversations where id=$1',[conversation])).rows[0];
await db.exec("alter table public.messages add constraint test_reject_answer check(body<>'bloquear resposta')");
await assert.rejects(send(actors[0],'bloquear resposta'));
assert.equal((await db.query('select count(*)::int as count from public.messages where conversation_id=$1',[conversation])).rows[0].count,2);
assert.deepEqual((await db.query('select last_message_at from public.conversations where id=$1',[conversation])).rows[0],before);
for(const role of ['anon','authenticated']) {
  await db.exec(`set role ${role}`);
  await assert.rejects(send(actors[0]));
  await db.exec('reset role');
}
await db.close();
console.log('ATOMIC_AI_SQL_OK: par ordenado, rollback sem pergunta órfã, isolamento e grants; sem concorrência entre conexões.');
