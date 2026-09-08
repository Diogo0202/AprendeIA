-- Alertas por disciplina: cada docente deste MVP acompanha uma disciplina.
-- A restrição dos dois lados evita que um vínculo novo abra uma matéria sem revisão.
create type public.difficulty_alert_status as enum ('active', 'resolved');
create type public.weekly_summary_status as enum ('processing', 'sent', 'failed');

create table public.teacher_subjects (
  teacher_id uuid not null unique references public.profiles(id) on delete cascade,
  subject_id uuid primary key references public.subjects(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.difficulty_alerts (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  topic text not null check (char_length(topic) between 1 and 100),
  accuracy numeric(5,2) not null check (accuracy between 0 and 100),
  attempts integer not null check (attempts >= 0),
  status public.difficulty_alert_status not null default 'active',
  opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  immediate_email_sent_at timestamptz,
  unique (student_id, subject_id, topic)
);

create index difficulty_alerts_teacher_status_idx
  on public.difficulty_alerts (teacher_id, status, updated_at desc);

-- Uma semana só pode ter um resumo concluído. O job usa esta tabela como trava simples.
create table public.weekly_summary_runs (
  week_start date primary key,
  status public.weekly_summary_status not null default 'processing',
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

-- O estudante entra em todas as matérias automaticamente; ninguém precisa criar
-- uma matrícula manual e correr o risco de esquecer alguma disciplina.
create function private.sync_student_enrollments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'student' then
    insert into public.enrollments (student_id, subject_id)
    select new.id, id from public.subjects
    on conflict do nothing;
  else
    delete from public.enrollments where student_id = new.id;
  end if;
  return new;
end;
$$;

create function private.enroll_students_in_new_subject()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.enrollments (student_id, subject_id)
  select id, new.id from public.profiles where role = 'student'
  on conflict do nothing;
  return new;
end;
$$;

revoke all on function private.sync_student_enrollments() from public;
revoke all on function private.enroll_students_in_new_subject() from public;

create trigger profiles_sync_student_enrollments
after insert or update of role on public.profiles
for each row execute function private.sync_student_enrollments();

create trigger subjects_enroll_all_students
after insert on public.subjects
for each row execute function private.enroll_students_in_new_subject();

insert into public.enrollments (student_id, subject_id)
select profiles.id, subjects.id
from public.profiles cross join public.subjects
where profiles.role = 'student'
on conflict do nothing;

-- A função é usada nas políticas para ligar uma atividade à disciplina certa.
-- Ela não recebe o aluno porque o próprio registro já informa quem ele é.
create function private.is_teacher_for_subject(target_subject uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.teacher_subjects
    where teacher_id = (select auth.uid()) and subject_id = target_subject
  );
$$;

revoke all on function private.is_teacher_for_subject(uuid) from public;
grant execute on function private.is_teacher_for_subject(uuid) to authenticated;

alter table public.teacher_subjects enable row level security;
alter table public.difficulty_alerts enable row level security;
alter table public.weekly_summary_runs enable row level security;

revoke all on public.teacher_students, public.teacher_subjects,
  public.difficulty_alerts, public.weekly_summary_runs from anon, authenticated;
grant select on public.teacher_subjects, public.difficulty_alerts to authenticated;

-- As políticas antigas acompanhavam uma turma inteira. Agora toda leitura do
-- professor precisa provar que a linha pertence à única disciplina atribuída.
drop policy if exists "profiles_select_authorized" on public.profiles;
drop policy if exists "teacher_students_read_authorized" on public.teacher_students;
drop policy if exists "enrollments_read_authorized" on public.enrollments;
drop policy if exists "lesson_progress_read_authorized" on public.lesson_progress;
drop policy if exists "attempts_read_authorized" on public.question_attempts;
drop policy if exists "difficulties_read_authorized" on public.student_difficulties;

create policy "profiles_select_subject_authorized" on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or (
    (select private.current_user_role()) = 'teacher'
    and exists (
      select 1 from public.enrollments
      where enrollments.student_id = profiles.id
        and (select private.is_teacher_for_subject(enrollments.subject_id))
    )
  )
);

create policy "enrollments_read_subject_authorized" on public.enrollments for select to authenticated
using (
  student_id = (select auth.uid())
  or (
    (select private.current_user_role()) = 'teacher'
    and (select private.is_teacher_for_subject(subject_id))
  )
);

create policy "lesson_progress_read_subject_authorized" on public.lesson_progress for select to authenticated
using (
  student_id = (select auth.uid())
  or (
    (select private.current_user_role()) = 'teacher'
    and exists (
      select 1
      from public.lessons
      join public.modules on modules.id = lessons.module_id
      where lessons.id = lesson_progress.lesson_id
        and (select private.is_teacher_for_subject(modules.subject_id))
    )
  )
);

create policy "attempts_read_subject_authorized" on public.question_attempts for select to authenticated
using (
  student_id = (select auth.uid())
  or (
    (select private.current_user_role()) = 'teacher'
    and exists (
      select 1 from public.questions
      where questions.id = question_attempts.question_id
        and (select private.is_teacher_for_subject(questions.subject_id))
    )
  )
);

create policy "difficulties_read_subject_authorized" on public.student_difficulties for select to authenticated
using (
  student_id = (select auth.uid())
  or (
    (select private.current_user_role()) = 'teacher'
    and (select private.is_teacher_for_subject(subject_id))
  )
);

create policy "teacher_subjects_read_own" on public.teacher_subjects for select to authenticated
using (teacher_id = (select auth.uid()));

create policy "difficulty_alerts_read_own_subject" on public.difficulty_alerts for select to authenticated
using (teacher_id = (select auth.uid()));
