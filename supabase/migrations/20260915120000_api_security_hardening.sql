-- Fecha caminhos diretos que permitiam contornar as validações do backend.
-- Questões, tentativas e progresso continuam acessíveis pela API do AprendeIA,
-- onde o usuário e os valores enviados são conferidos antes da gravação.
begin;

revoke select on public.questions from authenticated;
revoke insert on public.question_attempts from authenticated;
revoke insert, update on public.lesson_progress from authenticated;

-- Este contador atende operações autenticadas que podem gerar custo ou mudar
-- dados importantes. Ele fica no schema privado e só guarda o UUID do usuário,
-- a ação e a quantidade de chamadas dentro da janela.
create table private.api_rate_limits (
  actor_id uuid not null,
  action text not null,
  request_count integer not null default 0,
  window_started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (actor_id, action),
  constraint api_rate_limits_action_check check (action ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint api_rate_limits_count_check check (request_count >= 0)
);

alter table private.api_rate_limits enable row level security;
revoke all on table private.api_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table private.api_rate_limits to service_role;

create policy "api_rate_limits_service_only"
on private.api_rate_limits
for all
to service_role
using (true)
with check (true);

-- A linha é travada antes do incremento. Assim, várias requisições paralelas
-- não conseguem aproveitar o mesmo contador antigo para ultrapassar o limite.
create function public.reserve_api_request(
  p_actor_id uuid,
  p_action text,
  p_max_requests integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  request_count integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  now_at timestamptz := clock_timestamp();
  stored private.api_rate_limits%rowtype;
  next_count integer;
begin
  if p_actor_id is null
     or p_action !~ '^[a-z][a-z0-9_]{1,63}$'
     or p_max_requests not between 1 and 1000
     or p_window_seconds not between 60 and 86400 then
    raise exception 'Parâmetros de limite inválidos.' using errcode = '22023';
  end if;

  insert into private.api_rate_limits (actor_id, action, request_count, window_started_at, updated_at)
  values (p_actor_id, p_action, 0, now_at, now_at)
  on conflict (actor_id, action) do nothing;

  select limits.*
  into stored
  from private.api_rate_limits as limits
  where limits.actor_id = p_actor_id
    and limits.action = p_action
  for update;

  if stored.window_started_at + make_interval(secs => p_window_seconds) <= now_at then
    stored.request_count := 0;
    stored.window_started_at := now_at;
  end if;

  if stored.request_count >= p_max_requests then
    return query
      select false,
             stored.request_count,
             greatest(
               1,
               ceil(extract(epoch from stored.window_started_at + make_interval(secs => p_window_seconds) - now_at))::integer
             );
    return;
  end if;

  next_count := stored.request_count + 1;
  update private.api_rate_limits as limits
  set request_count = next_count,
      window_started_at = stored.window_started_at,
      updated_at = now_at
  where limits.actor_id = p_actor_id
    and limits.action = p_action;

  return query select true, next_count, 0;
end;
$$;

revoke all on function public.reserve_api_request(uuid, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_api_request(uuid, text, integer, integer)
  to service_role;

commit;
