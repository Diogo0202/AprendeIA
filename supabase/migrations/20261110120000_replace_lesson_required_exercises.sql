-- Troca atômica dos exercícios obrigatórios: delete + insert na mesma transação,
-- para que uma falha no insert nunca deixe a aula sem exercício obrigatório.
begin;

create or replace function public.replace_lesson_required_exercises(
  p_lesson_id uuid,
  p_question_ids uuid[]
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_subject_id uuid;
  v_ids uuid[] := coalesce(p_question_ids, '{}');
  v_valid integer;
begin
  select m.subject_id into v_subject_id
  from public.lessons l
  join public.modules m on m.id = l.module_id
  where l.id = p_lesson_id;
  if v_subject_id is null then
    raise exception 'lesson_not_found' using errcode = 'P0002';
  end if;

  if cardinality(v_ids) <> (select count(distinct x) from unnest(v_ids) x) then
    raise exception 'duplicate_questions' using errcode = '22023';
  end if;

  select count(*) into v_valid
  from public.questions q
  where q.id = any(v_ids) and q.subject_id = v_subject_id and q.status = 'published';
  if v_valid <> cardinality(v_ids) then
    raise exception 'invalid_questions' using errcode = '22023';
  end if;

  delete from public.lesson_required_exercises where lesson_id = p_lesson_id;
  insert into public.lesson_required_exercises (lesson_id, question_id, position)
  select p_lesson_id, q.id, q.ord
  from unnest(v_ids) with ordinality as q(id, ord);
end;
$$;

revoke all on function public.replace_lesson_required_exercises(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.replace_lesson_required_exercises(uuid, uuid[])
  to service_role;

commit;
