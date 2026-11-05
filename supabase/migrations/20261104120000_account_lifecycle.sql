-- RF07. Sem cron, exclusão de Auth ou escrita em storage.objects.
begin;

do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema='auth'
                 and table_name='users' and column_name='created_at' and data_type='timestamp with time zone') then
    raise exception 'RF07 preflight: auth.users.created_at timestamptz obrigatório';
  end if;
  if exists (select 1 from auth.users where created_at is null or created_at > now()) then
    raise exception 'RF07 preflight: datas Auth ausentes ou futuras';
  end if;
end $$;

alter table public.profiles
  add column auth_created_at timestamptz,
  add column account_expires_at timestamptz,
  add column age_band text not null default 'unknown' check (age_band in ('adult','minor','unknown')),
  add column admission_status text not null default 'pending' check (admission_status in ('pending','approved','rejected')),
  add column admission_version text;

-- Legados exigem declaração; o relógio vem de Auth, nunca profiles.created_at.
update public.profiles p set auth_created_at=u.created_at,
  account_expires_at=case when p.role='admin' then null else u.created_at + interval '168 hours' end
from auth.users u where u.id=p.id;
alter table public.profiles alter column auth_created_at set not null;

create function private.account_lifecycle_guard() returns trigger
language plpgsql security definer set search_path='' as $$
declare started timestamptz; declared text;
begin
  if tg_op='UPDATE' and current_setting('role',true) in ('authenticated','anon') and (
    new.auth_created_at is distinct from old.auth_created_at or
    new.account_expires_at is distinct from old.account_expires_at or
    new.age_band is distinct from old.age_band or
    new.admission_status is distinct from old.admission_status or
    new.admission_version is distinct from old.admission_version or new.role is distinct from old.role
  ) then raise exception using errcode='42501', message='RF07: campos controlados pelo servidor'; end if;
  select created_at, raw_user_meta_data->>'age_band' into started,declared from auth.users where id=new.id;
  if started is null or started > now() then
    raise exception 'RF07: data Auth inválida';
  end if;
  new.auth_created_at := started;
  new.account_expires_at := case when new.role='admin' then null else started+interval '168 hours' end;
  if tg_op='INSERT' then
    new.age_band := case when declared in ('adult','minor','unknown') then declared else 'unknown' end;
    new.admission_status := 'pending';
    new.admission_version := null;
  end if;
  return new;
end $$;
revoke all on function private.account_lifecycle_guard() from public;
-- BEFORE profiles insert conserva o trigger vigente de política 1.3 em Auth.
create trigger account_lifecycle_guard before insert or update on public.profiles
for each row execute function private.account_lifecycle_guard();

create table public.account_admissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  responsible_name text not null check (length(btrim(responsible_name)) between 2 and 120 and responsible_name !~ '[[:cntrl:]]'),
  responsible_contact text not null check (length(btrim(responsible_contact)) between 3 and 200 and responsible_contact !~ '[[:cntrl:]]'),
  institutional_reference text not null check (length(btrim(institutional_reference)) between 2 and 200 and institutional_reference !~ '[[:cntrl:]]'),
  version text not null check (version='1'),
  decision text not null default 'pending' check (decision in ('pending','approved','rejected')),
  note text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index account_admission_pending on public.account_admissions(user_id) where decision='pending';
alter table public.account_admissions enable row level security;
revoke all on public.account_admissions from anon,authenticated;
grant all on public.account_admissions to service_role;
create policy account_admissions_service on public.account_admissions to service_role using(true) with check(true);

create function private.lifecycle_access() returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce((select p.role='admin' or (
    p.role in ('student','teacher') and u.created_at+interval '168 hours' > now()
    and (p.age_band='adult' or (p.age_band='minor' and p.admission_status='approved' and p.admission_version='1'))
  ) from public.profiles p join auth.users u on u.id=p.id where p.id=auth.uid()),false)
$$;
revoke all on function private.lifecycle_access() from public;
grant execute on function private.lifecycle_access() to authenticated;

-- Restritivas AND com as políticas existentes. Perfil próprio pode ser lido
-- para status; escrita continua sujeita à barreira e aos grants por coluna.
do $$ declare t record; cmd text; condition text; begin
  for t in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','storage') and c.relkind in ('r','p') and c.relrowsecurity
  loop
    foreach cmd in array array['SELECT','INSERT','UPDATE','DELETE'] loop
      condition := 'private.lifecycle_access()';
      if t.nspname='public' and t.relname='profiles' and cmd='SELECT' then
        condition := '(id = (select auth.uid()) or private.lifecycle_access())';
      end if;
      execute format('create policy %I on %I.%I as restrictive for %s to authenticated %s',
        'rf07_'||lower(cmd),t.nspname,t.relname,cmd,
        case when cmd='INSERT' then 'with check ('||condition||')'
             when cmd='UPDATE' then 'using ('||condition||') with check ('||condition||')'
             else 'using ('||condition||')' end);
    end loop;
  end loop;
end $$;

create function public.declare_account_age(p_actor uuid,p_age_band text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id=p_actor for update;
  if not found then raise exception using errcode='PT404',message='Perfil ausente'; end if;
  if p_age_band is null or p_age_band not in ('adult','minor','unknown') then
    raise exception using errcode='PT400',message='Faixa inválida'; end if;
  if p.age_band <> 'unknown' and p.age_band <> p_age_band then
    raise exception using errcode='PT409',message='Declaração já registrada; revisão institucional exigida'; end if;
  update public.profiles set age_band=p_age_band where id=p_actor;
  return jsonb_build_object('age_band',p_age_band);
end $$;

create function public.request_account_admission(p_actor uuid,p_responsible_name text,p_responsible_contact text,
  p_institutional_reference text,p_version text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare p public.profiles; result public.account_admissions;
begin
  select * into p from public.profiles where id=p_actor for update;
  if not found or p.age_band<>'minor' or p.role='admin' or p.account_expires_at<=now() then
    raise exception using errcode='PT403',message='Admissão indisponível'; end if;
  if p_version is distinct from '1' then raise exception using errcode='PT400',message='Versão inválida'; end if;
  if p.admission_status='approved' or exists(select 1 from public.account_admissions where user_id=p_actor and decision='pending') then
    raise exception using errcode='PT409',message='Admissão existente'; end if;
  insert into public.account_admissions(user_id,responsible_name,responsible_contact,institutional_reference,version)
  values(p_actor,btrim(p_responsible_name),btrim(p_responsible_contact),btrim(p_institutional_reference),p_version) returning * into result;
  update public.profiles set admission_status='pending',admission_version=p_version where id=p_actor;
  return jsonb_build_object('id',result.id,'decision',result.decision,'version',result.version);
end $$;

create function public.list_account_admissions(p_admin uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.profiles where id=p_admin and role='admin') then
    raise exception using errcode='PT403',message='Admin exigido'; end if;
  return coalesce((select jsonb_agg(to_jsonb(a)) from (select * from public.account_admissions
    where decision='pending' order by created_at,id limit 100) a),'[]'::jsonb);
end $$;

create function public.review_account_admission(p_admin uuid,p_request uuid,p_decision text,p_version text,p_note text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a public.account_admissions; target uuid;
begin
  if not exists(select 1 from public.profiles where id=p_admin and role='admin') then
    raise exception using errcode='PT403',message='Admin exigido'; end if;
  -- Mesmo ordenamento de locks da solicitação: perfil antes do pedido.
  select user_id into target from public.account_admissions where id=p_request;
  perform 1 from public.profiles where id=target for update;
  select * into a from public.account_admissions where id=p_request for update;
  if not found then raise exception using errcode='PT404',message='Pedido ausente'; end if;
  if a.user_id is null or a.user_id=p_admin then raise exception using errcode='PT403',message='Revisão recusada'; end if;
  if a.decision<>'pending' then raise exception using errcode='PT409',message='Pedido já revisado'; end if;
  if p_decision is null or p_decision not in ('approved','rejected') or p_version is distinct from a.version
    or p_note is null or length(btrim(p_note)) not between 2 and 500 then
    raise exception using errcode='PT400',message='Decisão inválida'; end if;
  update public.account_admissions set decision=p_decision,note=btrim(p_note),reviewed_by=p_admin,reviewed_at=now() where id=p_request;
  update public.profiles set admission_status=p_decision,admission_version=p_version where id=a.user_id;
  return jsonb_build_object('id',p_request,'decision',p_decision,'version',p_version);
end $$;

-- Preserva materiais e turmas na eventual remoção de Auth pela API.
alter table public.learning_contents drop constraint learning_contents_teacher_id_fkey,
  alter column teacher_id drop not null,
  add foreign key(teacher_id) references public.profiles(id) on delete set null;
alter table public.classes drop constraint classes_teacher_id_fkey,
  alter column teacher_id drop not null,
  add foreign key(teacher_id) references public.profiles(id) on delete set null;
alter table public.pedagogical_recommendations drop constraint pedagogical_recommendations_teacher_id_fkey,
  alter column teacher_id drop not null,
  add foreign key(teacher_id) references public.profiles(id) on delete set null;

create function public.preview_account_retention() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('execution_enabled',false,'executor_ready',false,
    'requires_summary_before_removal',true,'expired_accounts',count(*),
    'expired_teachers',count(*) filter(where p.role='teacher'),
    'blockers',jsonb_build_array('Auth/Storage API executor unverified','summary receipt missing','shared conversation retention unverified'))
  from public.profiles p join auth.users u on u.id=p.id
  where p.role in ('student','teacher') and u.created_at+interval '168 hours'<=now()
$$;

revoke all on function public.declare_account_age(uuid,text),
 public.request_account_admission(uuid,text,text,text,text),public.list_account_admissions(uuid),
 public.review_account_admission(uuid,uuid,text,text,text),public.preview_account_retention()
 from public,anon,authenticated;
grant execute on function public.declare_account_age(uuid,text),
 public.request_account_admission(uuid,text,text,text,text),public.list_account_admissions(uuid),
 public.review_account_admission(uuid,uuid,text,text,text),public.preview_account_retention() to service_role;
commit;
