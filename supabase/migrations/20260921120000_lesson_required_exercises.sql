-- Exercícios obrigatórios pertencem à aula, mas tentativas e confirmações
-- continuam pertencendo ao estudante autenticado e são gravadas só pelo backend.
begin;

create table public.lesson_required_exercises (
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete restrict,
  position integer not null check (position > 0),
  primary key (lesson_id, question_id),
  unique (lesson_id, position)
);

create table public.lesson_exercise_completions (
  student_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null,
  question_id uuid not null,
  completed_at timestamptz not null default now(),
  primary key (student_id, lesson_id, question_id),
  foreign key (lesson_id, question_id)
    references public.lesson_required_exercises(lesson_id, question_id)
    on delete cascade
);

create index lesson_required_exercises_lesson_idx
  on public.lesson_required_exercises (lesson_id, position);
create index lesson_exercise_completions_student_lesson_idx
  on public.lesson_exercise_completions (student_id, lesson_id, completed_at desc);

alter table public.lesson_required_exercises enable row level security;
alter table public.lesson_exercise_completions enable row level security;

revoke all on public.lesson_required_exercises, public.lesson_exercise_completions
  from public, anon, authenticated;
grant select, insert, update, delete on public.lesson_required_exercises,
  public.lesson_exercise_completions to service_role;

create policy "lesson_required_exercises_service_only"
on public.lesson_required_exercises for all to service_role
using (true) with check (true);

create policy "lesson_exercise_completions_service_only"
on public.lesson_exercise_completions for all to service_role
using (true) with check (true);

commit;
