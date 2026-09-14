-- A tentativa da conta é reservada antes da chamada ao provedor de login. Isso
-- fecha a janela em que várias senhas simultâneas passavam pela mesma leitura.
create function public.reserve_login_attempt(
  p_key_hash text,
  p_max_attempts integer,
  p_window_seconds integer,
  p_lock_seconds integer
)
returns table (
  allowed boolean,
  failed_attempts integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  now_at timestamptz := clock_timestamp();
  stored private.login_rate_limits%rowtype;
  next_attempts integer;
  next_lock timestamptz;
begin
  if p_key_hash !~ '^[0-9a-f]{64}$'
     or p_max_attempts not between 1 and 100
     or p_window_seconds not between 60 and 86400
     or p_lock_seconds not between 60 and 86400 then
    raise exception 'Parâmetros de limite inválidos.' using errcode = '22023';
  end if;

  insert into private.login_rate_limits (key_kind, key_hash, failed_attempts, window_started_at, updated_at)
  values ('identity', p_key_hash, 0, now_at, now_at)
  on conflict (key_kind, key_hash) do nothing;

  select limits.*
  into stored
  from private.login_rate_limits as limits
  where limits.key_kind = 'identity'
    and limits.key_hash = p_key_hash
  for update;

  if stored.locked_until is not null and stored.locked_until > now_at then
    return query
      select false, stored.failed_attempts::integer,
             greatest(1, ceil(extract(epoch from stored.locked_until - now_at))::integer);
    return;
  end if;

  if stored.window_started_at + make_interval(secs => p_window_seconds) <= now_at then
    stored.failed_attempts := 0;
    stored.window_started_at := now_at;
    stored.locked_until := null;
  end if;

  next_attempts := stored.failed_attempts::integer + 1;
  next_lock := case
    when next_attempts >= p_max_attempts then now_at + make_interval(secs => p_lock_seconds)
    else null
  end;

  update private.login_rate_limits as limits
  set failed_attempts = next_attempts,
      window_started_at = stored.window_started_at,
      locked_until = next_lock,
      updated_at = now_at
  where limits.key_kind = 'identity'
    and limits.key_hash = p_key_hash;

  -- A quarta tentativa já está reservada e ainda pode testar a senha. A trava
  -- impede que uma quinta tentativa paralela chegue ao provedor.
  return query
    select true, next_attempts,
           case when next_lock is null then 0
                else greatest(1, ceil(extract(epoch from next_lock - now_at))::integer)
           end;
end;
$$;

revoke all on function public.reserve_login_attempt(text, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.reserve_login_attempt(text, integer, integer, integer)
  to service_role;
