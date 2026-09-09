-- Estrutura da dashboard docente. Turmas organizam alunos, mas não dão ao
-- professor permissão para alterar perfil, progresso ou dificuldade.
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  school_year text not null check (char_length(school_year) between 2 and 30),
  created_at timestamptz not null default now(),
  unique (teacher_id, name, school_year)
);

create table public.class_students (
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (class_id, student_id)
);

create table public.learning_contents (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  content_type text not null default 'lesson' check (content_type in ('lesson', 'exercise', 'video', 'link')),
  source_url text not null default '' check (char_length(source_url) <= 500),
  created_at timestamptz not null default now()
);

create table public.pedagogical_recommendations (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid references public.profiles(id) on delete cascade,
  recommendation jsonb not null check (jsonb_typeof(recommendation) = 'object'),
  created_at timestamptz not null default now()
);

create index classes_teacher_idx on public.classes (teacher_id, created_at desc);
create index class_students_student_idx on public.class_students (student_id);
create index learning_contents_subject_idx on public.learning_contents (subject_id, created_at desc);
create index pedagogical_recommendations_teacher_idx on public.pedagogical_recommendations (teacher_id, created_at desc);

alter table public.classes enable row level security;
alter table public.class_students enable row level security;
alter table public.learning_contents enable row level security;
alter table public.pedagogical_recommendations enable row level security;

revoke all on public.classes, public.class_students, public.learning_contents,
  public.pedagogical_recommendations from anon, authenticated;
grant select, insert, update, delete on public.classes, public.class_students,
  public.learning_contents to authenticated;
grant select, insert on public.pedagogical_recommendations to authenticated;

-- A turma sempre pertence ao professor autenticado e à disciplina atribuída.
create policy "classes_teacher_own" on public.classes for all to authenticated
using (
  teacher_id = (select auth.uid())
  and (select private.current_user_role()) = 'teacher'
  and (select private.is_teacher_for_subject(subject_id))
)
with check (
  teacher_id = (select auth.uid())
  and (select private.current_user_role()) = 'teacher'
  and (select private.is_teacher_for_subject(subject_id))
);

-- O estudante só vê o próprio vínculo. O professor gerencia apenas vínculos
-- de turmas que possui e apenas de alunos matriculados na mesma disciplina.
create policy "class_students_read_authorized" on public.class_students for select to authenticated
using (
  student_id = (select auth.uid())
  or exists (
    select 1 from public.classes
    where classes.id = class_students.class_id
      and classes.teacher_id = (select auth.uid())
      and (select private.is_teacher_for_subject(classes.subject_id))
  )
);

create policy "class_students_teacher_insert" on public.class_students for insert to authenticated
with check (
  (select private.current_user_role()) = 'teacher'
  and exists (
    select 1 from public.classes
    join public.enrollments
      on enrollments.subject_id = classes.subject_id
     and enrollments.student_id = class_students.student_id
    where classes.id = class_students.class_id
      and classes.teacher_id = (select auth.uid())
      and (select private.is_teacher_for_subject(classes.subject_id))
  )
);

create policy "class_students_teacher_delete" on public.class_students for delete to authenticated
using (
  (select private.current_user_role()) = 'teacher'
  and exists (
    select 1 from public.classes
    where classes.id = class_students.class_id
      and classes.teacher_id = (select auth.uid())
      and (select private.is_teacher_for_subject(classes.subject_id))
  )
);

-- Materiais podem ser mantidos pelo autor. Estudantes leem apenas conteúdos de
-- matérias em que estão matriculados; administradores continuam fora da pedagogia.
create policy "learning_contents_teacher_manage" on public.learning_contents for all to authenticated
using (
  teacher_id = (select auth.uid())
  and (select private.current_user_role()) = 'teacher'
  and (select private.is_teacher_for_subject(subject_id))
)
with check (
  teacher_id = (select auth.uid())
  and (select private.current_user_role()) = 'teacher'
  and (select private.is_teacher_for_subject(subject_id))
);

create policy "learning_contents_student_read" on public.learning_contents for select to authenticated
using (
  (select private.current_user_role()) = 'student'
  and exists (
    select 1 from public.enrollments
    where enrollments.student_id = (select auth.uid())
      and enrollments.subject_id = learning_contents.subject_id
  )
);

create policy "recommendations_teacher_own" on public.pedagogical_recommendations for select to authenticated
using (
  teacher_id = (select auth.uid())
  and (select private.current_user_role()) = 'teacher'
  and (select private.is_teacher_for_subject(subject_id))
);

create policy "recommendations_teacher_insert" on public.pedagogical_recommendations for insert to authenticated
with check (
  teacher_id = (select auth.uid())
  and (select private.current_user_role()) = 'teacher'
  and (select private.is_teacher_for_subject(subject_id))
  and exists (
    select 1 from public.classes
    where classes.id = pedagogical_recommendations.class_id
      and classes.teacher_id = (select auth.uid())
      and classes.subject_id = pedagogical_recommendations.subject_id
  )
  and (
    student_id is null
    or exists (
      select 1 from public.class_students
      where class_students.class_id = pedagogical_recommendations.class_id
        and class_students.student_id = pedagogical_recommendations.student_id
    )
  )
);
