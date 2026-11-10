-- RF22: registra aceitação HTTPS separada da aceitação SMTP.
begin;

alter table public.email_deliveries
  drop constraint email_deliveries_status_check,
  drop constraint email_deliveries_error_code_check;

do $$
declare constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.email_deliveries'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%received_at%receipt_evidence%';
  if constraint_name is not null then
    execute format('alter table public.email_deliveries drop constraint %I', constraint_name);
  end if;
end;
$$;

alter table public.email_deliveries
  add constraint email_deliveries_status_check
    check (status in ('claimed','sending','smtp_accepted','provider_accepted','received','failed','unknown')),
  add constraint email_deliveries_error_code_check
    check (error_code in ('smtp_connection','smtp_rejected','recipient_refused','invalid_message','lease_expired','resend_connection','resend_rejected')),
  add column provider_accepted_at timestamptz,
  add constraint email_deliveries_receipt_check
    check (status <> 'received' or (
      received_at is not null
      and (smtp_accepted_at is not null or provider_accepted_at is not null)
      and length(btrim(receipt_evidence)) > 0
    )),
  add constraint email_deliveries_provider_accepted_check
    check (status <> 'provider_accepted' or provider_accepted_at is not null);

comment on table public.email_deliveries is
  'SMTP aceito e Resend aceito são estados distintos e não provam recebimento. unknown nunca entra em retry automático. O ledger permanente é a fonte de deduplicação.';

create or replace function public.finish_email_delivery(
  p_id uuid, p_token uuid, p_status text, p_retryable boolean, p_error_code text
) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_status is null or p_status not in ('smtp_accepted','provider_accepted','failed','unknown')
    or p_retryable is null or (p_retryable and p_status <> 'failed') then
    raise exception 'Invalid email delivery outcome';
  end if;
  update public.email_deliveries d set status = p_status, retryable = p_retryable,
    next_attempt_at = case when p_retryable then now() + interval '1 minute' * d.attempts end,
    error_code = p_error_code, updated_at = now(),
    smtp_accepted_at = case when p_status = 'smtp_accepted' then now() end,
    provider_accepted_at = case when p_status = 'provider_accepted' then now() end
  where d.id = p_id and d.claim_token = p_token and d.status = 'sending';
  return found;
end;
$$;

revoke all on function public.finish_email_delivery(uuid,uuid,text,boolean,text) from public, anon, authenticated;
grant execute on function public.finish_email_delivery(uuid,uuid,text,boolean,text) to service_role;
commit;
