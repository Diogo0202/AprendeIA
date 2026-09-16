-- Personalização visual do estudante.
-- O navegador pode ler estas escolhas no próprio perfil, mas não recebe permissão
-- de escrita direta. A API valida a identidade e a conquista antes de salvar.
begin;

alter table public.profiles
  add column avatar_key text not null default 'orbit',
  add column featured_badge_id text,
  add column accent_theme text not null default 'wine',
  add column profile_setup_complete boolean not null default false;

alter table public.profiles
  add constraint profiles_avatar_key_allowed check (
    avatar_key in ('orbit', 'spark', 'books', 'prism', 'trail')
  ),
  add constraint profiles_featured_badge_allowed check (
    featured_badge_id is null or featured_badge_id in (
      'first_lesson',
      'study_streak',
      'ten_correct_answers',
      'excellent_accuracy'
    )
  ),
  add constraint profiles_accent_theme_allowed check (
    accent_theme in ('wine', 'ocean', 'forest', 'amber')
  );

comment on column public.profiles.featured_badge_id is
  'Conquista já desbloqueada que o estudante escolheu mostrar no perfil.';

commit;
