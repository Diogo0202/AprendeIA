-- Cadastro docente em duas etapas: a pessoa pede acesso, mas continua como
-- estudante até a administradora confirmar uma disciplina disponível.
alter table public.profiles
  add column requested_role public.app_role,
  add column requested_subject text,
  add column registration_status text not null default 'active';

alter table public.profiles
  add constraint profiles_teacher_request_shape check (
    (
      registration_status = 'active'
      and requested_role is null
      and requested_subject is null
    )
    or (
      registration_status = 'pending_teacher'
      and role = 'student'
      and requested_role = 'teacher'
      and char_length(requested_subject) between 2 and 60
    )
  );

create index profiles_pending_teacher_idx
  on public.profiles (created_at)
  where registration_status = 'pending_teacher';

-- O navegador pode declarar apenas a intenção. A função mantém o cargo real
-- como estudante e aceita a solicitação somente com uma disciplina curta.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_subject_value text := btrim(coalesce(new.raw_user_meta_data ->> 'requested_subject', ''));
  is_teacher_request boolean := (
    new.raw_user_meta_data ->> 'requested_role' = 'teacher'
    and char_length(requested_subject_value) between 2 and 60
    and requested_subject_value !~ '[[:cntrl:]{}<>]'
  );
begin
  insert into public.profiles (
    id,
    email,
    full_name,
    role,
    grade,
    requested_role,
    requested_subject,
    registration_status
  )
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, 'Estudante'), '@', 1)),
    'student',
    coalesce(new.raw_user_meta_data ->> 'grade', ''),
    case when is_teacher_request then 'teacher'::public.app_role else null end,
    case when is_teacher_request then requested_subject_value else null end,
    case when is_teacher_request then 'pending_teacher' else 'active' end
  );
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public;

-- Esta RPC é chamada apenas pelo backend com a chave secreta. Perfil e matéria
-- mudam na mesma transação, evitando professor sem disciplina ou matéria duplicada.
create function public.approve_teacher_registration(
  target_user_id uuid,
  approved_subject_name text
)
returns table (
  id uuid,
  email text,
  full_name text,
  role public.app_role,
  subject text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  approved_subject_id uuid;
begin
  if not exists (
    select 1
    from public.profiles
    where profiles.id = target_user_id
      and profiles.role = 'student'
      and profiles.requested_role = 'teacher'
      and profiles.registration_status = 'pending_teacher'
  ) then
    raise exception 'Solicitação de professor não encontrada.';
  end if;

  select subjects.id
  into approved_subject_id
  from public.subjects
  where subjects.name = approved_subject_name;

  if approved_subject_id is null then
    raise exception 'Disciplina não encontrada.';
  end if;

  update public.profiles
  set
    role = 'teacher',
    grade = 'Professor',
    requested_role = null,
    requested_subject = null,
    registration_status = 'active',
    updated_at = now()
  where profiles.id = target_user_id;

  insert into public.teacher_subjects (teacher_id, subject_id)
  values (target_user_id, approved_subject_id);

  return query
  select profiles.id, profiles.email, profiles.full_name, profiles.role, subjects.name
  from public.profiles
  join public.teacher_subjects on teacher_subjects.teacher_id = profiles.id
  join public.subjects on subjects.id = teacher_subjects.subject_id
  where profiles.id = target_user_id;
end;
$$;

revoke all on function public.approve_teacher_registration(uuid, text) from public, anon, authenticated;
grant execute on function public.approve_teacher_registration(uuid, text) to service_role;
