-- Política 1.7: prazo acadêmico definido, conteúdo mínimo de e-mails e inventário de operadores.
-- Política 1.7: ciência obrigatória separada de consentimentos opcionais.
-- Preserva o contrato de termos 1.0 da migration 20261108110000.
-- Não altera expiração de contas, admissão ou a limpeza dos horários dos aceites.
begin;

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
    and policy_version_value = '1.7'
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
    raise exception 'O aceite dos Termos de Uso v1.0 e da Política de Privacidade v1.7 é necessário para criar a conta.';
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
  if target_policy_version is distinct from '1.7' then
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

-- Mantém os filtros de ciclo de conta e admissão da versão anterior.
create or replace function private.gamification_visible(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles p join auth.users u on u.id=p.id
    where p.id=p_id and p.role in ('student','teacher') and p.registration_status='active'
    and p.privacy_policy_version='1.7' and p.terms_of_use_version='1.0'
    -- A limpeza apaga o horário detalhado, mas conserva a versão aceita no perfil.
    and (p.privacy_policy_accepted_at is null or p.privacy_policy_accepted_at<=now()) and u.created_at<=now()
    and u.created_at+interval '168 hours'>now() and p.account_expires_at>now()
    and (p.age_band='adult' or (p.age_band='minor' and p.admission_status='approved' and p.admission_version='1')))
$$;
revoke all on function private.gamification_visible(uuid) from public, anon, authenticated;

commit;
