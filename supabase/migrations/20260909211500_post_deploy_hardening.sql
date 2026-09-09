-- Ajustes sugeridos pelo auditor do Supabase depois da primeira publicação.

-- Esta função é um gatilho interno do projeto e não precisa aparecer como RPC.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- Duas tabelas são usadas somente pelo backend com a chave de serviço. Políticas
-- explícitas de negação deixam essa intenção visível sem abrir nenhuma leitura.
create policy "teacher_students_backend_only" on public.teacher_students
for all to authenticated using (false) with check (false);

create policy "weekly_summary_runs_backend_only" on public.weekly_summary_runs
for all to authenticated using (false) with check (false);

-- Uma única política de leitura evita avaliar duas políticas permissivas em cada linha.
drop policy if exists "learning_contents_teacher_manage" on public.learning_contents;
drop policy if exists "learning_contents_student_read" on public.learning_contents;

create policy "learning_contents_read_authorized" on public.learning_contents for select to authenticated
using (
  (
    teacher_id = (select auth.uid())
    and (select private.current_user_role()) = 'teacher'
    and (select private.is_teacher_for_subject(subject_id))
  )
  or (
    (select private.current_user_role()) = 'student'
    and exists (
      select 1 from public.enrollments
      where enrollments.student_id = (select auth.uid())
        and enrollments.subject_id = learning_contents.subject_id
    )
  )
);

create policy "learning_contents_teacher_insert" on public.learning_contents for insert to authenticated
with check (
  teacher_id = (select auth.uid())
  and (select private.current_user_role()) = 'teacher'
  and (select private.is_teacher_for_subject(subject_id))
);

create policy "learning_contents_teacher_update" on public.learning_contents for update to authenticated
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

create policy "learning_contents_teacher_delete" on public.learning_contents for delete to authenticated
using (
  teacher_id = (select auth.uid())
  and (select private.current_user_role()) = 'teacher'
  and (select private.is_teacher_for_subject(subject_id))
);

-- Índices cobrem as chaves estrangeiras usadas em filtros e exclusões em cascata.
create index if not exists classes_subject_idx on public.classes (subject_id);
create index if not exists difficulty_alerts_subject_idx on public.difficulty_alerts (subject_id);
create index if not exists enrollments_subject_idx on public.enrollments (subject_id);
create index if not exists learning_contents_teacher_idx on public.learning_contents (teacher_id);
create index if not exists lesson_progress_lesson_idx on public.lesson_progress (lesson_id);
create index if not exists recommendations_class_idx on public.pedagogical_recommendations (class_id);
create index if not exists recommendations_student_idx on public.pedagogical_recommendations (student_id);
create index if not exists recommendations_subject_idx on public.pedagogical_recommendations (subject_id);
create index if not exists question_attempts_question_idx on public.question_attempts (question_id);
create index if not exists student_difficulties_subject_idx on public.student_difficulties (subject_id);
create index if not exists teacher_students_student_idx on public.teacher_students (student_id);
