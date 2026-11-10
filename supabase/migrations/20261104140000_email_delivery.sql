-- RF22: ledger por professor/disciplina/tipo/período; somente backend.
begin;

create table public.email_deliveries (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  kind text not null check (kind in ('immediate', 'weekly')),
  period_start date not null,
  period_end date not null,
  status text not null check (status in ('claimed','sending','smtp_accepted','received','failed','unknown')),
  claim_token uuid not null,
  lease_until timestamptz not null,
  attempts integer not null default 1 check (attempts between 1 and 3),
  retryable boolean not null default false,
  next_attempt_at timestamptz,
  error_code text check (error_code in ('smtp_connection','smtp_rejected','recipient_refused','invalid_message','lease_expired')),
  smtp_accepted_at timestamptz,
  received_at timestamptz,
  receipt_evidence text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (teacher_id, subject_id, kind, period_start, period_end),
  check ((kind = 'immediate' and period_end = period_start + 1)
    or (kind = 'weekly' and period_end = period_start + 7 and extract(isodow from period_start) = 1)),
  check (not retryable or status = 'failed'),
  check (status <> 'smtp_accepted' or smtp_accepted_at is not null),
  check (status <> 'received' or (received_at is not null and smtp_accepted_at is not null and length(btrim(receipt_evidence)) > 0))
);
comment on table public.email_deliveries is
  'SMTP aceito não prova recebimento. unknown nunca entra em retry automático. Sem corpo ou endereço no ledger.';
alter table public.email_deliveries enable row level security;
revoke all on public.email_deliveries from public, anon, authenticated;
grant select, insert, update, delete on public.email_deliveries to service_role;
-- A barreira RF07 só cobriu tabelas que já existiam; tabelas novas repetem as
-- quatro restritivas para manter a invariante, mesmo sem grant ao cliente.
create policy rf07_select on public.email_deliveries as restrictive for select to authenticated using (private.lifecycle_access());
create policy rf07_insert on public.email_deliveries as restrictive for insert to authenticated with check (private.lifecycle_access());
create policy rf07_update on public.email_deliveries as restrictive for update to authenticated using (private.lifecycle_access()) with check (private.lifecycle_access());
create policy rf07_delete on public.email_deliveries as restrictive for delete to authenticated using (private.lifecycle_access());

create function public.claim_email_delivery(
  p_teacher_id uuid, p_subject_id uuid, p_kind text,
  p_period_start date, p_period_end date
) returns table (id uuid, status text, claimed boolean, claim_token uuid, recipient text)
language plpgsql security definer set search_path = '' as $$
declare
  row_value public.email_deliveries%rowtype;
  recipient_value text;
  eligible boolean;
  token_value uuid := gen_random_uuid();
begin
  if p_kind not in ('immediate','weekly') or p_kind is null
     or p_period_start is null or p_period_end is null
     or (p_kind = 'immediate' and p_period_end <> p_period_start + 1)
     or (p_kind = 'weekly' and (p_period_end <> p_period_start + 7 or extract(isodow from p_period_start) <> 1)) then
    raise exception 'Invalid delivery period';
  end if;
  select p.email,
    p.role = 'teacher' and p.registration_status = 'active'
    and case when p_kind = 'weekly' then p.email_weekly_summary else p.email_difficulty_alerts end
    and exists (select 1 from public.teacher_subjects ts where ts.teacher_id = p_teacher_id and ts.subject_id = p_subject_id)
  into recipient_value, eligible from public.profiles p where p.id = p_teacher_id;

  if coalesce(eligible, false) then
    insert into public.email_deliveries as d
      (teacher_id,subject_id,kind,period_start,period_end,status,claim_token,lease_until)
    values (p_teacher_id,p_subject_id,p_kind,p_period_start,p_period_end,'claimed',token_value,now() + interval '5 minutes')
    on conflict (teacher_id,subject_id,kind,period_start,period_end) do nothing;
  end if;

  select d.* into row_value from public.email_deliveries d
  where d.teacher_id = p_teacher_id and d.subject_id = p_subject_id and d.kind = p_kind
    and d.period_start = p_period_start and d.period_end = p_period_end for update;
  if not found then return; end if;

  if row_value.status = 'sending' and row_value.lease_until <= now() then
    update public.email_deliveries d set status = 'unknown', retryable = false,
      error_code = 'lease_expired', updated_at = now() where d.id = row_value.id returning d.* into row_value;
  end if;
  if row_value.claim_token = token_value then
    return query select row_value.id, row_value.status, true, token_value, recipient_value;
    return;
  end if;
  if coalesce(eligible,false) and row_value.attempts < 3 and (
    (row_value.status = 'claimed' and row_value.lease_until <= now()) or
    (row_value.status = 'failed' and row_value.retryable and row_value.next_attempt_at <= now())
  ) then
    update public.email_deliveries d set status = 'claimed', claim_token = token_value,
      lease_until = now() + interval '5 minutes', attempts = d.attempts + 1,
      retryable = false, next_attempt_at = null, error_code = null, updated_at = now()
    where d.id = row_value.id returning d.* into row_value;
    return query select row_value.id, row_value.status, true, token_value, recipient_value;
  else
    if row_value.status = 'claimed' and row_value.lease_until <= now() and row_value.attempts = 3 then
      update public.email_deliveries d set status = 'failed', error_code = 'lease_expired', updated_at = now()
      where d.id = row_value.id returning d.* into row_value;
    end if;
    return query select row_value.id, row_value.status, false, null::uuid, null::text;
  end if;
end;
$$;

create function public.begin_email_delivery(p_id uuid, p_token uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.email_deliveries d set status = 'sending', lease_until = now() + interval '5 minutes', updated_at = now()
  where d.id = p_id and d.claim_token = p_token and d.status = 'claimed' and d.lease_until > now()
    and exists (select 1 from public.profiles p join public.teacher_subjects ts on ts.teacher_id = p.id
      where p.id = d.teacher_id and ts.subject_id = d.subject_id and p.role = 'teacher'
      and p.registration_status = 'active'
      and case when d.kind = 'weekly' then p.email_weekly_summary else p.email_difficulty_alerts end);
  return found;
end;
$$;

create function public.finish_email_delivery(
  p_id uuid, p_token uuid, p_status text, p_retryable boolean, p_error_code text
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_status is null or p_status not in ('smtp_accepted','failed','unknown')
    or p_retryable is null or (p_retryable and p_status <> 'failed') then
    raise exception 'Invalid SMTP outcome';
  end if;
  update public.email_deliveries d set status = p_status, retryable = p_retryable,
    next_attempt_at = case when p_retryable then now() + interval '1 minute' * d.attempts end,
    error_code = p_error_code, updated_at = now(),
    smtp_accepted_at = case when p_status = 'smtp_accepted' then now() end
  where d.id = p_id and d.claim_token = p_token and d.status = 'sending';
  return found;
end;
$$;

create function public.weekly_email_targets(p_period_start date, p_period_end date, p_after_subject uuid default null)
returns table (teacher_id uuid, subject_id uuid)
language sql stable security definer set search_path = '' as $$
  select targets.teacher_id, targets.subject_id from (
    select ts.teacher_id, ts.subject_id from public.teacher_subjects ts
    where exists (select 1 from public.difficulty_alerts a
      where a.teacher_id = ts.teacher_id and a.subject_id = ts.subject_id and a.status = 'active'
      and a.updated_at >= (p_period_start::timestamp at time zone 'America/Sao_Paulo')
      and a.updated_at < (p_period_end::timestamp at time zone 'America/Sao_Paulo'))
    union
    select d.teacher_id, d.subject_id from public.email_deliveries d
    where d.kind = 'weekly' and d.period_start = p_period_start and d.period_end = p_period_end
  ) targets
  where p_after_subject is null or targets.subject_id > p_after_subject
  order by targets.subject_id limit 500;
$$;

revoke all on function public.claim_email_delivery(uuid,uuid,text,date,date) from public, anon, authenticated;
revoke all on function public.begin_email_delivery(uuid,uuid) from public, anon, authenticated;
revoke all on function public.finish_email_delivery(uuid,uuid,text,boolean,text) from public, anon, authenticated;
revoke all on function public.weekly_email_targets(date,date,uuid) from public, anon, authenticated;
grant execute on function public.claim_email_delivery(uuid,uuid,text,date,date) to service_role;
grant execute on function public.begin_email_delivery(uuid,uuid) to service_role;
grant execute on function public.finish_email_delivery(uuid,uuid,text,boolean,text) to service_role;
grant execute on function public.weekly_email_targets(date,date,uuid) to service_role;
commit;
