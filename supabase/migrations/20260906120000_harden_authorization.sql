-- Reforça a barreira no banco caso novas permissões sejam adicionadas depois.
-- A regra importante continua sendo: aluno escreve somente a própria atividade;
-- professor consulta vínculos, mas não altera perfil, progresso ou dificuldade.

revoke insert, update, delete on public.profiles from authenticated;
revoke insert, update, delete on public.teacher_students from authenticated;
revoke insert, update, delete on public.enrollments from authenticated;
revoke insert, update, delete on public.questions from authenticated;
revoke update, delete on public.question_attempts from authenticated;
revoke insert, update, delete on public.student_difficulties from authenticated;

-- Estas são as únicas escritas previstas pela aplicação para usuários comuns.
grant update (full_name, grade, goal) on public.profiles to authenticated;
grant insert, update (completed, time_seconds, last_accessed_at)
  on public.lesson_progress to authenticated;
grant insert on public.question_attempts to authenticated;
