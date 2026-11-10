-- Uma falha em qualquer gravação desfaz a troca inteira do tutor.
begin;
create function public.append_ai_exchange(
  p_actor uuid, p_conversation uuid, p_question text, p_answer text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare question_row public.messages; answer_row public.messages; saved_at timestamptz;
begin
  -- O lock também preserva a ordem dos pares enviados simultaneamente.
  perform 1 from public.conversations c
    join public.conversation_members m on m.conversation_id=c.id
    join public.profiles p on p.id=m.user_id
    where c.id=p_conversation and c.kind='ai' and c.created_by=p_actor
      and m.user_id=p_actor and p.role in ('student','teacher')
      and p.auth_created_at <= now() and p.auth_created_at + interval '168 hours' > now()
      and (p.age_band='adult' or (p.age_band='minor' and p.admission_status='approved' and p.admission_version='1'))
    for update of c;
  if not found then raise exception using errcode='PT403',message='Conversa indisponível'; end if;
  if p_question is null or p_answer is null
    or char_length(btrim(p_question)) not between 1 and 2000
    or char_length(btrim(p_answer)) not between 1 and 4000 then
    raise exception using errcode='PT400',message='Mensagens inválidas';
  end if;
  saved_at := clock_timestamp();
  insert into public.messages(conversation_id,sender_id,sender_kind,body,created_at)
    values(p_conversation,p_actor,'user',p_question,saved_at) returning * into question_row;
  insert into public.messages(conversation_id,sender_id,sender_kind,body,created_at)
    values(p_conversation,null,'assistant',p_answer,saved_at+interval '1 microsecond') returning * into answer_row;
  update public.conversations set last_message_at=answer_row.created_at where id=p_conversation;
  return jsonb_build_object('user_message',to_jsonb(question_row),'assistant_message',to_jsonb(answer_row));
end;
$$;
revoke all on function public.append_ai_exchange(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.append_ai_exchange(uuid,uuid,text,text) to service_role;
commit;
