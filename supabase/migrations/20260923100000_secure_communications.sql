-- Conversas privadas e assistente educacional. O navegador não acessa estas
-- tabelas diretamente; toda autorização passa pelo backend com usuário validado.
begin;

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('direct', 'ai')),
  thread_key text not null unique check (
    (kind = 'direct' and thread_key like 'direct:%')
    or (kind = 'ai' and thread_key like 'ai:%')
  ),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  sender_kind text not null check (sender_kind in ('user', 'assistant')),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  constraint messages_sender_shape check (
    (sender_kind = 'user' and sender_id is not null)
    or (sender_kind = 'assistant' and sender_id is null)
  )
);

create index conversation_members_user_idx
  on public.conversation_members (user_id, joined_at desc);
create index conversations_last_message_idx
  on public.conversations (last_message_at desc);
create index messages_conversation_time_idx
  on public.messages (conversation_id, created_at asc);

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

revoke all on table public.conversations, public.conversation_members, public.messages
  from public, anon, authenticated;
grant select, insert, update on table public.conversations to service_role;
grant select, insert on table public.conversation_members, public.messages to service_role;

create policy "conversations_service_select" on public.conversations
  for select to service_role using (true);
create policy "conversations_service_insert" on public.conversations
  for insert to service_role with check (true);
create policy "conversations_service_update" on public.conversations
  for update to service_role using (true) with check (true);
create policy "conversation_members_service_select" on public.conversation_members
  for select to service_role using (true);
create policy "conversation_members_service_insert" on public.conversation_members
  for insert to service_role with check (true);
create policy "messages_service_select" on public.messages
  for select to service_role using (true);
create policy "messages_service_insert" on public.messages
  for insert to service_role with check (true);

-- A criação da conversa direta é atômica e repete no banco a matriz de cargos.
create function public.get_or_create_direct_conversation(
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
  student_id uuid;
  teacher_id uuid;
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
    or (actor_role = 'teacher' and recipient_role in ('student', 'teacher'))
  ) then
    raise exception 'Combinação de participantes não permitida.' using errcode = '42501';
  end if;

  if actor_role <> recipient_role then
    student_id := case when actor_role = 'student' then p_actor_id else p_recipient_id end;
    teacher_id := case when actor_role = 'teacher' then p_actor_id else p_recipient_id end;
    if not exists (
      select 1
      from public.teacher_subjects
      join public.enrollments
        on enrollments.subject_id = teacher_subjects.subject_id
      where teacher_subjects.teacher_id = teacher_id
        and enrollments.student_id = student_id
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

create function public.get_or_create_ai_conversation(p_actor_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.app_role;
  actor_active boolean;
  conversation_id uuid;
begin
  select role, registration_status = 'active'
  into actor_role, actor_active
  from public.profiles where id = p_actor_id;
  if actor_role not in ('student', 'teacher') or not actor_active then
    raise exception 'Assistente indisponível para este perfil.' using errcode = '42501';
  end if;

  insert into public.conversations (kind, thread_key, created_by)
  values ('ai', 'ai:' || p_actor_id::text, p_actor_id)
  on conflict (thread_key) do update set thread_key = excluded.thread_key
  returning id into conversation_id;
  insert into public.conversation_members (conversation_id, user_id)
  values (conversation_id, p_actor_id)
  on conflict do nothing;
  return conversation_id;
end;
$$;

revoke all on function public.get_or_create_direct_conversation(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.get_or_create_ai_conversation(uuid)
  from public, anon, authenticated;
grant execute on function public.get_or_create_direct_conversation(uuid, uuid) to service_role;
grant execute on function public.get_or_create_ai_conversation(uuid) to service_role;

-- O service_role deixa de apagar a auditoria diretamente. A limpeza vencida
-- passa por uma função restrita que não aceita data escolhida pelo chamador.
revoke update, delete on table public.access_audit_logs from service_role;
drop policy if exists "access_audit_logs_service_only" on public.access_audit_logs;
create policy "access_audit_logs_service_select" on public.access_audit_logs
  for select to service_role using (true);
create policy "access_audit_logs_service_insert" on public.access_audit_logs
  for insert to service_role with check (true);
create index if not exists access_audit_logs_request_id_idx
  on public.access_audit_logs (request_id);

create function public.purge_expired_access_audit_logs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from public.access_audit_logs where expires_at <= now();
  get diagnostics removed = row_count;
  return removed;
end;
$$;
revoke all on function public.purge_expired_access_audit_logs()
  from public, anon, authenticated;
grant execute on function public.purge_expired_access_audit_logs() to service_role;

commit;
