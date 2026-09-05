-- Esquema inicial do AprendeIA.
-- O desenho separa identidade, conteúdo e atividade para permitir evolução sem
-- duplicar dados. Todas as tabelas públicas recebem RLS antes de serem usadas.

-- Funções auxiliares ficam fora do schema exposto pela Data API.
create schema if not exists private;

-- Enums impedem cargos ou dificuldades com grafias inconsistentes.
create type public.app_role as enum ('student', 'teacher', 'admin');
create type public.difficulty_level as enum ('basic', 'intermediate', 'advanced');

-- Perfis complementam auth.users sem copiar senhas ou tokens.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null,
  role public.app_role not null default 'student',
  grade text not null default '',
  goal text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Conteúdo didático segue a hierarquia disciplina > módulo > aula.
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table public.modules (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  title text not null,
  position integer not null check (position > 0),
  unique (subject_id, position)
);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.modules(id) on delete cascade,
  title text not null,
  position integer not null check (position > 0),
  estimated_minutes integer not null default 15 check (estimated_minutes > 0),
  unique (module_id, position)
);

-- Vínculos explícitos definem quais estudantes cada professor pode consultar.
create table public.teacher_students (
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (teacher_id, student_id),
  check (teacher_id <> student_id)
);

-- Matrículas conectam estudantes às disciplinas disponíveis no painel.
create table public.enrollments (
  student_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  primary key (student_id, subject_id)
);

-- O progresso registra conclusão, tempo e último acesso por aula.
create table public.lesson_progress (
  student_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  completed boolean not null default false,
  time_seconds integer not null default 0 check (time_seconds >= 0),
  last_accessed_at timestamptz not null default now(),
  primary key (student_id, lesson_id)
);

-- Questões guardam alternativas em JSONB porque o conjunto é pequeno e atômico.
create table public.questions (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  topic text not null,
  difficulty public.difficulty_level not null default 'basic',
  question text not null,
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 4),
  correct_index integer not null check (correct_index between 0 and 3),
  explanation text not null,
  source text not null default 'openai' check (source in ('seed', 'openai')),
  created_at timestamptz not null default now()
);

-- Tentativas são imutáveis: novas respostas geram novas linhas para auditoria.
create table public.question_attempts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  selected_index integer not null check (selected_index between 0 and 3),
  correct boolean not null,
  response_time_seconds integer not null default 0 check (response_time_seconds >= 0),
  answered_at timestamptz not null default now()
);

-- A tabela agregada acelera a escolha da próxima dificuldade adaptativa.
create table public.student_difficulties (
  student_id uuid not null references public.profiles(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  topic text not null,
  level public.difficulty_level not null default 'basic',
  accuracy numeric(5,2) not null default 0 check (accuracy between 0 and 100),
  attempts integer not null default 0 check (attempts >= 0),
  updated_at timestamptz not null default now(),
  primary key (student_id, subject_id, topic)
);

-- Índices atendem os caminhos mais frequentes dos painéis e do motor adaptativo.
create index question_attempts_student_subject_idx on public.question_attempts (student_id, answered_at desc);
create index lesson_progress_student_idx on public.lesson_progress (student_id, last_accessed_at desc);
create index questions_subject_difficulty_idx on public.questions (subject_id, difficulty);

-- Todo cadastro público nasce como estudante; somente o backend administrativo
-- pode promover uma conta. user_metadata é usado apenas para dados de exibição.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role, grade)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, 'Estudante'), '@', 1)),
    'student',
    coalesce(new.raw_user_meta_data ->> 'grade', '')
  );
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Helpers SECURITY DEFINER evitam recursão nas políticas de profiles. Eles ficam
-- no schema privado, usam search_path vazio e só podem ser executados por usuários
-- autenticados, reduzindo a superfície privilegiada.
create function private.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid());
$$;

create function private.is_teacher_of(target_student uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.teacher_students
    where teacher_id = (select auth.uid()) and student_id = target_student
  );
$$;

revoke all on function private.current_user_role() from public;
revoke all on function private.is_teacher_of(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.current_user_role() to authenticated;
grant execute on function private.is_teacher_of(uuid) to authenticated;

-- RLS é habilitado em todas as tabelas expostas antes de qualquer grant ao cliente.
alter table public.profiles enable row level security;
alter table public.subjects enable row level security;
alter table public.modules enable row level security;
alter table public.lessons enable row level security;
alter table public.teacher_students enable row level security;
alter table public.enrollments enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.questions enable row level security;
alter table public.question_attempts enable row level security;
alter table public.student_difficulties enable row level security;

-- Começamos sem privilégios e concedemos apenas as operações exigidas pela UI.
revoke all on all tables in schema public from anon, authenticated;
grant select on public.profiles, public.subjects, public.modules, public.lessons,
  public.teacher_students, public.enrollments, public.lesson_progress,
  public.questions, public.question_attempts, public.student_difficulties to authenticated;
grant update (full_name, grade, goal) on public.profiles to authenticated;
grant insert, update (completed, time_seconds, last_accessed_at) on public.lesson_progress to authenticated;
grant insert on public.question_attempts to authenticated;

-- O usuário vê o próprio perfil; professor vê vínculos; admin vê todos.
create policy "profiles_select_authorized" on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or (select private.current_user_role()) = 'admin'
  or ((select private.current_user_role()) = 'teacher' and (select private.is_teacher_of(id)))
);
create policy "profiles_update_own" on public.profiles for update to authenticated
using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Conteúdo-base é comum a qualquer pessoa autenticada.
create policy "subjects_read_authenticated" on public.subjects for select to authenticated using (true);
create policy "modules_read_authenticated" on public.modules for select to authenticated using (true);
create policy "lessons_read_authenticated" on public.lessons for select to authenticated using (true);
create policy "questions_read_authenticated" on public.questions for select to authenticated using (true);

-- Relações e atividades respeitam propriedade, vínculo pedagógico ou administração.
create policy "teacher_students_read_authorized" on public.teacher_students for select to authenticated
using (teacher_id = (select auth.uid()) or student_id = (select auth.uid()) or (select private.current_user_role()) = 'admin');

create policy "enrollments_read_authorized" on public.enrollments for select to authenticated
using (student_id = (select auth.uid()) or (select private.is_teacher_of(student_id)) or (select private.current_user_role()) = 'admin');

create policy "lesson_progress_read_authorized" on public.lesson_progress for select to authenticated
using (student_id = (select auth.uid()) or (select private.is_teacher_of(student_id)) or (select private.current_user_role()) = 'admin');
create policy "lesson_progress_insert_own" on public.lesson_progress for insert to authenticated
with check (student_id = (select auth.uid()));
create policy "lesson_progress_update_own" on public.lesson_progress for update to authenticated
using (student_id = (select auth.uid())) with check (student_id = (select auth.uid()));

create policy "attempts_read_authorized" on public.question_attempts for select to authenticated
using (student_id = (select auth.uid()) or (select private.is_teacher_of(student_id)) or (select private.current_user_role()) = 'admin');
create policy "attempts_insert_own" on public.question_attempts for insert to authenticated
with check (student_id = (select auth.uid()));

create policy "difficulties_read_authorized" on public.student_difficulties for select to authenticated
using (student_id = (select auth.uid()) or (select private.is_teacher_of(student_id)) or (select private.current_user_role()) = 'admin');

-- Dados iniciais tornam o projeto demonstrável logo após aplicar a migração.
insert into public.subjects (id, name, description) values
  ('10000000-0000-0000-0000-000000000001', 'Matemática', 'Raciocínio lógico, números e resolução de problemas.'),
  ('10000000-0000-0000-0000-000000000002', 'Português', 'Leitura, escrita e interpretação de textos.'),
  ('10000000-0000-0000-0000-000000000003', 'Ciências', 'Fenômenos naturais, vida e universo.');

insert into public.modules (id, subject_id, title, position) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Frações e porcentagens', 1),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Interpretação de texto', 1),
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', 'Sistema solar', 1);

insert into public.lessons (module_id, title, position) values
  ('20000000-0000-0000-0000-000000000001', 'Conceito de fração', 1),
  ('20000000-0000-0000-0000-000000000001', 'Frações equivalentes', 2),
  ('20000000-0000-0000-0000-000000000002', 'Ideia principal', 1),
  ('20000000-0000-0000-0000-000000000003', 'Planetas do Sistema Solar', 1);

insert into public.questions (subject_id, topic, difficulty, question, options, correct_index, explanation, source) values
  ('10000000-0000-0000-0000-000000000001', 'Frações', 'basic', 'Qual fração representa a metade de uma pizza?', '["1/2", "1/3", "2/3", "3/4"]'::jsonb, 0, 'Uma metade significa dividir o todo em duas partes iguais e considerar uma delas: 1/2.', 'seed'),
  ('10000000-0000-0000-0000-000000000002', 'Interpretação de texto', 'basic', 'Em um texto, a ideia principal é:', '["o assunto mais importante", "uma palavra difícil", "o nome do autor", "a última frase"]'::jsonb, 0, 'A ideia principal é a mensagem mais importante que o texto comunica.', 'seed');
