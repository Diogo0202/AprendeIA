-- O navegador pode ler apenas o perfil associado ao JWT atual.
-- Consultas administrativas e docentes passam pela API com service_role.
drop policy if exists "profiles_select_authorized" on public.profiles;
drop policy if exists "profiles_select_subject_authorized" on public.profiles;
drop policy if exists "profiles_select_own" on public.profiles;

create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));
