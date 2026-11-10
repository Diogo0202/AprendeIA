-- A resposta certa é devolvida após cada tentativa. Se o aluno errou uma questão
-- antes, ele já viu o gabarito, então o acerto posterior não rende XP.
-- Só o gatilho muda: XP já concedido não é retirado e o backfill não é refeito.
create or replace function private.gamification_record() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_subject uuid;
begin
  if not exists(select 1 from public.profiles where id=new.student_id and role='student') then return new; end if;
  if tg_table_name='question_attempts' then
    if new.correct and not exists(
      select 1 from public.question_attempts a
      where a.student_id=new.student_id and a.question_id=new.question_id
        and not a.correct and a.id<>new.id and a.answered_at<=new.answered_at
    ) then
      select subject_id into v_subject from public.questions where id=new.question_id;
      insert into public.gamification_events values(new.student_id,'correct',new.question_id::text,10,new.answered_at,v_subject)
        on conflict do nothing;
    end if;
  elsif tg_table_name='lesson_progress' then
    if new.completed and (tg_op='INSERT' or not old.completed) then
      select m.subject_id into v_subject from public.lessons l join public.modules m on m.id=l.module_id where l.id=new.lesson_id;
      insert into public.gamification_events values(new.student_id,'lesson',new.lesson_id::text,100,statement_timestamp(),v_subject)
        on conflict do nothing;
    end if;
  elsif tg_table_name='student_activity_days' then
    insert into public.gamification_events values(new.student_id,'day',new.activity_date::text,20,
      new.activity_date::timestamp at time zone 'America/Sao_Paulo',null) on conflict do nothing;
  end if;
  perform private.refresh_gamification(new.student_id);
  return new;
end $$;
