-- Jornada pedagógica: diagnóstico, aulas reais e revisão editorial das questões.
-- O navegador acessa estes dados apenas pelos endpoints autenticados do backend.

alter table public.subjects
  add column if not exists category text not null default 'Outras';

alter table public.lessons
  add column if not exists summary text not null default '',
  add column if not exists content text not null default '',
  add column if not exists learning_objectives jsonb not null default '[]'::jsonb,
  add column if not exists published boolean not null default true;

alter table public.questions
  add column if not exists status text not null default 'published',
  add column if not exists review_notes text not null default '',
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

alter table public.questions
  drop constraint if exists questions_status_check;
alter table public.questions
  add constraint questions_status_check check (status in ('draft', 'published', 'archived'));

create table if not exists public.diagnostic_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  question_ids jsonb not null default '[]'::jsonb,
  status text not null default 'open' check (status in ('open', 'completed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (student_id, status)
);

create table if not exists public.diagnostic_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.diagnostic_sessions(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  selected_index integer not null check (selected_index between 0 and 3),
  correct boolean not null,
  response_time_seconds integer not null default 0 check (response_time_seconds between 0 and 7200),
  answered_at timestamptz not null default now(),
  unique (session_id, question_id)
);

alter table public.diagnostic_sessions enable row level security;
alter table public.diagnostic_answers enable row level security;

revoke all on public.diagnostic_sessions, public.diagnostic_answers from anon, authenticated;
revoke select on public.subjects, public.modules, public.lessons from authenticated;

create index if not exists diagnostic_sessions_student_idx
  on public.diagnostic_sessions (student_id, started_at desc);
create index if not exists diagnostic_answers_student_idx
  on public.diagnostic_answers (student_id, answered_at desc);
create index if not exists questions_review_queue_idx
  on public.questions (subject_id, status, created_at desc);

update public.subjects set category = case name
  when 'Matemática' then 'Ciências Exatas'
  when 'Português' then 'Linguagens'
  when 'Ciências' then 'Ciências da Natureza'
  else category
end;
update public.lessons
set summary = case title
  when 'Conceito de fração' then 'Entenda numerador, denominador e partes de um todo.'
  when 'Frações equivalentes' then 'Compare frações diferentes que representam a mesma quantidade.'
  when 'Ideia principal' then 'Aprenda a localizar a mensagem central de um texto.'
  when 'Planetas do Sistema Solar' then 'Conheça a ordem e as características principais dos planetas.'
  else summary
end,
content = case title
  when 'Conceito de fração' then 'Uma fração representa uma ou mais partes iguais de um todo. O número de cima é o numerador e mostra quantas partes usamos. O número de baixo é o denominador e mostra em quantas partes iguais o todo foi dividido.'
  when 'Frações equivalentes' then 'Frações equivalentes têm escritas diferentes, mas representam a mesma quantidade. Multiplicar ou dividir numerador e denominador pelo mesmo número mantém o valor da fração.'
  when 'Ideia principal' then 'A ideia principal é a mensagem mais importante do texto. Observe o título, as palavras repetidas e o que todas as frases ajudam a explicar.'
  when 'Planetas do Sistema Solar' then 'O Sistema Solar tem oito planetas em órbita ao redor do Sol. Eles se organizam, a partir do Sol, em Mercúrio, Vênus, Terra, Marte, Júpiter, Saturno, Urano e Netuno.'
  else content
end,
learning_objectives = case title
  when 'Conceito de fração' then '["Reconhecer numerador e denominador", "Representar partes de um todo"]'::jsonb
  when 'Frações equivalentes' then '["Identificar frações equivalentes", "Simplificar frações"]'::jsonb
  when 'Ideia principal' then '["Localizar a mensagem central", "Separar ideia principal de detalhes"]'::jsonb
  when 'Planetas do Sistema Solar' then '["Ordenar os planetas", "Distinguir planetas rochosos e gasosos"]'::jsonb
  else learning_objectives
end;
