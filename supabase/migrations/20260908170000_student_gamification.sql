-- A tabela guarda um único registro por dia para que a consistência não possa
-- ser inflada respondendo muitas questões na mesma sessão.
create table public.student_activity_days (
  student_id uuid not null references public.profiles(id) on delete cascade,
  activity_date date not null,
  last_activity_at timestamptz not null default now(),
  primary key (student_id, activity_date)
);

create index student_activity_days_student_date_idx
  on public.student_activity_days (student_id, activity_date desc);

create function private.record_student_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A plataforma é brasileira; usar São Paulo evita quebrar a sequência perto da meia-noite UTC.
  insert into public.student_activity_days (student_id, activity_date, last_activity_at)
  values (new.student_id, (now() at time zone 'America/Sao_Paulo')::date, now())
  on conflict (student_id, activity_date)
  do update set last_activity_at = excluded.last_activity_at;
  return new;
end;
$$;

revoke all on function private.record_student_activity() from public;

create trigger question_attempts_record_daily_activity
after insert on public.question_attempts
for each row execute function private.record_student_activity();

create trigger lesson_progress_record_daily_activity
after insert or update of last_accessed_at on public.lesson_progress
for each row execute function private.record_student_activity();

alter table public.student_activity_days enable row level security;
revoke all on public.student_activity_days from anon, authenticated;
grant select on public.student_activity_days to authenticated;

create policy "student_activity_days_read_own" on public.student_activity_days for select to authenticated
using (student_id = (select auth.uid()));
