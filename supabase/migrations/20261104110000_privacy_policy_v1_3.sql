-- A versão 1.3 descreve os pedidos do titular (RF-08). Contas que aceitaram a 1.2
-- continuam existindo, mas a API pede novo aceite antes de liberar as demais rotas.
begin;

-- Contas novas só aceitam a versão exibida no formulário de cadastro.
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
  admin_provisioned boolean := coalesce(new.raw_app_meta_data ->> 'account_origin' = 'admin_provisioned', false);
  is_teacher_request boolean := (
    new.raw_user_meta_data ->> 'requested_role' = 'teacher'
    and char_length(requested_subject_value) between 2 and 60
    and requested_subject_value !~ '[[:cntrl:]{}<>]'
  );
  created_profile_role text := 'student';
  audit_id bigint;
begin
  if not admin_provisioned and (not consented or policy_version_value <> '1.3') then
    raise exception 'O aceite da Política de Privacidade v1.3 é necessário para criar a conta.';
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
    case when consented and policy_version_value = '1.3' then policy_version_value else null end,
    case when consented and policy_version_value = '1.3' then now() else null end
  );

  if consented and policy_version_value = '1.3' then
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

-- O aceite de contas antigas e provisionadas continua transacional e versionado.
create or replace function public.record_privacy_policy_acceptance(
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
  if target_policy_version <> '1.3' then
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

commit;
