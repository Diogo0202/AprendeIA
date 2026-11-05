-- Os Termos de Uso 1.0 passam a ter aceite obrigatório junto com a Política de
-- Privacidade 1.5. O cadastro exige os dois aceites; contas que só aceitaram a
-- política precisam aceitar os termos antes de liberar as demais rotas.
begin;

-- O navegador não altera estas colunas: authenticated só atualiza full_name, grade e goal.
alter table public.profiles
  add column if not exists terms_of_use_version text
    check (terms_of_use_version is null or terms_of_use_version ~ '^[0-9]+\.[0-9]+$'),
  add column if not exists terms_of_use_accepted_at timestamptz;

alter table public.privacy_policy_acceptances
  add column if not exists terms_version text
    check (terms_version is null or terms_version ~ '^[0-9]+\.[0-9]+$');

-- Quem aceitou a 1.5 sem os termos precisa de um novo registro com a mesma versão da política.
drop index if exists public.privacy_policy_acceptances_user_version_uidx;
create unique index privacy_policy_acceptances_user_version_uidx
  on public.privacy_policy_acceptances (user_id, policy_version, coalesce(terms_version, ''))
  where user_id is not null;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_subject_value text := btrim(coalesce(new.raw_user_meta_data ->> 'requested_subject', ''));
  policy_version_value text := coalesce(new.raw_user_meta_data ->> 'privacy_policy_version', '');
  terms_version_value text := coalesce(new.raw_user_meta_data ->> 'terms_of_use_version', '');
  consented boolean := (
    coalesce(new.raw_user_meta_data ->> 'privacy_policy_accepted' = 'true', false)
    and policy_version_value = '1.5'
    and coalesce(new.raw_user_meta_data ->> 'terms_of_use_accepted' = 'true', false)
    and terms_version_value = '1.0'
  );
  admin_provisioned boolean := coalesce(new.raw_app_meta_data ->> 'account_origin' = 'admin_provisioned', false);
  is_teacher_request boolean := (
    new.raw_user_meta_data ->> 'requested_role' = 'teacher'
    and char_length(requested_subject_value) between 2 and 60
    and requested_subject_value !~ '[[:cntrl:]{}<>]'
  );
  created_profile_role text := 'student';
  audit_id bigint;
begin
  if not admin_provisioned and not consented then
    raise exception 'O aceite dos Termos de Uso v1.0 e da Política de Privacidade v1.5 é necessário para criar a conta.';
  end if;

  insert into public.profiles (
    id, email, full_name, role, grade, requested_role, requested_subject, registration_status,
    privacy_policy_version, privacy_policy_accepted_at, terms_of_use_version, terms_of_use_accepted_at
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
    case when consented then policy_version_value else null end,
    case when consented then now() else null end,
    case when consented then terms_version_value else null end,
    case when consented then now() else null end
  );

  if consented then
    insert into public.access_audit_logs (
      actor_id, actor_role, action, request_method, route, status_code, outcome,
      request_id, user_id, role, resource, resource_id, metadata
    )
    values (
      new.id, created_profile_role, 'CREATE_USER', 'POST', '/auth/signup', 201, 'success',
      gen_random_uuid(), new.id, created_profile_role, 'profiles', new.id,
      jsonb_build_object(
        'privacy_policy_accepted', true,
        'policy_version', policy_version_value,
        'terms_version', terms_version_value
      )
    )
    returning id into audit_id;

    insert into public.privacy_policy_acceptances (user_id, policy_version, terms_version, audit_log_id)
    values (new.id, policy_version_value, terms_version_value, audit_id);
  end if;

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public;

-- A versão de 2 argumentos deixa de existir: todo aceite informa também os termos.
drop function if exists public.record_privacy_policy_acceptance(uuid, text);

create or replace function public.record_privacy_policy_acceptance(
  target_user_id uuid,
  target_policy_version text,
  target_terms_version text
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
  if target_policy_version is distinct from '1.5' then
    raise exception 'Versão da política inválida.';
  end if;
  if target_terms_version is distinct from '1.0' then
    raise exception 'Versão dos Termos de Uso inválida.';
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
    and acceptances.terms_version = target_terms_version
  order by acceptances.accepted_at desc
  limit 1;
  if accepted_time is not null then
    return accepted_time;
  end if;

  accepted_time := now();
  update public.profiles
  set privacy_policy_version = target_policy_version,
      privacy_policy_accepted_at = accepted_time,
      terms_of_use_version = target_terms_version,
      terms_of_use_accepted_at = accepted_time
  where profiles.id = target_user_id;

  insert into public.access_audit_logs (
    actor_id, actor_role, action, request_method, route, status_code, outcome,
    request_id, user_id, role, resource, resource_id, created_at, metadata
  )
  values (
    target_user_id, profile_role, 'PRIVACY_POLICY_ACCEPTED', 'POST', '/privacy/accept',
    201, 'success', gen_random_uuid(), target_user_id, profile_role, 'profiles',
    target_user_id, accepted_time,
    jsonb_build_object(
      'privacy_policy_accepted', true,
      'policy_version', target_policy_version,
      'terms_version', target_terms_version
    )
  )
  returning id into audit_id;

  insert into public.privacy_policy_acceptances (
    user_id, policy_version, terms_version, accepted_at, audit_log_id
  )
  values (target_user_id, target_policy_version, target_terms_version, accepted_time, audit_id);

  return accepted_time;
end;
$$;

revoke all on function public.record_privacy_policy_acceptance(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.record_privacy_policy_acceptance(uuid, text, text)
  to service_role;

-- O horário detalhado do aceite dos termos segue o mesmo prazo do aceite da política.
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

  update public.profiles
  set terms_of_use_accepted_at = null
  where terms_of_use_accepted_at <= now() - interval '6 days';

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

commit;
