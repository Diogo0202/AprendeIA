-- Guarda a reincidência separadamente das falhas da rodada atual. Assim, cada
-- novo bloqueio da mesma conta pode durar o dobro do anterior sem persistir o
-- e-mail: a chave continua sendo somente o HMAC calculado pelo backend.
alter table private.login_rate_limits
  add column if not exists lock_level smallint not null default 0;

alter table private.login_rate_limits
  drop constraint if exists login_rate_limits_lock_level_check;

alter table private.login_rate_limits
  add constraint login_rate_limits_lock_level_check
  check (lock_level between 0 and 30);

drop function if exists public.reserve_login_attempt(text, integer, integer, integer);

create function public.reserve_login_attempt(
  p_key_hash text,
  p_max_attempts integer,
  p_window_seconds integer,
  p_lock_seconds integer,
  p_max_lock_seconds integer
)
returns table (allowed boolean, failed_attempts integer, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  now_at timestamptz := clock_timestamp();
  stored private.login_rate_limits%rowtype;
  next_attempts integer;
  lock_duration_seconds integer;
  next_lock timestamptz;
  next_lock_level integer;
begin
  if p_key_hash !~ '^[0-9a-f]{64}$'
     or p_max_attempts not between 1 and 100
     or p_window_seconds not between 60 and 86400
     or p_lock_seconds not between 60 and 86400
     or p_max_lock_seconds not between p_lock_seconds and 86400 then
    raise exception 'Parâmetros de limite inválidos.' using errcode = '22023';
  end if;

  insert into private.login_rate_limits (
    key_kind, key_hash, failed_attempts, lock_level, window_started_at, updated_at
  )
  values ('identity', p_key_hash, 0, 0, now_at, now_at)
  on conflict (key_kind, key_hash) do nothing;

  select limits.* into stored
  from private.login_rate_limits as limits
  where limits.key_kind = 'identity' and limits.key_hash = p_key_hash
  for update;

  if stored.locked_until is not null and stored.locked_until > now_at then
    return query select false, stored.failed_attempts::integer,
      greatest(1, ceil(extract(epoch from stored.locked_until - now_at))::integer);
    return;
  end if;

  if stored.locked_until is not null then
    -- O bloqueio terminou: começa uma nova rodada de cinco tentativas, mas a
    -- reincidência permanece até um login correto apagar a linha.
    stored.failed_attempts := 0;
    stored.window_started_at := now_at;
    stored.locked_until := null;
  elsif stored.window_started_at + make_interval(secs => p_window_seconds) <= now_at then
    -- Falhas esparsas fora da janela não contam como uma sequência de abuso.
    stored.failed_attempts := 0;
    stored.lock_level := 0;
    stored.window_started_at := now_at;
  end if;

  next_attempts := stored.failed_attempts::integer + 1;
  next_lock := null;
  next_lock_level := stored.lock_level::integer;

  if next_attempts >= p_max_attempts then
    lock_duration_seconds := least(
      p_max_lock_seconds::numeric,
      p_lock_seconds::numeric * power(2::numeric, stored.lock_level::integer)
    )::integer;
    next_lock := now_at + make_interval(secs => lock_duration_seconds);
    next_lock_level := least(stored.lock_level::integer + 1, 30);
  end if;

  update private.login_rate_limits as limits
  set failed_attempts = next_attempts,
      lock_level = next_lock_level,
      window_started_at = stored.window_started_at,
      locked_until = next_lock,
      updated_at = now_at
  where limits.key_kind = 'identity' and limits.key_hash = p_key_hash;

  -- A quinta tentativa ainda verifica a senha. Se estiver errada, a API usa
  -- retry_after_seconds; se estiver correta, a linha inteira é apagada.
  return query select true, next_attempts,
    case when next_lock is null then 0
         else greatest(1, ceil(extract(epoch from next_lock - now_at))::integer)
    end;
end;
$$;

revoke all on function public.reserve_login_attempt(text, integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_login_attempt(text, integer, integer, integer, integer)
  to service_role;
