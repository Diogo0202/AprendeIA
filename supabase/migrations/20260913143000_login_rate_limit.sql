-- O contador fica no schema privado e recebe somente hashes HMAC calculados no
-- backend. Nem e-mail nem IP são persistidos em texto puro.
create table private.login_rate_limits (
  key_kind text not null,
  key_hash text not null,
  failed_attempts smallint not null default 0,
  window_started_at timestamptz not null default now(),
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (key_kind, key_hash),
  constraint login_rate_limits_kind_check check (key_kind in ('identity', 'network')),
  constraint login_rate_limits_hash_check check (key_hash ~ '^[0-9a-f]{64}$'),
  constraint login_rate_limits_attempts_check check (failed_attempts >= 0)
);

create index login_rate_limits_updated_at_idx
  on private.login_rate_limits (updated_at);

alter table private.login_rate_limits enable row level security;
revoke all on table private.login_rate_limits from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert, update, delete on table private.login_rate_limits to service_role;

-- A consulta mexe somente no contador pedido. Uma limpeza geral dentro do
-- caminho de login criaria trabalho e travas desnecessárias a cada acesso.
create function public.login_rate_limit_status(
  p_key_hash text,
  p_key_kind text,
  p_window_seconds integer
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
begin
  if p_key_kind not in ('identity', 'network')
     or p_key_hash !~ '^[0-9a-f]{64}$'
     or p_window_seconds not between 60 and 86400 then
    raise exception 'Parâmetros de limite inválidos.' using errcode = '22023';
  end if;

  select limits.*
  into stored
  from private.login_rate_limits as limits
  where limits.key_kind = p_key_kind
    and limits.key_hash = p_key_hash
  for update;

  if not found then
    return query select true, 0, 0;
    return;
  end if;

  if stored.locked_until is not null and stored.locked_until > now_at then
    return query
      select false, stored.failed_attempts::integer,
             greatest(1, ceil(extract(epoch from stored.locked_until - now_at))::integer);
    return;
  end if;

  if stored.window_started_at + make_interval(secs => p_window_seconds) <= now_at then
    delete from private.login_rate_limits
    where key_kind = p_key_kind and key_hash = p_key_hash;
    return query select true, 0, 0;
    return;
  end if;

  return query select true, stored.failed_attempts::integer, 0;
end;
$$;

-- A linha é travada antes do incremento. Assim, quatro requisições paralelas
-- não conseguem ler o mesmo contador antigo e ultrapassar o limite.
create function public.record_login_failure(
  p_key_hash text,
  p_key_kind text,
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
  if p_key_kind not in ('identity', 'network')
     or p_key_hash !~ '^[0-9a-f]{64}$'
     or p_max_attempts not between 1 and 100
     or p_window_seconds not between 60 and 86400
     or p_lock_seconds not between 60 and 86400 then
    raise exception 'Parâmetros de limite inválidos.' using errcode = '22023';
  end if;

  insert into private.login_rate_limits (key_kind, key_hash, failed_attempts, window_started_at, updated_at)
  values (p_key_kind, p_key_hash, 0, now_at, now_at)
  on conflict (key_kind, key_hash) do nothing;

  select limits.*
  into stored
  from private.login_rate_limits as limits
  where limits.key_kind = p_key_kind
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

  next_attempts := least(stored.failed_attempts::integer + 1, p_max_attempts);
  next_lock := case
    when next_attempts >= p_max_attempts then now_at + make_interval(secs => p_lock_seconds)
    else null
  end;

  update private.login_rate_limits as limits
  set failed_attempts = next_attempts,
      window_started_at = stored.window_started_at,
      locked_until = next_lock,
      updated_at = now_at
  where limits.key_kind = p_key_kind
    and limits.key_hash = p_key_hash;

  return query
    select next_attempts < p_max_attempts, next_attempts,
           case when next_lock is null then 0
                else greatest(1, ceil(extract(epoch from next_lock - now_at))::integer)
           end;
end;
$$;

create function public.clear_login_failures(
  p_key_hash text,
  p_key_kind text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_key_kind not in ('identity', 'network') or p_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Parâmetros de limite inválidos.' using errcode = '22023';
  end if;

  delete from private.login_rate_limits
  where key_kind = p_key_kind and key_hash = p_key_hash;
end;
$$;

revoke all on function public.login_rate_limit_status(text, text, integer) from public, anon, authenticated;
revoke all on function public.record_login_failure(text, text, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.clear_login_failures(text, text) from public, anon, authenticated;
grant execute on function public.login_rate_limit_status(text, text, integer) to service_role;
grant execute on function public.record_login_failure(text, text, integer, integer, integer) to service_role;
grant execute on function public.clear_login_failures(text, text) to service_role;
