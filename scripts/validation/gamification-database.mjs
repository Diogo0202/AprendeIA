// PostgreSQL WASM isolado, sem conexão remota. Executar: node gamification-database.mjs
// --preview emite um script SQL independente, só leitura, executável ANTES da migration.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const preview = `-- PREVIEW da gamificação. Revisar antes de aplicar 20261106120000.
-- Esta consulta não grava dados nem chama funções da nova migration.
BEGIN TRANSACTION READ ONLY;
SELECT
  (SELECT count(*) FROM public.profiles WHERE role='student') AS students,
  (SELECT count(*) FROM public.lesson_progress p JOIN public.profiles u ON u.id=p.student_id
    WHERE p.completed AND u.role='student') AS lessons_without_proven_completion_timestamp,
  (SELECT count(*) FROM (SELECT DISTINCT a.student_id,a.question_id FROM public.question_attempts a
    JOIN public.profiles u ON u.id=a.student_id WHERE a.correct AND u.role='student') s) AS first_correct_events,
  (SELECT count(*) FROM public.student_activity_days d JOIN public.profiles u ON u.id=d.student_id
    WHERE u.role='student') AS day_events,
  (SELECT count(*) FROM public.question_attempts WHERE answered_at>now()) AS future_attempt_timestamps,
  (SELECT count(*) FROM public.diagnostic_sessions WHERE status='completed' AND completed_at IS NULL)
    AS diagnostics_without_completion_timestamp;
-- Potenciais bônus vitalícios. Datas sem prova ficam NULL no ledger, fora das semanas.
WITH lesson_totals AS (
  SELECT p.student_id,count(*) n,count(DISTINCT m.subject_id) subjects
  FROM public.lesson_progress p JOIN public.lessons l ON l.id=p.lesson_id
  JOIN public.modules m ON m.id=l.module_id WHERE p.completed GROUP BY p.student_id
), correct_totals AS (
  SELECT student_id,count(DISTINCT question_id) n FROM public.question_attempts WHERE correct GROUP BY student_id
), day_totals AS (SELECT student_id,count(*) n FROM public.student_activity_days GROUP BY student_id)
SELECT count(*) AS students,
  count(*) FILTER(WHERE l.n>=5) AS five_lessons,
  count(*) FILTER(WHERE l.n>=10) AS ten_lessons,
  count(*) FILTER(WHERE l.subjects>=2) AS subject_explorer,
  count(*) FILTER(WHERE c.n>=25) AS twenty_five_correct,
  count(*) FILTER(WHERE c.n>=50) AS fifty_correct,
  count(*) FILTER(WHERE d.n>=5) AS five_active_days,
  count(*) FILTER(WHERE EXISTS(SELECT 1 FROM public.diagnostic_sessions s WHERE s.student_id=p.id AND s.status='completed')) AS diagnostic_completed
FROM public.profiles p LEFT JOIN lesson_totals l ON l.student_id=p.id
LEFT JOIN correct_totals c ON c.student_id=p.id LEFT JOIN day_totals d ON d.student_id=p.id
WHERE p.role='student';
-- Comparação por conta, somente para revisão administrativa. Não publicar a saída.
WITH l AS (
  SELECT p.student_id,count(*) n,count(DISTINCT m.subject_id) subjects
  FROM public.lesson_progress p JOIN public.lessons a ON a.id=p.lesson_id
  JOIN public.modules m ON m.id=a.module_id WHERE p.completed GROUP BY p.student_id
), q AS (
  SELECT student_id,count(*) FILTER(WHERE correct) old_correct,
    count(DISTINCT question_id) FILTER(WHERE correct) distinct_correct
  FROM public.question_attempts GROUP BY student_id
), d AS (SELECT student_id,count(*) n FROM public.student_activity_days GROUP BY student_id),
first_attempts AS (
  SELECT DISTINCT ON(a.student_id,a.question_id) a.student_id,q.subject_id,q.topic,a.correct,a.answered_at,a.id
  FROM public.question_attempts a JOIN public.questions q ON q.id=a.question_id
  ORDER BY a.student_id,a.question_id,a.answered_at,a.id
), ordered AS (
  SELECT *,row_number() OVER(PARTITION BY student_id,subject_id,topic ORDER BY answered_at,id) n FROM first_attempts
), recovered AS (
  SELECT DISTINCT student_id FROM ordered WHERE n<=10 GROUP BY student_id,subject_id,topic
  HAVING count(*)=10 AND sum(correct::int) FILTER(WHERE n<=5)<3 AND sum(correct::int) FILTER(WHERE n>5)>=4
), points AS (
  SELECT p.id AS student_id,
    coalesce(l.n,0)*100+coalesce(q.old_correct,0)*10+coalesce(d.n,0)*20 AS old_base_xp,
    coalesce(l.n,0)*100+coalesce(q.distinct_correct,0)*10+coalesce(d.n,0)*20 AS deduplicated_base_xp,
    (CASE WHEN EXISTS(SELECT 1 FROM public.diagnostic_sessions s WHERE s.student_id=p.id AND s.status='completed') THEN 30 ELSE 0 END
    +CASE WHEN l.subjects>=2 THEN 40 ELSE 0 END+CASE WHEN l.n>=5 THEN 50 ELSE 0 END
    +CASE WHEN l.n>=10 THEN 100 ELSE 0 END+CASE WHEN q.distinct_correct>=25 THEN 50 ELSE 0 END
    +CASE WHEN q.distinct_correct>=50 THEN 100 ELSE 0 END+CASE WHEN d.n>=5 THEN 75 ELSE 0 END
    +CASE WHEN EXISTS(SELECT 1 FROM recovered r WHERE r.student_id=p.id) THEN 100 ELSE 0 END) AS bonus_xp
  FROM public.profiles p LEFT JOIN l ON l.student_id=p.id LEFT JOIN q ON q.student_id=p.id
  LEFT JOIN d ON d.student_id=p.id WHERE p.role='student'
)
SELECT *,deduplicated_base_xp+bonus_xp AS projected_total_xp,
  deduplicated_base_xp+bonus_xp-old_base_xp AS projected_delta FROM points ORDER BY student_id;
ROLLBACK;
`;
if (process.argv.includes('--preview')) {
  process.stdout.write(preview);
  process.exit(0);
}

const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth;
  create table auth.users(id uuid primary key,email text,created_at timestamptz not null default now(),
    raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');
  create table auth.sessions(id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id) on delete cascade);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  create function public.rls_auto_enable() returns event_trigger language plpgsql as $$ begin return; end $$;
  create schema storage; create table storage.objects(id uuid primary key default gen_random_uuid(),owner_id text);
  create schema cron; create function cron.schedule(text,text,text) returns integer language sql as $$ select 1 $$;
`);
const directory = new URL('../../supabase/migrations/', import.meta.url);
const migration = '20261106120000_weekly_gamification.sql';
const migrations = readdirSync(directory).filter(f => f.endsWith('.sql')).sort();
const uid = n => `e6000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const legacy = uid(1), student = uid(2), peer = uid(3), outsider = uid(4), teacher = uid(5), teacher2 = uid(6);
const subject = '10000000-0000-0000-0000-000000000001';
const subject2 = '10000000-0000-0000-0000-000000000002';
let policy;
let terms;
async function currentPolicy() {
  const registered = (await db.query("select to_regclass('public.legal_document_versions') as table_name")).rows[0].table_name;
  if (registered) return (await db.query('select public.get_current_legal_document_versions() as documents')).rows[0].documents.privacy.version;
  const { body } = (await db.query(`select pg_get_functiondef('private.handle_new_user()'::regprocedure) body`)).rows[0];
  return body.match(/policy_version_value (?:<>|=) '(\d+\.\d+)'/)[1];
}
async function user(id,role='student') {
  await db.query(`insert into auth.users(id,email,raw_app_meta_data) values($1,$2,'{"account_origin":"admin_provisioned"}')`,[id,id+'@example.test']);
  await db.query(`update public.profiles set role=$2::public.app_role,registration_status='active',age_band='adult',
    privacy_policy_version=$3,privacy_policy_accepted_at=now() where id=$1`,[id,role,policy]);
  if (terms) await db.query(`update public.profiles set terms_of_use_version=$2,terms_of_use_accepted_at=now() where id=$1`,[id,terms]);
}
async function question(topic='fractions', sid=subject) {
  return (await db.query(`insert into public.questions(subject_id,topic,question,options,correct_index,explanation,source)
    values($1,$2,'Questão isolada','["a","b","c","d"]',0,'Explicação','seed') returning id`,[sid,topic])).rows[0].id;
}
async function attempt(id,q,correct=true,at=null) {
  await db.query(`insert into public.question_attempts(student_id,question_id,selected_index,correct,answered_at)
    values($1,$2,$3,$4,coalesce($5::timestamptz,now()))`,[id,q,correct?0:1,correct,at]);
}
async function asRole(role,op) {
  await db.exec(`set role ${role}`);
  try { return await op(); } finally { await db.exec('reset role'); }
}
const rpc = (sql,args) => asRole('service_role',async () => (await db.query(sql,args)).rows[0].result);
const summary = id => rpc('select public.gamification_summary($1) result',[id]);
const ranking = (id,scope='school',klass=null,page=1,size=20) =>
  rpc('select public.weekly_leaderboard($1,$2,$3,$4,$5) result',[id,scope,klass,page,size]);
const prefs = (id,alias,opt=true) => rpc('select public.update_leaderboard_preferences($1,$2,$3) result',[id,alias,opt]);
const count = async (sql,args=[]) => Number((await db.query(sql,args)).rows[0].n);
let passed=0;
async function check(name,op) { await op(); console.log(`OK ${++passed}: ${name}`); }
const denies = op => assert.rejects(op,e => ['PT403','42501'].includes(e.code));
let legacyLessons=[];
const historical = '2025-01-01T12:00:00Z';
for (const file of migrations) {
  if (file===migration) {
    policy=await currentPolicy();
    await user(legacy);
    // Dados legados são semeados antes da migration. O trigger legado usa now():
    // suspendê-lo na fixture evita fabricar um dia atual para respostas de 2025.
    await db.exec('alter table public.question_attempts disable trigger user; alter table public.lesson_progress disable trigger user;');
    for(let i=0;i<50;i++) {
      const q=await question('historical',i<25?subject:subject2);
      if(i===0) await attempt(legacy,q,false,'2025-01-01T11:59:00Z');
      await attempt(legacy,q,true,new Date(Date.parse(historical)+i*60000).toISOString());
      await attempt(legacy,q,true,new Date(Date.parse(historical)+i*60000+1000).toISOString());
    }
    for(let i=0;i<10;i++) {
      const module=i<5?'20000000-0000-0000-0000-000000000001':'20000000-0000-0000-0000-000000000002';
      const l=(await db.query(`insert into public.lessons(module_id,title,position) values($1,'Aula isolada',$2) returning id`,[module,100+i])).rows[0].id;
      legacyLessons.push(l);
      await db.query(`insert into public.lesson_progress(student_id,lesson_id,completed,last_accessed_at) values($1,$2,true,now())`,[legacy,l]);
    }
    for(let i=0;i<5;i++) await db.query(`insert into public.student_activity_days values($1,date '2025-01-01'+$2::int,'2025-01-05T23:00:00Z')`,[legacy,i]);
    await db.query(`insert into public.diagnostic_sessions(student_id,status,completed_at) values($1,'completed','2025-01-02T12:00:00Z')`,[legacy]);
    await db.exec('alter table public.question_attempts enable trigger user; alter table public.lesson_progress enable trigger user;');
    // Leitura real do preview, antes das tabelas novas existirem.
    await db.exec(preview);
  }
  const sql=readFileSync(new URL(file,directory),'utf8').replace('create extension if not exists pg_cron with schema pg_catalog;','');
  try { await db.exec(sql); } catch(e) { throw new Error(`Migration ${file}: ${e.message} (${e.position})`,{cause:e}); }
}
policy=await currentPolicy();
terms=(await db.query('select public.get_current_legal_document_versions() as documents')).rows[0].documents.terms.version;
await db.query(`update public.profiles set privacy_policy_version=$1,terms_of_use_version=$3,terms_of_use_accepted_at=now() where id=$2`,[policy,legacy,terms]);
for(const [id,role] of [[student,'student'],[peer,'student'],[outsider,'student'],[teacher,'teacher'],[teacher2,'teacher']]) await user(id,role);

await check('backfill deduplica primeiro acerto e não inventa datas de aulas/bônus',async()=>{
  const s=await summary(legacy);
  assert.equal(s.points,2045); // 1000 aulas + 500 acertos + 100 dias + 445 bônus.
  assert.equal(s.weekly_xp,0);
  assert.equal(s.bonus_xp,445);
  assert.equal(s.achievements.length,11); // Oito bônus menos turnaround, quatro legados.
  assert.equal(s.achievements.find(a=>a.id==='five_lessons').earned_at,null);
  assert.equal(s.achievements.find(a=>a.id==='subject_explorer').earned_at,null);
  assert.equal(s.achievements.find(a=>a.id==='twenty_five_correct').earned_at,'2025-01-01T12:24:00+00:00');
  assert.equal(s.achievements.find(a=>a.id==='five_active_days').earned_at,'2025-01-05T03:00:00+00:00');
  assert.equal(await count(`select count(*) n from public.gamification_events where student_id=$1 and occurred_at>=current_date`,[legacy]),0);
});
await check('recalcular não repete bônus e conquistas sobrevivem à remoção das fontes',async()=>{
  const before=(await summary(legacy)).points;
  await db.query('select private.refresh_gamification($1)',[legacy]);
  await db.query('select private.refresh_gamification($1)',[legacy]);
  await db.query('delete from public.question_attempts where student_id=$1',[legacy]);
  await db.query('delete from public.student_activity_days where student_id=$1',[legacy]);
  const s=await summary(legacy);
  assert.equal(s.points,before); assert.equal(s.achievements.length,11);
  assert.equal(s.catalog.find(c=>c.id==='five_active_days').progress,5);
});
await check('apelido inicial aleatório sem email/nome/id e opt-in falso',async()=>{
  const s=await summary(student),p=await summary(peer);
  assert.match(s.alias,/^Aluno-[0-9a-f]{8}$/); assert.notEqual(s.alias,p.alias);
  assert.equal(s.school_opt_in,false); assert.equal(s.catalog.length,13);
  assert.equal(s.catalog.filter(c=>c.unlocked).length,0);
  assert.equal((await ranking(student)).total,0);
});
await check('primeiro acerto por questão, dia único, repetição e primeira conclusão',async()=>{
  const q=await question();
  await attempt(student,q,true);
  // PGlite serializa chamadas na mesma conexão, não simula múltiplas sessões.
  await Promise.all(Array.from({length:12},()=>attempt(student,q,true)));
  assert.equal((await summary(student)).points,30);
  await db.query(`insert into public.lesson_progress(student_id,lesson_id,completed) values($1,$2,true)`,[student,legacyLessons[0]]);
  await db.query(`update public.lesson_progress set completed=false where student_id=$1`,[student]);
  await db.query(`update public.lesson_progress set completed=true,last_accessed_at=now() where student_id=$1`,[student]);
  const s=await summary(student);
  assert.equal(s.points,130); assert.equal(s.weekly_xp,130);
  assert.equal(s.catalog.find(c=>c.id==='ten_correct_answers').progress,1);
  assert.equal(s.catalog.find(c=>c.id==='first_lesson').unlocked,true);
});
await check('gabarito revelado no erro impede XP no acerto posterior',async()=>{
  const id=uid(21); await user(id);
  const q=await question('revealed-answer');
  await attempt(id,q,false);
  await attempt(id,q,true);
  await Promise.all(Array.from({length:12},()=>attempt(id,q,true)));
  assert.equal((await summary(id)).points,20); // Só a atividade do dia concede XP.
  assert.equal(await count(`select count(*) n from public.gamification_events where student_id=$1 and event_kind='correct'`,[id]),0);
});
await check('explorador exige aulas em duas disciplinas, questões não bastam',async()=>{
  await attempt(student,await question('language',subject2),true);
  assert.equal((await summary(student)).catalog.find(c=>c.id==='subject_explorer').unlocked,false);
  await db.query(`insert into public.lesson_progress(student_id,lesson_id,completed) values($1,$2,true)`,[student,legacyLessons[5]]);
  const a=(await summary(student)).catalog.find(c=>c.id==='subject_explorer');
  assert.equal(a.unlocked,true); assert.equal(a.bonus_xp,40); assert.ok(a.earned_at);
});
await check('diagnóstico, limiares das aulas e dias pagam uma única vez',async()=>{
  await db.query(`insert into public.diagnostic_sessions(student_id,status,completed_at) values($1,'completed',now())`,[student]);
  await db.query(`update public.diagnostic_sessions set status='completed' where student_id=$1`,[student]);
  for(const l of legacyLessons) await db.query(`insert into public.lesson_progress(student_id,lesson_id,completed) values($1,$2,true) on conflict do nothing`,[student,l]);
  for(let i=1;i<=4;i++) await db.query(`insert into public.student_activity_days(student_id,activity_date) values($1,(now() at time zone 'America/Sao_Paulo')::date-$2::int) on conflict do nothing`,[student,i]);
  const s=await summary(student);
  for(const id of ['five_lessons','ten_lessons','five_active_days','study_streak','diagnostic_completed']) assert.equal(s.catalog.find(c=>c.id===id).unlocked,true);
  assert.equal(s.bonus_xp,295); // 30 diagnóstico + 40 explorador + 50/100 aulas + 75 dias.
  await db.query('select private.refresh_gamification($1)',[student]);
  assert.equal((await summary(student)).bonus_xp,s.bonus_xp);
});
await check('25 e 50 acertos contam questões distintas, com data do limiar',async()=>{
  for(let i=0;i<48;i++) await attempt(student,await question('thresholds'),true);
  const s=await summary(student);
  assert.equal(s.bonus_xp,445);
  assert.equal(s.catalog.find(c=>c.id==='fifty_correct').progress,50);
  assert.equal(s.catalog.find(c=>c.id==='fifty_correct').unlocked,true);
  assert.ok(s.catalog.find(c=>c.id==='twenty_five_correct').earned_at);
});
await check('virada: primeiras dez questões distintas, mesmo tópico e disciplina',async()=>{
  const id=uid(10); await user(id);
  const qs=[];
  for(let i=0;i<10;i++) qs.push(await question('recovery'));
  const base=Date.now()-60_000;
  // Horários distintos tornam verificável qual resposta veio primeiro.
  for(let i=0;i<5;i++) { await attempt(id,qs[i],i<2,new Date(base+i*1000).toISOString()); await attempt(id,qs[i],true,new Date(base+i*1000+1).toISOString()); }
  assert.equal((await summary(id)).catalog.find(c=>c.id==='turnaround').unlocked,false);
  for(let i=5;i<10;i++) await attempt(id,qs[i],i<9,new Date(base+i*1000).toISOString());
  const s=await summary(id);
  assert.equal(s.catalog.find(c=>c.id==='turnaround').unlocked,true);
  assert.equal(s.bonus_xp,100);
  assert.ok(s.catalog.find(c=>c.id==='turnaround').earned_at);
  await attempt(id,qs[9],true);
  assert.equal((await summary(id)).bonus_xp,100);
});
await check('virada rejeita 60% na primeira janela e 60% na segunda',async()=>{
  for(const [id,first,next] of [[uid(11),3,4],[uid(12),2,3]]) {
    await user(id);
    for(let i=0;i<10;i++) await attempt(id,await question('bad-recovery'),i<5?i<first:i-5<next);
    assert.equal((await summary(id)).catalog.find(c=>c.id==='turnaround').unlocked,false);
  }
  const id=uid(13); await user(id);
  for(let i=0;i<10;i++) await attempt(id,await question(i<5?'topic-a':'topic-b',i<5?subject:subject2),i>=5);
  assert.equal((await summary(id)).catalog.find(c=>c.id==='turnaround').unlocked,false);
});
await check('semana São Paulo: segunda 00h, fim exclusivo e independente do timezone da sessão',async()=>{
  await db.exec(`set timezone='Pacific/Auckland'`);
  const dates=[['2026-11-09T02:59:59Z','2026-11-02T03:00:00Z'],['2026-11-09T03:00:00Z','2026-11-09T03:00:00Z'],
    ['2026-11-16T02:59:59Z','2026-11-09T03:00:00Z'],['2018-11-05T02:00:00Z','2018-11-05T02:00:00Z']];
  for(const [at,expected] of dates) {
    const actual=(await db.query('select private.gamification_week($1) at',[at])).rows[0].at;
    assert.equal(new Date(actual).toISOString(),new Date(expected).toISOString());
  }
  await db.exec(`set timezone='UTC'`);
  const r=await ranking(student),w=r.week_start,end=r.week_end;
  await prefs(peer,'Mesmo'); await prefs(outsider,'Mesmo');
  for(const id of [peer,outsider]) {
    await db.query(`insert into public.gamification_events values($1,'correct','boundary-start',10,$2,$3),
      ($1,'correct','boundary-before',90,$2::timestamptz-interval '1 microsecond',$3),
      ($1,'correct','boundary-end',80,$4,$3),($1,'correct','boundary-inside',20,$4::timestamptz-interval '1 microsecond',$3)`,[id,w,subject,end]);
  }
  const result=await ranking(peer);
  assert.equal(result.entries[0].weekly_xp,30);
});
await check('empate compartilha rank, paginação estável, posição própria fora da página',async()=>{
  const first=await ranking(outsider,'school',null,1,1),second=await ranking(outsider,'school',null,2,1);
  assert.equal(first.total,2); assert.equal(first.entries[0].rank,1); assert.equal(second.entries[0].rank,1);
  assert.equal(first.entries[0].is_me,false); assert.equal(second.entries[0].is_me,true);
  assert.deepEqual(first.my_position,second.entries[0]);
  assert.deepEqual(await ranking(outsider,'school',null,1,1),first);
  const empty=await ranking(outsider,'school',null,3,1); assert.deepEqual(empty.entries,[]); assert.equal(empty.my_position.rank,1);
  const serialized=JSON.stringify(first);
  for(const id of [peer,outsider]) assert.equal(serialized.includes(id),false);
  assert.deepEqual(Object.keys(first.entries[0]).sort(),['alias','avatar_key','is_me','level','rank','weekly_xp'].sort());
  assert.equal(/email|full_name|difficulty|total_xp|student_id/.test(serialized),false);
});
let klass,otherClass;
await check('turma exige vínculo, matrícula, propriedade docente e disciplina atribuída',async()=>{
  await db.query(`insert into public.teacher_subjects(teacher_id,subject_id) values($1,$2)`,[teacher,subject]);
  await db.query(`insert into public.enrollments(student_id,subject_id) values($1,$3),($2,$3) on conflict do nothing`,[student,peer,subject]);
  klass=(await db.query(`insert into public.classes(teacher_id,subject_id,name,school_year) values($1,$2,'Turma A','8º') returning id`,[teacher,subject])).rows[0].id;
  otherClass=(await db.query(`insert into public.classes(teacher_id,subject_id,name,school_year) values($1,$2,'Turma B','8º') returning id`,[teacher2,subject])).rows[0].id;
  await db.query('insert into public.class_students values($1,$2,now()),($1,$3,now()),($1,$4,now())',[klass,student,peer,outsider]);
  // O cadastro matricula em todas as disciplinas; removemos uma para este caso negativo.
  await db.query('delete from public.enrollments where student_id=$1 and subject_id=$2',[outsider,subject]);
  const result=await ranking(student,'class',klass);
  assert.equal(result.total,2); assert.deepEqual(result.classes,[{id:klass,name:'Turma A'}]);
  assert.equal((await ranking(teacher,'class',klass)).total,2);
  await denies(()=>ranking(outsider,'class',klass)); // Vínculo sem matrícula.
  await denies(()=>ranking(teacher2,'class',klass));
  await denies(()=>ranking(student,'class',otherClass));
  await denies(()=>ranking(teacher));
  await denies(()=>ranking(teacher,'class'));
  await db.query('delete from public.teacher_subjects where teacher_id=$1',[teacher]);
  await denies(()=>ranking(teacher,'class',klass));
  await db.query('insert into public.teacher_subjects values($1,$2)',[teacher,subject]);
});
await check('bootstrap sem turma nunca retorna ranking escolar e professor vê só XP da disciplina',async()=>{
  const result=await ranking(student,'class');
  assert.deepEqual(result.entries,[]); assert.equal(result.total,0); assert.equal(result.my_position,null);
  assert.deepEqual(result.classes,[{id:klass,name:'Turma A'}]);
  await db.query(`insert into public.gamification_events values($1,'correct','other-subject',9999,now(),$2)`,[peer,subject2]);
  const school=await ranking(peer),scoped=await ranking(teacher,'class',klass);
  assert.equal(school.my_position.weekly_xp,10029);
  const entry=scoped.entries.find(e=>e.alias==='Mesmo');
  assert.equal(entry.weekly_xp,30); assert.equal(entry.level,1);
});
await check('validação estrita: apelidos, nulos, escopo e paginação',async()=>{
  for(const alias of [null,'aa','a'.repeat(25),'nome@example.test','<script>','https://x.test','abc\nxyz','abc\u0001'])
    await assert.rejects(prefs(peer,alias),e=>e.code==='PT400');
  await assert.rejects(prefs(peer,'Válido',null),e=>e.code==='PT400');
  await denies(()=>prefs(teacher,'Docente'));
  for(const [scope,c,page,size] of [[null,null,1,20],['other',null,1,20],['school',klass,1,20],['school',null,0,20],['school',null,1,101],['school',null,null,20],['school',null,1,null]])
    await assert.rejects(ranking(student,scope,c,page,size),e=>e.code==='PT400');
  assert.equal((await prefs(peer,'  Órbita  ')).alias,'Órbita');
});
await check('contas pendentes, expiradas, sem aceite e menores sem admissão ficam invisíveis',async()=>{
  const id=uid(20); await user(id); await prefs(id,'Visível');
  const update=async sql=>db.query(`update public.profiles set ${sql} where id=$1`,[id]);
  const absent=async()=>{ await denies(()=>summary(id)); await denies(()=>ranking(id)); assert.equal((await ranking(student)).entries.some(e=>e.alias==='Visível'),false); };
  await update("registration_status='pending_teacher'"); await absent(); await update("registration_status='active'");
  await update("privacy_policy_version='1.3'"); await absent();
  await db.query('update public.profiles set privacy_policy_version=$2 where id=$1',[id,policy]);
  // A retenção remove o horário detalhado; a versão vigente continua comprovada no perfil.
  await update('privacy_policy_accepted_at=null'); assert.ok(await summary(id));
  await update("privacy_policy_accepted_at=now()+interval '1 hour'"); await absent();
  await update('privacy_policy_accepted_at=now()');
  await update('terms_of_use_version=null'); await absent();
  await update("terms_of_use_version='0.9'"); await absent();
  await db.query('update public.profiles set terms_of_use_version=$2 where id=$1',[id,terms]);
  await update("age_band='minor'"); await absent();
  await update("admission_status='approved',admission_version='1'"); assert.ok(await summary(id));
  await update("admission_version=null"); await absent();
  await update("age_band='unknown'"); await absent(); await update("age_band='adult'");
  await db.query(`update auth.users set created_at=now()-interval '168 hours' where id=$1`,[id]);
  await update('full_name=full_name'); await absent();
  await denies(()=>summary(null)); await denies(()=>summary(uid(999))); await denies(()=>summary(teacher));
});
await check('pódio apenas semana anterior, XP positivo, opt-in atual e sem bônus',async()=>{
  const start=(await ranking(student)).week_start;
  await prefs(outsider,'Pódio');
  // Isola o pódio dos eventos da semana anterior criados pelo teste de fronteira.
  await db.query(`update public.gamification_events set occurred_at=$2::timestamptz-interval '8 days' where student_id=$1 and occurred_at<$2::timestamptz`,[outsider,start]);
  await db.query(`insert into public.gamification_events values($1,'correct','podium-past',10,$2::timestamptz-interval '1 second',$3)`,[outsider,start,subject]);
  const s=await summary(outsider);
  assert.equal(s.catalog.find(c=>c.id==='weekly_podium').unlocked,true);
  assert.equal(s.catalog.find(c=>c.id==='weekly_podium').bonus_xp,0);
  assert.equal(await count(`select count(*) n from public.student_achievements where achievement_id='weekly_podium'`),0);
  await db.query(`update public.profiles set featured_badge_id='weekly_podium' where id=$1`,[outsider]);
  await prefs(outsider,'Pódio',false);
  assert.equal((await summary(outsider)).achievements.some(a=>a.id==='weekly_podium'),false);
  await prefs(outsider,'Pódio',true);
  await db.query(`update public.gamification_events set occurred_at=$2::timestamptz-interval '8 days' where student_id=$1 and event_key='podium-past'`,[outsider,start]);
  assert.equal((await summary(outsider)).achievements.some(a=>a.id==='weekly_podium'),false);
  await assert.rejects(db.query(`update public.profiles set featured_badge_id='turnaround' where id=$1`,[outsider]),e=>e.code==='PT403');
  await db.query(`update public.profiles set featured_badge_id='five_lessons' where id=$1`,[student]);
});
await check('grants reais: anon/auth não executam RPCs nem leem/escrevem ledger',async()=>{
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[student]);
  for(const role of ['anon','authenticated']) await asRole(role,async()=>{
    for(const sql of ['select public.gamification_summary($1)','select public.weekly_leaderboard($1)',
      "select public.update_leaderboard_preferences($1,'Ataque',true)",
      'select private.refresh_gamification($1)','select private.gamification_visible($1)'])
      await assert.rejects(db.query(sql,[peer]),e=>e.code==='42501');
    for(const t of ['gamification_events','student_achievements','leaderboard_preferences']) {
      await assert.rejects(db.query(`select * from public.${t}`),e=>e.code==='42501');
      await assert.rejects(db.query(`delete from public.${t}`),e=>e.code==='42501');
    }
    await assert.rejects(db.query(`insert into public.question_attempts(student_id,question_id,selected_index,correct) select $1,id,0,true from public.questions limit 1`,[student]),e=>e.code==='42501');
  });
});
await check('RLS nega tabelas novas mesmo com grant acidental e JWT de outro aluno',async()=>{
  for(const t of ['gamification_events','student_achievements','leaderboard_preferences']) {
    await db.exec(`grant select,insert,update,delete on public.${t} to authenticated`);
    await asRole('authenticated',async()=>{
      assert.equal((await db.query(`select * from public.${t}`)).rows.length,0);
      assert.equal((await db.query(`delete from public.${t} returning *`)).rows.length,0);
    });
    await db.exec(`revoke all on public.${t} from authenticated`);
  }
});
await check('locks e restrições estruturais executam no PostgreSQL, rollback é atômico',async()=>{
  assert.equal(await count(`select count(*) n from pg_trigger where tgname='gamification_lock' and not tgisinternal`),4);
  const body=(await db.query(`select pg_get_functiondef('private.gamification_lock()'::regprocedure) body`)).rows[0].body;
  assert.ok(body.includes('pg_advisory_xact_lock')); assert.ok(body.includes('hashtextextended(new.student_id::text,0)'));
  const before=await summary(peer);
  await db.exec('begin');
  await attempt(peer,await question('rollback'),true);
  await db.exec('rollback');
  assert.equal((await summary(peer)).points,before.points);
});
await check('exclusão Auth remove ledger, conquistas e preferências por cascade',async()=>{
  await db.query('delete from auth.users where id=$1',[student]);
  for(const t of ['gamification_events','student_achievements','leaderboard_preferences'])
    assert.equal(await count(`select count(*) n from public.${t} where student_id=$1`,[student]),0);
  await denies(()=>summary(student));
  assert.equal((await ranking(peer,'class',klass)).total,1);
});
await db.close();
console.log(`POSTGRESQL_GAMIFICATION_OK: ${passed} cenários; migrations reais, policy ${policy}, Auth/Storage simulados.`);
console.log('CONCURRENCY_LIMIT: PGlite possui uma sessão. Idempotência exercitada; locks transacionais verificados no SQL, sem alegar disputa entre conexões.');
