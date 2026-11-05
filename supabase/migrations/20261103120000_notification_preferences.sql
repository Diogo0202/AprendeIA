-- Preferências de e-mail do professor (RF-10 da monografia).
-- O padrão mantém o comportamento atual: quem nunca escolheu continua recebendo.
-- O navegador não ganha escrita direta; a API grava e audita a mudança.
begin;

alter table public.profiles
  add column email_difficulty_alerts boolean not null default true,
  add column email_weekly_summary boolean not null default true,
  add column notification_preferences_updated_at timestamptz;

comment on column public.profiles.email_difficulty_alerts is
  'Envia por e-mail o alerta imediato de dificuldade. O alerta continua no painel.';
comment on column public.profiles.email_weekly_summary is
  'Envia por e-mail o resumo semanal de dificuldades da disciplina.';

alter table public.access_audit_logs
  drop constraint if exists access_audit_logs_action_check,
  add constraint access_audit_logs_action_check check (
    action ~ '^[a-z][a-z0-9_.]{2,99}$'
    or action in (
      'LOGIN_SUCCESS', 'LOGIN_FAILED', 'CREATE_USER', 'APPROVE_TEACHER',
      'CREATE_CLASS', 'ADD_STUDENT_TO_CLASS', 'GENERATE_QUESTION',
      'ANSWER_QUESTION', 'EXPORT_REPORT', 'UPDATE_PROFILE',
      'SEND_WEEKLY_SUMMARY', 'PRIVACY_POLICY_ACCEPTED',
      'UPDATE_NOTIFICATION_PREFERENCES'
    )
  );

commit;
