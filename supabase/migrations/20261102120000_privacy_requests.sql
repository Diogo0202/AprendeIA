-- Pedidos do titular passam pelo backend. Nenhuma chave pública executa apagamento.
begin;

create table public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  kind text not null check (kind in ('access', 'correction', 'anonymization', 'deletion')),
  status text not null default 'pending' check (status in ('pending', 'completed', 'rejected', 'cancelled')),
  details text not null default '' check (char_length(details) <= 1000),
  corrections jsonb not null default '{}'::jsonb check (jsonb_typeof(corrections) = 'object'),
  response text not null default '' check (char_length(response) <= 1000),
  reviewed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  expires_at timestamptz not null default (now() + interval '6 days'),
  constraint privacy_request_corrections_shape check (
    (kind = 'correction' and corrections <> '{}'::jsonb)
    or ((kind <> 'correction' or user_id is null) and corrections = '{}'::jsonb)
  )
);
create unique index privacy_requests_pending_unique
  on public.privacy_requests (user_id, kind) where status = 'pending';
create index privacy_requests_owner_time_idx on public.privacy_requests (user_id, created_at desc);
create index privacy_requests_expiry_idx on public.privacy_requests (expires_at);
alter table public.privacy_requests enable row level security;
revoke all on public.privacy_requests from public, anon, authenticated;
grant select, insert on public.privacy_requests to service_role;
create policy privacy_requests_service_select on public.privacy_requests for select to service_role using (true);
create policy privacy_requests_service_insert on public.privacy_requests for insert to service_role with check (true);

-- Uma linha global contém só somas, sem UUID, disciplina, texto ou horário individual.
create table private.anonymous_learning_totals (
  singleton boolean primary key default true check (singleton),
  attempts bigint not null default 0,
  correct_answers bigint not null default 0,
  completed_lessons bigint not null default 0,
  study_seconds bigint not null default 0
);
alter table private.anonymous_learning_totals enable row level security;
revoke all on private.anonymous_learning_totals from public, anon, authenticated, service_role;

create function public.cancel_privacy_request(p_actor_id uuid, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare item public.privacy_requests;
begin
  select * into item from public.privacy_requests
  where id = p_request_id and user_id = p_actor_id and expires_at > now() for update;
  if not found then raise exception using errcode = 'PT404', message = 'Pedido indisponível'; end if;
  if item.status <> 'pending' then raise exception using errcode = 'PT409', message = 'Pedido já processado'; end if;
  update public.privacy_requests set status = 'cancelled', resolved_at = now()
  where id = item.id returning * into item;
  return to_jsonb(item);
end;
$$;

create function public.resolve_privacy_request(
  p_admin_id uuid, p_request_id uuid, p_decision text, p_response text,
  p_confirmation text default '', p_identity_hash text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  item public.privacy_requests;
  target_id uuid;
  target_role text;
  fields jsonb;
begin
  if not exists (select 1 from public.profiles where id = p_admin_id and role = 'admin') then
    raise exception using errcode = 'PT403', message = 'Revisão administrativa obrigatória';
  end if;
  if p_decision is null or p_decision not in ('complete', 'reject')
     or p_response is null or char_length(btrim(p_response)) not between 2 and 1000 then
    raise exception using errcode = 'PT400', message = 'Decisão inválida';
  end if;
  select user_id into target_id from public.privacy_requests where id = p_request_id;
  if target_id is null then raise exception using errcode = 'PT404', message = 'Pedido indisponível'; end if;
  -- Pedidos concorrentes da mesma conta seguem a mesma ordem de bloqueio.
  perform pg_advisory_xact_lock(hashtextextended(target_id::text, 0));
  select * into item from public.privacy_requests
  where id = p_request_id and expires_at > now() for update;
  if not found then raise exception using errcode = 'PT404', message = 'Pedido indisponível'; end if;
  if item.status <> 'pending' then raise exception using errcode = 'PT409', message = 'Pedido já processado'; end if;
  if target_id = p_admin_id then raise exception using errcode = 'PT403', message = 'Outro administrador deve revisar'; end if;
  select role::text into target_role from public.profiles where id = target_id for update;
  if not found then raise exception using errcode = 'PT409', message = 'Conta indisponível'; end if;

  if p_decision = 'reject' then
    update public.privacy_requests set status = 'rejected', response = btrim(p_response),
      reviewed_by = p_admin_id, resolved_at = now() where id = item.id returning * into item;
    return to_jsonb(item);
  end if;

  if item.kind = 'correction' then
    fields := item.corrections;
    if exists (select 1 from jsonb_object_keys(fields) as key
               where key not in ('full_name', 'grade', 'goal'))
       or exists (select 1 from jsonb_each(fields) as entry where jsonb_typeof(entry.value) <> 'string')
       or (fields ? 'full_name' and char_length(btrim(fields->>'full_name')) not between 2 and 120)
       or (fields ? 'grade' and char_length(fields->>'grade') > 60)
       or (fields ? 'goal' and char_length(fields->>'goal') > 500) then
      raise exception using errcode = 'PT400', message = 'Campos de correção inválidos';
    end if;
    update public.profiles set
      full_name = coalesce(btrim(fields->>'full_name'), full_name),
      grade = coalesce(fields->>'grade', grade), goal = coalesce(fields->>'goal', goal), updated_at = now()
    where id = target_id;
    -- Mantém os metadados de cadastro coerentes sem alterar cargo ou credenciais.
    update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || fields
    where id = target_id;
  elsif item.kind in ('anonymization', 'deletion') then
    if target_role = 'admin' then
      raise exception using errcode = 'PT403', message = 'Reatribua a administração antes de encerrar a conta';
    end if;
    if p_confirmation is distinct from (case when item.kind = 'deletion' then 'EXCLUIR' else 'ANONIMIZAR' end)
       or p_identity_hash is null or p_identity_hash !~ '^[a-f0-9]{64}$' then
      raise exception using errcode = 'PT400', message = 'Confirmação ou identidade inválida';
    end if;
    -- Objetos físicos exigem tratamento pela Storage API; falha antes de alterar dados.
    if to_regclass('storage.objects') is not null then
      if exists (select 1 from storage.objects as object
                 where to_jsonb(object)->>'owner_id' = target_id::text
                    or to_jsonb(object)->>'owner' = target_id::text) then
        raise exception using errcode = 'PT412', message = 'Remova os arquivos da conta pela Storage API antes de prosseguir';
      end if;
    end if;
    if item.kind = 'anonymization' then
      insert into private.anonymous_learning_totals (singleton, attempts, correct_answers, completed_lessons, study_seconds)
      select true,
        (select count(*) from public.question_attempts where student_id = target_id),
        (select count(*) from public.question_attempts where student_id = target_id and correct),
        (select count(*) from public.lesson_progress where student_id = target_id and completed),
        (select coalesce(sum(time_seconds), 0) from public.lesson_progress where student_id = target_id)
      on conflict (singleton) do update set
        attempts = private.anonymous_learning_totals.attempts + excluded.attempts,
        correct_answers = private.anonymous_learning_totals.correct_answers + excluded.correct_answers,
        completed_lessons = private.anonymous_learning_totals.completed_lessons + excluded.completed_lessons,
        study_seconds = private.anonymous_learning_totals.study_seconds + excluded.study_seconds;
    end if;

    -- O histórico de conversa pode conter o nome do titular em mensagens recebidas.
    -- Por isso o pedido informa que remove as conversas completas em que ele participa.
    delete from public.conversations where created_by = target_id or id in (
      select conversation_id from public.conversation_members where user_id = target_id
    );
    delete from public.messages where sender_id = target_id;
    delete from public.access_audit_logs where actor_id = target_id or user_id = target_id
      or resource_id = target_id or subject_hash = p_identity_hash
      or metadata->>'student_id' = target_id::text;
    delete from public.privacy_policy_acceptances where user_id = target_id;
    delete from private.api_rate_limits where actor_id = target_id;
    delete from private.login_rate_limits where key_kind = 'identity' and key_hash = p_identity_hash;
    -- O recibo conserva somente protocolo e estado até a expiração já definida.
    update public.privacy_requests set details = '', corrections = '{}'::jsonb,
      response = '', user_id = null, status = case when id = item.id then 'completed' else 'cancelled' end,
      reviewed_by = p_admin_id, resolved_at = now()
    where user_id = target_id;
    -- A FK profiles -> auth.users encerra perfil e dados acadêmicos na mesma transação.
    delete from auth.users where id = target_id;
    if not found then raise exception using errcode = 'PT409', message = 'Conta não encontrada no Auth'; end if;
    update public.privacy_requests set response = case when item.kind = 'anonymization'
      then 'Conta encerrada; somente totais globais sem identificação foram preservados.'
      else 'Conta e histórico identificável excluídos.' end
    where id = item.id returning * into item;
    return to_jsonb(item);
  end if;

  update public.privacy_requests set status = 'completed', response = btrim(p_response),
    reviewed_by = p_admin_id, resolved_at = now() where id = item.id returning * into item;
  return to_jsonb(item);
end;
$$;

revoke all on function public.cancel_privacy_request(uuid, uuid) from public, anon, authenticated;
revoke all on function public.resolve_privacy_request(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.cancel_privacy_request(uuid, uuid) to service_role;
grant execute on function public.resolve_privacy_request(uuid, uuid, text, text, text, text) to service_role;

create function public.purge_expired_privacy_requests()
returns integer language plpgsql security definer set search_path = '' as $$
declare removed integer;
begin
  delete from public.privacy_requests where expires_at <= now();
  get diagnostics removed = row_count;
  return removed;
end;
$$;
revoke all on function public.purge_expired_privacy_requests() from public, anon, authenticated;
grant execute on function public.purge_expired_privacy_requests() to service_role;
select cron.schedule('aprendeia-purge-privacy-requests', '0 * * * *', 'select public.purge_expired_privacy_requests();');

commit;
