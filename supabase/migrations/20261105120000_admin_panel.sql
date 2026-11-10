-- Painel administrativo: exclusão de contas pela administração e conversa
-- entre administração e professores. Tudo passa pela API com service_role.
begin;

alter table public.access_audit_logs
  drop constraint if exists access_audit_logs_action_check,
  add constraint access_audit_logs_action_check check (
    action ~ '^[a-z][a-z0-9_.]{2,99}$'
    or action in (
      'LOGIN_SUCCESS', 'LOGIN_FAILED', 'CREATE_USER', 'APPROVE_TEACHER',
      'CREATE_CLASS', 'ADD_STUDENT_TO_CLASS', 'GENERATE_QUESTION',
      'ANSWER_QUESTION', 'EXPORT_REPORT', 'UPDATE_PROFILE',
      'SEND_WEEKLY_SUMMARY', 'PRIVACY_POLICY_ACCEPTED',
      'UPDATE_NOTIFICATION_PREFERENCES', 'DELETE_USER'
    )
  );

-- Mesma função de antes, com o par administração <-> professor. Aluno e
-- administração continuam sem conversa direta; o vínculo pedagógico só é
-- exigido entre aluno e professor.
create or replace function public.get_or_create_direct_conversation(
  p_actor_id uuid,
  p_recipient_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.app_role;
  recipient_role public.app_role;
  actor_active boolean;
  recipient_active boolean;
  -- Prefixo v_: sem ele, teacher_id/student_id ficavam ambíguos com as colunas
  -- de teacher_subjects/enrollments e toda conversa aluno-professor falhava (42702).
  v_student_id uuid;
  v_teacher_id uuid;
  conversation_id uuid;
  stable_key text;
begin
  if p_actor_id is null or p_recipient_id is null or p_actor_id = p_recipient_id then
    raise exception 'Participantes inválidos.' using errcode = '22023';
  end if;

  select role, registration_status = 'active'
  into actor_role, actor_active
  from public.profiles where id = p_actor_id;
  select role, registration_status = 'active'
  into recipient_role, recipient_active
  from public.profiles where id = p_recipient_id;

  if actor_role is null or recipient_role is null or not actor_active or not recipient_active then
    raise exception 'Participante indisponível.' using errcode = '42501';
  end if;
  if not (
    (actor_role = 'student' and recipient_role = 'teacher')
    or (actor_role = 'teacher' and recipient_role in ('student', 'teacher', 'admin'))
    or (actor_role = 'admin' and recipient_role = 'teacher')
  ) then
    raise exception 'Combinação de participantes não permitida.' using errcode = '42501';
  end if;

  if 'student' in (actor_role, recipient_role) then
    v_student_id := case when actor_role = 'student' then p_actor_id else p_recipient_id end;
    v_teacher_id := case when actor_role = 'teacher' then p_actor_id else p_recipient_id end;
    if not exists (
      select 1
      from public.teacher_subjects
      join public.enrollments
        on enrollments.subject_id = teacher_subjects.subject_id
      where teacher_subjects.teacher_id = v_teacher_id
        and enrollments.student_id = v_student_id
    ) then
      raise exception 'Não existe vínculo pedagógico entre os participantes.' using errcode = '42501';
    end if;
  end if;

  stable_key := 'direct:' || least(p_actor_id::text, p_recipient_id::text)
    || ':' || greatest(p_actor_id::text, p_recipient_id::text);
  insert into public.conversations (kind, thread_key, created_by)
  values ('direct', stable_key, p_actor_id)
  on conflict (thread_key) do update set thread_key = excluded.thread_key
  returning id into conversation_id;

  insert into public.conversation_members (conversation_id, user_id)
  values (conversation_id, p_actor_id), (conversation_id, p_recipient_id)
  on conflict do nothing;
  return conversation_id;
end;
$$;

revoke all on function public.get_or_create_direct_conversation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_or_create_direct_conversation(uuid, uuid) to service_role;

-- Exclusão iniciada pela administração. Repete a limpeza do pedido de exclusão
-- do titular (RF-08): conversas, mensagens, auditoria, aceites, limites e
-- pedidos; a FK encerra perfil e dados acadêmicos. Progresso de outros alunos
-- permanece. Administradores não podem ser excluídos por este caminho.
create function public.admin_delete_account(
  p_admin_id uuid, p_target_id uuid, p_confirmation text, p_reason text, p_identity_hash text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target_role text;
begin
  if not exists (select 1 from public.profiles where id = p_admin_id and role = 'admin'
                 and registration_status = 'active') then
    raise exception using errcode = 'PT403', message = 'Somente a administração pode excluir contas';
  end if;
  if p_target_id is null or p_target_id = p_admin_id then
    raise exception using errcode = 'PT403', message = 'A administração não exclui a própria conta';
  end if;
  if p_confirmation is distinct from 'EXCLUIR'
     or p_reason is null or char_length(btrim(p_reason)) not between 5 and 300
     or p_identity_hash is null or p_identity_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = 'PT400', message = 'Confirmação, motivo ou identidade inválidos';
  end if;
  -- Mesma ordem de bloqueio do pedido do titular, para não concorrer com ele.
  perform pg_advisory_xact_lock(hashtextextended(p_target_id::text, 0));
  select role::text into target_role from public.profiles where id = p_target_id for update;
  if not found then raise exception using errcode = 'PT404', message = 'Conta não encontrada'; end if;
  if target_role = 'admin' then
    raise exception using errcode = 'PT403', message = 'Contas administrativas não são excluídas pelo painel';
  end if;
  if to_regclass('storage.objects') is not null then
    if exists (select 1 from storage.objects as object
               where to_jsonb(object)->>'owner_id' = p_target_id::text
                  or to_jsonb(object)->>'owner' = p_target_id::text) then
      raise exception using errcode = 'PT412', message = 'Remova os arquivos da conta pela Storage API antes de prosseguir';
    end if;
  end if;

  delete from public.conversations where created_by = p_target_id or id in (
    select conversation_id from public.conversation_members where user_id = p_target_id
  );
  delete from public.messages where sender_id = p_target_id;
  delete from public.access_audit_logs where actor_id = p_target_id or user_id = p_target_id
    or resource_id = p_target_id or subject_hash = p_identity_hash
    or metadata->>'student_id' = p_target_id::text;
  delete from public.privacy_policy_acceptances where user_id = p_target_id;
  delete from private.api_rate_limits where actor_id = p_target_id;
  delete from private.login_rate_limits where key_kind = 'identity' and key_hash = p_identity_hash;
  update public.privacy_requests set details = '', corrections = '{}'::jsonb,
    response = '', user_id = null, status = 'cancelled', reviewed_by = p_admin_id, resolved_at = now()
  where user_id = p_target_id;
  delete from auth.users where id = p_target_id;
  if not found then raise exception using errcode = 'PT409', message = 'Conta não encontrada no Auth'; end if;
  return jsonb_build_object('deleted_role', target_role);
end;
$$;

revoke all on function public.admin_delete_account(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.admin_delete_account(uuid, uuid, text, text, text) to service_role;

commit;
