begin;

alter table public.profiles
  add column privacy_policy_version text,
  add column privacy_policy_accepted_at timestamptz;

-- Mantemos as colunas antigas por compatibilidade com relatórios já existentes.
alter table public.access_audit_logs
  add column user_id uuid references public.profiles(id) on delete set null,
  add column role text check (role is null or role in ('student', 'teacher', 'admin', 'service')),
  add column resource text,
  add column resource_id uuid,
  add column ip_hash text check (ip_hash is null or ip_hash ~ '^[a-f0-9]{64}$'),
  add column created_at timestamptz not null default now(),
  add column metadata jsonb not null default '{}'::jsonb;

update public.access_audit_logs
set user_id = actor_id,
    role = actor_role,
    resource = route,
    ip_hash = network_hash,
    created_at = occurred_at
where user_id is null or role is null or resource is null or ip_hash is null;

-- Reduz o prazo também para eventos anteriores, sem estendê-los além do novo limite.
alter table public.access_audit_logs
  alter column expires_at set default (now() + interval '6 days');
update public.access_audit_logs
set expires_at = least(expires_at, created_at + interval '6 days');

alter table public.access_audit_logs
  alter column resource set not null;

alter table public.access_audit_logs
  drop constraint if exists access_audit_logs_action_check,
  add constraint access_audit_logs_action_check check (
    action ~ '^[a-z][a-z0-9_.]{2,99}$'
    or action in (
      'LOGIN_SUCCESS', 'LOGIN_FAILED', 'CREATE_USER', 'APPROVE_TEACHER',
      'CREATE_CLASS', 'ADD_STUDENT_TO_CLASS', 'GENERATE_QUESTION',
      'ANSWER_QUESTION', 'EXPORT_REPORT', 'PRIVACY_POLICY_ACCEPTED'
    )
  );

create index access_audit_logs_user_time_idx
  on public.access_audit_logs (user_id, created_at desc);
create index access_audit_logs_resource_idx
  on public.access_audit_logs (resource, resource_id, created_at desc);

-- Esta tabela guarda a evidência legal sem expor leitura ou escrita ao navegador.
create table public.privacy_policy_acceptances (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  policy_version text not null check (policy_version ~ '^[0-9]+\.[0-9]+$'),
  accepted_at timestamptz not null default now(),
  audit_log_id bigint references public.access_audit_logs(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '6 days')
);

alter table public.privacy_policy_acceptances enable row level security;
revoke all on table public.privacy_policy_acceptances from public, anon, authenticated;
grant select, insert on table public.privacy_policy_acceptances to service_role;
grant usage, select on sequence public.privacy_policy_acceptances_id_seq to service_role;
create policy privacy_policy_acceptances_service_select
  on public.privacy_policy_acceptances for select to service_role using (true);
create policy privacy_policy_acceptances_service_insert
  on public.privacy_policy_acceptances for insert to service_role with check (true);
revoke update, delete on table public.privacy_policy_acceptances from service_role;

create index privacy_policy_acceptances_user_time_idx
  on public.privacy_policy_acceptances (user_id, accepted_at desc);
create index privacy_policy_acceptances_expiry_idx
  on public.privacy_policy_acceptances (expires_at);
create unique index privacy_policy_acceptances_user_version_uidx
  on public.privacy_policy_acceptances (user_id, policy_version)
  where user_id is not null;

-- A função só cria perfil após aceitar a versão apresentada no cadastro público.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_subject_value text := btrim(coalesce(new.raw_user_meta_data ->> 'requested_subject', ''));
  policy_version_value text := coalesce(new.raw_user_meta_data ->> 'privacy_policy_version', '');
  consented boolean := coalesce(new.raw_user_meta_data ->> 'privacy_policy_accepted' = 'true', false);
  -- app_metadata só pode ser definido por credenciais administrativas do servidor.
  admin_provisioned boolean := coalesce(new.raw_app_meta_data ->> 'account_origin' = 'admin_provisioned', false);
  is_teacher_request boolean := (
    new.raw_user_meta_data ->> 'requested_role' = 'teacher'
    and char_length(requested_subject_value) between 2 and 60
    and requested_subject_value !~ '[[:cntrl:]{}<>]'
  );
  created_profile_role text := 'student';
  audit_id bigint;
begin
  if not admin_provisioned and (not consented or policy_version_value <> '1.0') then
    raise exception 'O aceite da Política de Privacidade v1.0 é necessário para criar a conta.';
  end if;

  insert into public.profiles (
    id, email, full_name, role, grade, requested_role, requested_subject, registration_status,
    privacy_policy_version, privacy_policy_accepted_at
  )
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, 'Estudante'), '@', 1)),
    'student',
    coalesce(new.raw_user_meta_data ->> 'grade', ''),
    case when is_teacher_request then 'teacher'::public.app_role else null end,
    case when is_teacher_request then requested_subject_value else null end,
    case when is_teacher_request then 'pending_teacher' else 'active' end,
    case when consented and policy_version_value = '1.0' then policy_version_value else null end,
    case when consented and policy_version_value = '1.0' then now() else null end
  );

  if consented and policy_version_value = '1.0' then
    insert into public.access_audit_logs (
      actor_id, actor_role, action, request_method, route, status_code, outcome,
      request_id, user_id, role, resource, resource_id, metadata
    )
    values (
      new.id, created_profile_role, 'CREATE_USER', 'POST', '/auth/signup', 201, 'success',
      gen_random_uuid(), new.id, created_profile_role, 'profiles', new.id,
      jsonb_build_object(
        'privacy_policy_accepted', true,
        'policy_version', policy_version_value
      )
    )
    returning id into audit_id;

    insert into public.privacy_policy_acceptances (user_id, policy_version, audit_log_id)
    values (new.id, policy_version_value, audit_id);
  end if;

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public;

-- O aceite de contas antigas/administrativas e sua evidência ficam na mesma transação.
create function public.record_privacy_policy_acceptance(
  target_user_id uuid,
  target_policy_version text
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  accepted_time timestamptz;
  profile_role text;
  audit_id bigint;
begin
  if target_policy_version <> '1.0' then
    raise exception 'Versão da política inválida.';
  end if;

  select profiles.role::text into profile_role
  from public.profiles
  where profiles.id = target_user_id
  for update;
  if profile_role is null then
    raise exception 'Perfil não encontrado.';
  end if;

  select acceptances.accepted_at into accepted_time
  from public.privacy_policy_acceptances as acceptances
  where acceptances.user_id = target_user_id
    and acceptances.policy_version = target_policy_version
  order by acceptances.accepted_at desc
  limit 1;
  if accepted_time is not null then
    return accepted_time;
  end if;

  accepted_time := now();
  update public.profiles
  set privacy_policy_version = target_policy_version,
      privacy_policy_accepted_at = accepted_time
  where profiles.id = target_user_id;

  insert into public.access_audit_logs (
    actor_id, actor_role, action, request_method, route, status_code, outcome,
    request_id, user_id, role, resource, resource_id, created_at, metadata
  )
  values (
    target_user_id, profile_role, 'PRIVACY_POLICY_ACCEPTED', 'POST', '/privacy/accept',
    201, 'success', gen_random_uuid(), target_user_id, profile_role, 'profiles',
    target_user_id, accepted_time,
    jsonb_build_object('privacy_policy_accepted', true, 'policy_version', target_policy_version)
  )
  returning id into audit_id;

  insert into public.privacy_policy_acceptances (user_id, policy_version, accepted_at, audit_log_id)
  values (target_user_id, target_policy_version, accepted_time, audit_id);

  return accepted_time;
end;
$$;

revoke all on function public.record_privacy_policy_acceptance(uuid, text)
  from public, anon, authenticated;
grant execute on function public.record_privacy_policy_acceptance(uuid, text)
  to service_role;

-- A limpeza recorrente impede que eventos vencidos fiquem armazenados sem prazo.
create or replace function public.purge_expired_access_audit_logs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed_logs integer;
  removed_acceptances integer;
begin
  update public.profiles
  set privacy_policy_accepted_at = null
  where privacy_policy_accepted_at <= now() - interval '6 days';

  delete from public.privacy_policy_acceptances
  where expires_at <= now();
  get diagnostics removed_acceptances = row_count;

  delete from public.access_audit_logs
  where expires_at <= now();
  get diagnostics removed_logs = row_count;

  return removed_logs + removed_acceptances;
end;
$$;
revoke all on function public.purge_expired_access_audit_logs()
  from public, anon, authenticated;
grant execute on function public.purge_expired_access_audit_logs()
  to service_role;

-- Supabase Cron executa a limpeza de hora em hora; expires_at continua sendo o limite.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
select cron.schedule(
  'aprendeia-purge-expired-access-logs',
  '0 * * * *',
  'select public.purge_expired_access_audit_logs();'
);

-- Apaga agora qualquer linha legada que já ultrapassou uma semana.
select public.purge_expired_access_audit_logs();

commit;
