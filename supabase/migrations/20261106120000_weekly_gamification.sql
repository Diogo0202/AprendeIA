-- PREVIEW (somente SELECT, antes desta migration):
-- node scripts/validation/gamification-database.mjs --preview > gamification-preview.sql
-- Executar o arquivo emitido no banco alvo e revisar os resultados antes do deploy.
-- Eventos históricos sem instante comprovável contam no total vitalício, nunca na semana.
begin;

-- Serializa também o backfill com escritores antigos durante a instalação.
lock table public.question_attempts, public.lesson_progress,
  public.student_activity_days, public.diagnostic_sessions in share row exclusive mode;

create table public.gamification_events (
  student_id uuid not null references public.profiles(id) on delete cascade,
  event_kind text not null check(event_kind in ('lesson','correct','day','achievement')),
  event_key text not null,
  xp integer not null check(xp > 0),
  occurred_at timestamptz,
  subject_id uuid references public.subjects(id) on delete set null,
  primary key(student_id,event_kind,event_key)
);
create index gamification_events_week on public.gamification_events(occurred_at,student_id) include(xp);
create table public.student_achievements (
  student_id uuid not null references public.profiles(id) on delete cascade,
  achievement_id text not null check(achievement_id in (
    'first_lesson','study_streak','ten_correct_answers','excellent_accuracy',
    'diagnostic_completed','subject_explorer','five_lessons','ten_lessons',
    'twenty_five_correct','fifty_correct','five_active_days','turnaround')),
  earned_at timestamptz,
  primary key(student_id,achievement_id)
);
create table public.leaderboard_preferences (
  student_id uuid primary key references public.profiles(id) on delete cascade,
  alias text not null default ('Aluno-'||substr(replace(gen_random_uuid()::text,'-',''),1,8)) check (
    alias=btrim(alias) and char_length(alias) between 3 and 24 and alias ~ '^[[:alnum:]_ -]+$'),
  school_opt_in boolean not null default false
);
alter table public.gamification_events enable row level security;
alter table public.student_achievements enable row level security;
alter table public.leaderboard_preferences enable row level security;
revoke all on public.gamification_events,public.student_achievements,public.leaderboard_preferences
  from public,anon,authenticated;
grant all on public.gamification_events,public.student_achievements,public.leaderboard_preferences to service_role;
create policy gamification_events_server on public.gamification_events to service_role using(true) with check(true);
create policy student_achievements_server on public.student_achievements to service_role using(true) with check(true);
create policy leaderboard_preferences_server on public.leaderboard_preferences to service_role using(true) with check(true);

-- Mantém a barreira RF07 mesmo se um grant for acrescentado no futuro.
do $$ declare t text; cmd text; begin
  foreach t in array array['gamification_events','student_achievements','leaderboard_preferences'] loop
    foreach cmd in array array['SELECT','INSERT','UPDATE','DELETE'] loop
      execute format('create policy %I on public.%I as restrictive for %s to authenticated %s',
        'rf07_'||lower(cmd),t,cmd,
        case when cmd='INSERT' then 'with check (private.lifecycle_access())'
          when cmd='UPDATE' then 'using (private.lifecycle_access()) with check (private.lifecycle_access())'
          else 'using (private.lifecycle_access())' end);
    end loop;
  end loop;
end $$;

insert into public.leaderboard_preferences(student_id) select id from public.profiles where role='student';
create function private.gamification_initialize() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.role='student' then
    insert into public.leaderboard_preferences(student_id) values(new.id) on conflict do nothing;
  end if;
  return new;
end $$;
create trigger gamification_initialize after insert or update of role on public.profiles
for each row execute function private.gamification_initialize();

create function private.gamification_catalog()
returns table(id text,title text,description text,icon text,bonus_xp integer)
language sql immutable set search_path='' as $$
  values
  ('first_lesson','Primeiro passo','Concluiu a primeira aula.','🌱',0),
  ('study_streak','Ritmo de estudo','Estudou por três dias seguidos.','🔥',0),
  ('ten_correct_answers','Mente afiada','Acertou dez questões distintas.','🎯',0),
  ('excellent_accuracy','Em ótima fase','Atingiu 80% de acertos com pelo menos cinco respostas.','⭐',0),
  ('diagnostic_completed','Trilha iniciada','Concluiu o diagnóstico.','🧭',30),
  ('subject_explorer','Explorador','Estudou duas disciplinas.','🔎',40),
  ('five_lessons','Prática constante','Concluiu cinco aulas.','📚',50),
  ('ten_lessons','Dez aulas','Concluiu dez aulas.','🏅',100),
  ('twenty_five_correct','Mente em movimento','Acertou 25 questões distintas.','🎯',50),
  ('fifty_correct','Cinquenta acertos','Acertou 50 questões distintas.','🏆',100),
  ('five_active_days','Semana dedicada','Estudou em cinco dias diferentes.','📅',75),
  ('turnaround','Virada de aprendizado','Primeiras cinco questões abaixo de 60%, próximas cinco com pelo menos 80%, no mesmo tópico.','🚀',100)
$$;

create function private.gamification_week(p_at timestamptz)
returns timestamptz language sql immutable set search_path='' as $$
  select date_trunc('week',p_at at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
$$;

-- Mesmo lock do ciclo de exclusão. BEFORE impede que duas transações escrevam
-- fontes diferentes antes de adquirir o lock do aluno. AFTER vê a escrita corrente.
create function private.gamification_lock() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and new.student_id is distinct from old.student_id then
    raise exception using errcode='22023',message='Identidade da atividade imutável';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.student_id::text,0));
  return new;
end $$;
create trigger gamification_lock before insert or update on public.question_attempts
for each row execute function private.gamification_lock();
create trigger gamification_lock before insert or update on public.lesson_progress
for each row execute function private.gamification_lock();
create trigger gamification_lock before insert or update on public.student_activity_days
for each row execute function private.gamification_lock();
create trigger gamification_lock before insert or update on public.diagnostic_sessions
for each row execute function private.gamification_lock();

create function private.refresh_gamification(p_student uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_student::text,0));
  if not exists(select 1 from public.profiles where id=p_student and role='student') then return; end if;
  -- Ocorrências desconhecidas ficam primeiro. Só datamos um limiar se todas as
  -- suas evidências têm data confiável. Nenhum bônus de backfill recebe now().
  with numbered as (
    select e.*,row_number() over(partition by event_kind order by occurred_at nulls first,event_key) n,
      count(*) filter(where occurred_at is null) over(partition by event_kind) unknowns
    from public.gamification_events e where student_id=p_student and event_kind<>'achievement'
  ), thresholds as (
    select v.id,case when e.unknowns=0 then e.occurred_at end earned_at
    from (values ('first_lesson','lesson',1),('five_lessons','lesson',5),('ten_lessons','lesson',10),
      ('ten_correct_answers','correct',10),('twenty_five_correct','correct',25),
      ('fifty_correct','correct',50),('five_active_days','day',5)) v(id,kind,n)
    join numbered e on e.event_kind=v.kind and e.n=v.n
  ), subject_first as (
    select subject_id,case when count(*)=count(occurred_at) then min(occurred_at) end at
    from public.gamification_events where student_id=p_student and subject_id is not null
      and event_kind='lesson' group by subject_id
  ), explorer as (
    select at,row_number() over(order by at nulls first,subject_id) n,
      count(*) filter(where at is null) over() unknowns from subject_first
  ), days as (
    select activity_date,activity_date-row_number() over(order by activity_date)::int grp
    from public.student_activity_days where student_id=p_student
  ), streak as (
    select min(activity_date)+2 d from days group by grp having count(*)>=3
  ), attempts as (
    select correct,answered_at,row_number() over(order by answered_at,id) n,
      sum(correct::int) over(order by answered_at,id) successes
    from public.question_attempts where student_id=p_student
  ), distinct_questions as (
    select distinct on(a.question_id) a.question_id,q.subject_id,q.topic,a.correct,a.answered_at,a.id
    from public.question_attempts a join public.questions q on q.id=a.question_id
    where a.student_id=p_student order by a.question_id,a.answered_at,a.id
  ), topic_attempts as (
    select *,row_number() over(partition by subject_id,topic order by answered_at,id) n from distinct_questions
  ), recovery as (
    select max(answered_at) at from topic_attempts where n<=10 group by subject_id,topic
    having count(*)=10 and sum(correct::int) filter(where n<=5)<3
      and sum(correct::int) filter(where n>5)>=4
  ), candidates as (
    select * from thresholds
    union all select 'subject_explorer',case when unknowns=0 then at end from explorer where n=2
    union all select 'study_streak',min(d)::timestamp at time zone 'America/Sao_Paulo' from streak having count(*)>0
    union all select 'excellent_accuracy',min(answered_at) from attempts
      where n>=5 and round(successes*100.0/n)>=80 having count(*)>0
    union all select 'diagnostic_completed',min(completed_at) from public.diagnostic_sessions
      where student_id=p_student and status='completed' having count(*)>0
    union all select 'turnaround',min(at) from recovery having count(*)>0
  )
  insert into public.student_achievements(student_id,achievement_id,earned_at)
  select p_student,id,earned_at from candidates on conflict do nothing;

  insert into public.gamification_events(student_id,event_kind,event_key,xp,occurred_at)
  select p_student,'achievement',a.achievement_id,c.bonus_xp,a.earned_at
  from public.student_achievements a join private.gamification_catalog() c on c.id=a.achievement_id
  where a.student_id=p_student and c.bonus_xp>0 on conflict do nothing;
end $$;

create function private.gamification_record() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_subject uuid;
begin
  if not exists(select 1 from public.profiles where id=new.student_id and role='student') then return new; end if;
  if tg_table_name='question_attempts' then
    if new.correct then
      select subject_id into v_subject from public.questions where id=new.question_id;
      insert into public.gamification_events values(new.student_id,'correct',new.question_id::text,10,new.answered_at,v_subject)
        on conflict do nothing;
    end if;
  elsif tg_table_name='lesson_progress' then
    if new.completed and (tg_op='INSERT' or not old.completed) then
      select m.subject_id into v_subject from public.lessons l join public.modules m on m.id=l.module_id where l.id=new.lesson_id;
      insert into public.gamification_events values(new.student_id,'lesson',new.lesson_id::text,100,statement_timestamp(),v_subject)
        on conflict do nothing;
    end if;
  elsif tg_table_name='student_activity_days' then
    insert into public.gamification_events values(new.student_id,'day',new.activity_date::text,20,
      new.activity_date::timestamp at time zone 'America/Sao_Paulo',null) on conflict do nothing;
  end if;
  perform private.refresh_gamification(new.student_id);
  return new;
end $$;
create trigger gamification_record after insert on public.question_attempts
for each row execute function private.gamification_record();
create trigger gamification_record after insert or update of completed on public.lesson_progress
for each row execute function private.gamification_record();
create trigger gamification_record after insert on public.student_activity_days
for each row execute function private.gamification_record();
create trigger gamification_record after insert or update of status on public.diagnostic_sessions
for each row execute function private.gamification_record();

-- O esquema legado não prova o instante da primeira conclusão de aula.
insert into public.gamification_events
select p.student_id,'lesson',p.lesson_id::text,100,null,m.subject_id
from public.lesson_progress p join public.lessons l on l.id=p.lesson_id
join public.modules m on m.id=l.module_id join public.profiles u on u.id=p.student_id
where p.completed and u.role='student';
insert into public.gamification_events
select a.student_id,'correct',a.question_id::text,10,min(a.answered_at),q.subject_id
from public.question_attempts a join public.questions q on q.id=a.question_id
join public.profiles u on u.id=a.student_id where a.correct and u.role='student'
group by a.student_id,a.question_id,q.subject_id;
insert into public.gamification_events
select d.student_id,'day',d.activity_date::text,20,
  d.activity_date::timestamp at time zone 'America/Sao_Paulo',null
from public.student_activity_days d join public.profiles p on p.id=d.student_id where p.role='student';
do $$ declare s record; begin
  for s in select id from public.profiles where role='student' order by id loop
    perform private.refresh_gamification(s.id);
  end loop;
end $$;

-- Critério explícito, independente da versão da função de RLS de lifecycle.
create function private.gamification_visible(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles p join auth.users u on u.id=p.id
    where p.id=p_id and p.role in ('student','teacher') and p.registration_status='active'
    and p.privacy_policy_version='1.4' and p.privacy_policy_accepted_at is not null
    and p.privacy_policy_accepted_at<=now() and u.created_at<=now()
    and u.created_at+interval '168 hours'>now() and p.account_expires_at>now()
    and (p.age_band='adult' or (p.age_band='minor' and p.admission_status='approved' and p.admission_version='1')))
$$;
create function private.gamification_actor(p_actor uuid) returns public.app_role
language plpgsql stable security definer set search_path='' as $$
declare r public.app_role;
begin
  if p_actor is null or not private.gamification_visible(p_actor) then
    raise exception using errcode='PT403',message='Conta indisponível para gamificação';
  end if;
  select role into r from public.profiles where id=p_actor;
  return r;
end $$;

-- Na turma só entram eventos atribuídos à disciplina. Dias e bônus globais
-- participam do ranking escolar, sem revelar ao professor outra disciplina.
-- Apelido e id só desempatem a paginação; o rank usa exclusivamente o XP.
create function private.gamification_ranking(p_start timestamptz,p_end timestamptz,p_class uuid)
returns table(student_id uuid,alias text,avatar_key text,weekly_xp bigint,level bigint,rank bigint)
language sql stable security definer set search_path='' as $$
  with scores as (
    select p.id student_id,coalesce(pref.alias,'Estudante') alias,
      case when p.avatar_key in ('orbit','spark','books','prism','trail') then p.avatar_key else 'orbit' end avatar_key,
      coalesce(sum(e.xp) filter(where e.occurred_at>=p_start and e.occurred_at<p_end),0)::bigint weekly_xp,
      (coalesce(sum(e.xp),0)/250+1)::bigint level
    from public.profiles p left join public.leaderboard_preferences pref on pref.student_id=p.id
    left join public.gamification_events e on e.student_id=p.id and (p_class is null or
      e.subject_id=(select subject_id from public.classes where id=p_class))
    where p.role='student' and private.gamification_visible(p.id)
      and ((p_class is null and coalesce(pref.school_opt_in,false)) or (p_class is not null and exists(
        select 1 from public.class_students cs join public.classes c on c.id=cs.class_id
        join public.enrollments en on en.student_id=cs.student_id and en.subject_id=c.subject_id
        where cs.class_id=p_class and cs.student_id=p.id)))
    group by p.id,pref.alias,p.avatar_key
  ) select *,rank() over(order by weekly_xp desc) from scores
$$;

create function public.weekly_leaderboard(p_actor uuid,p_scope text default 'school',p_class_id uuid default null,
  p_page integer default 1,p_page_size integer default 20) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r public.app_role; start_at timestamptz; end_at timestamptz; result jsonb; classes jsonb;
begin
  r:=private.gamification_actor(p_actor);
  if p_scope is null or p_scope not in ('school','class') or p_page is null or p_page<1 or p_page>1000000
    or p_page_size is null or p_page_size not between 1 and 100
    or (p_scope='school' and p_class_id is not null) then
    raise exception using errcode='PT400',message='Escopo ou paginação inválidos';
  end if;
  if r='teacher' and (p_scope<>'class' or p_class_id is null) then
    raise exception using errcode='PT403',message='Professor consulta somente a própria turma';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name) order by c.name,c.id),'[]') into classes
  from public.classes c where
    (r='teacher' and c.teacher_id=p_actor and exists(select 1 from public.teacher_subjects ts
      where ts.teacher_id=p_actor and ts.subject_id=c.subject_id))
    or (r='student' and exists(select 1 from public.class_students cs join public.enrollments en
      on en.student_id=cs.student_id and en.subject_id=c.subject_id where cs.class_id=c.id and cs.student_id=p_actor));
  start_at:=private.gamification_week(now());
  end_at:=(start_at at time zone 'America/Sao_Paulo'+interval '7 days') at time zone 'America/Sao_Paulo';
  -- Bootstrap do seletor: jamais passar NULL para o ranking escolar neste ramo.
  if p_scope='class' and p_class_id is null then
    return jsonb_build_object('entries','[]'::jsonb,'my_position',null,'total',0,
      'page',p_page,'page_size',p_page_size,'week_start',start_at,'week_end',end_at,'classes',classes,
      'school_opt_in',coalesce((select school_opt_in from public.leaderboard_preferences where student_id=p_actor),false),
      'alias',coalesce((select alias from public.leaderboard_preferences where student_id=p_actor),'Estudante'));
  end if;
  if p_scope='class' and not exists(select 1 from jsonb_array_elements(classes) c where c->>'id'=p_class_id::text) then
    raise exception using errcode='PT403',message='Turma indisponível';
  end if;
  with ranked as materialized (
    select *,row_number() over(order by weekly_xp desc,alias collate "C",student_id) ordinal
    from private.gamification_ranking(start_at,end_at,p_class_id)
  ), safe as (
    select ordinal,student_id,jsonb_build_object('alias',alias,'avatar_key',avatar_key,'weekly_xp',weekly_xp,
      'level',level,'rank',rank,'is_me',student_id=p_actor) entry from ranked
  ) select jsonb_build_object(
    'entries',coalesce((select jsonb_agg(entry order by ordinal) from safe
      where ordinal>(p_page::bigint-1)*p_page_size and ordinal<=p_page::bigint*p_page_size),'[]'),
    'my_position',(select entry from safe where student_id=p_actor),'total',(select count(*) from safe),
    'page',p_page,'page_size',p_page_size,'week_start',start_at,'week_end',end_at,'classes',classes,
    'school_opt_in',coalesce((select school_opt_in from public.leaderboard_preferences where student_id=p_actor),false),
    'alias',coalesce((select alias from public.leaderboard_preferences where student_id=p_actor),'Estudante')) into result;
  return result;
end $$;

create function public.update_leaderboard_preferences(p_actor uuid,p_alias text,p_school_opt_in boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if private.gamification_actor(p_actor)<>'student' then
    raise exception using errcode='PT403',message='Preferências exclusivas do estudante';
  end if;
  if p_alias is null or p_school_opt_in is null or char_length(btrim(p_alias)) not between 3 and 24
    or btrim(p_alias) !~ '^[[:alnum:]_ -]+$' then
    raise exception using errcode='PT400',message='Apelido inválido';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
  insert into public.leaderboard_preferences values(p_actor,btrim(p_alias),p_school_opt_in)
    on conflict(student_id) do update set alias=excluded.alias,school_opt_in=excluded.school_opt_in;
  return jsonb_build_object('alias',btrim(p_alias),'school_opt_in',p_school_opt_in);
end $$;

-- Pódio sem XP, apenas última semana civil encerrada e participantes vivos/aptos.
-- A visibilidade atual e o opt-in atual também se aplicam ao pódio.
create function private.gamification_podium(p_actor uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from private.gamification_ranking(
    (private.gamification_week(now()) at time zone 'America/Sao_Paulo'-interval '7 days') at time zone 'America/Sao_Paulo',
    private.gamification_week(now()),null) r where student_id=p_actor and weekly_xp>0 and rank<=3)
$$;

create function public.gamification_summary(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare points bigint; weekly_points bigint; bonus_points bigint; attempts bigint; correct_count bigint;
  days bigint; streak integer; badges jsonb; catalog jsonb; podium boolean; start_at timestamptz; end_at timestamptz;
  today date:=(now() at time zone 'America/Sao_Paulo')::date; cursor_day date;
begin
  if private.gamification_actor(p_actor)<>'student' then
    raise exception using errcode='PT403',message='Resumo exclusivo do estudante';
  end if;
  start_at:=private.gamification_week(now());
  end_at:=(start_at at time zone 'America/Sao_Paulo'+interval '7 days') at time zone 'America/Sao_Paulo';
  select coalesce(sum(xp),0),coalesce(sum(xp) filter(where occurred_at>=start_at and occurred_at<end_at),0),
    coalesce(sum(xp) filter(where event_kind='achievement'),0)
    into points,weekly_points,bonus_points from public.gamification_events where student_id=p_actor;
  select count(*),count(*) filter(where correct) into attempts,correct_count from public.question_attempts where student_id=p_actor;
  select count(*) into days from public.student_activity_days where student_id=p_actor;
  cursor_day:=case when exists(select 1 from public.student_activity_days where student_id=p_actor and activity_date=today)
    then today else today-1 end;
  streak:=0;
  while exists(select 1 from public.student_activity_days where student_id=p_actor and activity_date=cursor_day) loop
    streak:=streak+1; cursor_day:=cursor_day-1;
  end loop;
  with totals as (
    select count(*) filter(where event_kind='lesson') lessons,count(*) filter(where event_kind='correct') correct,
      count(distinct subject_id) filter(where event_kind='lesson') subjects
    from public.gamification_events where student_id=p_actor
  ), activity as (
    select activity_date,activity_date-row_number() over(order by activity_date)::int grp
    from public.student_activity_days where student_id=p_actor
  ), longest as (select coalesce(max(n),0) n from (select count(*) n from activity group by grp) s),
  accuracy as (
    select row_number() over(order by answered_at,id) n,
      sum(correct::int) over(order by answered_at,id)*100.0/row_number() over(order by answered_at,id) pct
    from public.question_attempts where student_id=p_actor
  ), progress as (
    select v.* from totals t cross join longest l cross join lateral (values
      ('first_lesson',t.lessons,1),('study_streak',l.n,3),('ten_correct_answers',t.correct,10),
      ('excellent_accuracy',(select coalesce(max(round(pct)),0) from accuracy where n>=5)::bigint,80),
      ('diagnostic_completed',(select count(*) from public.diagnostic_sessions where student_id=p_actor and status='completed'),1),
      ('subject_explorer',t.subjects,2),('five_lessons',t.lessons,5),('ten_lessons',t.lessons,10),
      ('twenty_five_correct',t.correct,25),('fifty_correct',t.correct,50),('five_active_days',days,5),
      ('turnaround',(select count(*) from public.student_achievements where student_id=p_actor and achievement_id='turnaround'),1)
    ) v(id,progress,target)
  ) select jsonb_agg(jsonb_build_object('id',c.id,'title',c.title,'description',c.description,'icon',c.icon,
    'bonus_xp',c.bonus_xp,'unlocked',a.achievement_id is not null,'earned_at',a.earned_at,
    'progress',case when a.achievement_id is not null then pr.target else least(pr.progress,pr.target) end,
    'target',pr.target) order by c.id) into catalog
  from private.gamification_catalog() c join progress pr on pr.id=c.id
    left join public.student_achievements a on a.student_id=p_actor and a.achievement_id=c.id;
  podium:=private.gamification_podium(p_actor);
  catalog:=catalog||jsonb_build_array(jsonb_build_object('id','weekly_podium','title','Pódio da semana anterior',
    'description','Ficou entre as três primeiras posições da escola na semana anterior.','icon','🏆','bonus_xp',0,
    'unlocked',podium,'progress',podium::int,'target',1,'earned_at',case when podium then start_at end));
  select coalesce(jsonb_agg(c),'[]') into badges from jsonb_array_elements(catalog) c where (c->>'unlocked')::boolean;
  return jsonb_build_object('points',points,'level',points/250+1,'next_level_points',(points/250+1)*250,
    'level_progress',round((points%250)*100.0/250),'accuracy_percent',case when attempts=0 then 0 else round(correct_count*100.0/attempts) end,
    'active_days',days,'current_streak',streak,'achievements',badges,'catalog',catalog,
    'weekly_xp',weekly_points,'bonus_xp',bonus_points,'week_start',start_at,'week_end',end_at,
    'alias',coalesce((select alias from public.leaderboard_preferences where student_id=p_actor),'Estudante'),
    'school_opt_in',coalesce((select school_opt_in from public.leaderboard_preferences where student_id=p_actor),false));
end $$;

alter table public.profiles drop constraint profiles_featured_badge_allowed,
  add constraint profiles_featured_badge_allowed check(featured_badge_id is null or featured_badge_id in (
    'first_lesson','study_streak','ten_correct_answers','excellent_accuracy',
    'diagnostic_completed','subject_explorer','five_lessons','ten_lessons',
    'twenty_five_correct','fifty_correct','five_active_days','turnaround','weekly_podium'));

-- Novas escolhas exigem conquista real, inclusive para callers privilegiados da API.
-- Uma seleção antiga fica armazenada; o resumo só expõe pódio da semana anterior.
create function private.gamification_featured_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.featured_badge_id is not null and new.featured_badge_id is distinct from old.featured_badge_id then
    if not private.gamification_visible(new.id) or
      (new.featured_badge_id='weekly_podium' and not private.gamification_podium(new.id)) or
      (new.featured_badge_id<>'weekly_podium' and not exists(select 1 from public.student_achievements
        where student_id=new.id and achievement_id=new.featured_badge_id)) then
      raise exception using errcode='PT403',message='Conquista indisponível';
    end if;
  end if;
  return new;
end $$;
create trigger gamification_featured_guard before update of featured_badge_id on public.profiles
for each row execute function private.gamification_featured_guard();

revoke all on function private.gamification_catalog(),private.gamification_week(timestamptz),
  private.gamification_initialize(),
  private.gamification_lock(),private.refresh_gamification(uuid),private.gamification_record(),
  private.gamification_visible(uuid),private.gamification_actor(uuid),
  private.gamification_ranking(timestamptz,timestamptz,uuid),private.gamification_podium(uuid),
  private.gamification_featured_guard() from public,anon,authenticated;
revoke all on function public.gamification_summary(uuid),public.weekly_leaderboard(uuid,text,uuid,integer,integer),
  public.update_leaderboard_preferences(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.gamification_summary(uuid),public.weekly_leaderboard(uuid,text,uuid,integer,integer),
  public.update_leaderboard_preferences(uuid,text,boolean) to service_role;
commit;
