-- Auditoria de acessos do backend. A tabela não recebe corpo, token, senha,
-- query string ou IP puro; a rede é correlacionada apenas por HMAC.
begin;

create table public.access_audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role text check (actor_role is null or actor_role in ('student', 'teacher', 'admin', 'service')),
  subject_hash text check (subject_hash is null or subject_hash ~ '^[a-f0-9]{64}$'),
  action text not null check (action ~ '^[a-z][a-z0-9_.]{2,99}$'),
  request_method text not null check (request_method in ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')),
  route text not null check (route ~ '^/[a-zA-Z0-9_/{}/.-]{1,179}$'),
  status_code smallint not null check (status_code between 100 and 599),
  outcome text not null check (outcome in ('success', 'denied', 'error')),
  request_id uuid not null,
  network_hash text check (network_hash is null or network_hash ~ '^[a-f0-9]{64}$'),
  occurred_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '180 days')
);

alter table public.access_audit_logs enable row level security;
revoke all on table public.access_audit_logs from public, anon, authenticated;
grant select, insert, delete on table public.access_audit_logs to service_role;
grant usage, select on sequence public.access_audit_logs_id_seq to service_role;

create policy "access_audit_logs_service_only"
on public.access_audit_logs
for all
to service_role
using (true)
with check (true);

create index access_audit_logs_actor_time_idx
  on public.access_audit_logs (actor_id, occurred_at desc);
create index access_audit_logs_action_time_idx
  on public.access_audit_logs (action, occurred_at desc);
create index access_audit_logs_outcome_time_idx
  on public.access_audit_logs (outcome, occurred_at desc);
create index access_audit_logs_expiry_idx
  on public.access_audit_logs (expires_at);

comment on table public.access_audit_logs is
  'Eventos técnicos de acesso gerados pelo backend e retidos por até 180 dias.';

commit;
