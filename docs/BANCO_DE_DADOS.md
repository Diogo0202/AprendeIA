# Banco de dados

## Organização

O PostgreSQL do Supabase usa dois schemas:

- `public` — dados acessados pela API de dados, sempre com RLS;
- `private` — funções e contadores internos usados pelo backend.

## Tabelas principais

| Grupo | Tabelas | Papel |
| --- | --- | --- |
| Identidade | `profiles` | Nome, e-mail, cargo, série e estado do cadastro. |
| Conteúdo | `subjects`, `modules`, `lessons` | Organização das matérias e aulas. |
| Matrícula | `enrollments`, `teacher_subjects` | Aluno em todas as matérias e professor em uma matéria. |
| Aprendizagem | `lesson_progress`, `questions`, `question_attempts`, `student_difficulties` | Progresso, atividades, respostas e dificuldade calculada. |
| Gamificação | `student_activity_days` | Dias com atividade do aluno. |
| Professor | `classes`, `class_students`, `learning_contents`, `pedagogical_recommendations` | Turmas, materiais e orientações. |
| Alertas | `difficulty_alerts`, `weekly_summary_runs` | Casos de dificuldade e controle do resumo semanal. |
| Segurança | `private.login_rate_limits`, `private.api_rate_limits`, `access_audit_logs` | Bloqueios, limites e trilha técnica de acesso. |

## Relações importantes

- Um aluno possui matrículas em todas as disciplinas.
- Um professor possui exatamente uma linha em `teacher_subjects`.
- `teacher_subjects.subject_id` é chave primária, então uma disciplina não recebe dois professores no MVP.
- Uma turma pertence ao professor e à sua disciplina.
- Um vínculo de turma não é dono do histórico; removê-lo não apaga tentativas ou progresso.

## RLS e funções

As políticas usam `auth.uid()` e funções privadas para repetir no banco as regras da API. Entre as funções mais importantes estão:

- `private.current_user_role()` — lê o cargo confiável do perfil;
- `private.is_teacher_for_subject()` — confirma a matéria do professor;
- `private.handle_new_user()` — cria perfil seguro após o cadastro;
- `public.approve_teacher_registration()` — aprova professor em transação única;
- `public.login_rate_limit_status()` — consulta bloqueio;
- `public.reserve_login_attempt()` — reserva a tentativa da conta antes da autenticação;
- `public.record_login_failure()` — incrementa com trava de linha;
- `public.clear_login_failures()` — limpa falhas após login correto.
- `public.reserve_api_request()` — reserva atomicamente uma operação autenticada antes da execução.

As três funções de limite aceitam somente hashes no formato SHA-256 e só concedem execução a `service_role`.

## Ordem das migrations

1. `20260905192035_initial_learning_schema.sql`
2. `20260906120000_harden_authorization.sql`
3. `20260908150000_teacher_subject_alerts.sql`
4. `20260908170000_student_gamification.sql`
5. `20260909120000_teacher_dashboard.sql`
6. `20260909211500_post_deploy_hardening.sql`
7. `20260911120000_teacher_registration_workflow.sql`
8. `20260913143000_login_rate_limit.sql`
9. `20260913150000_login_rate_limit_policy.sql`
10. `20260913153000_login_attempt_reservation.sql`
11. `20260914183000_student_profile_personalization.sql`
12. `20260915120000_api_security_hardening.sql`
13. `20260918120000_learning_journey.sql`
14. `20260920120000_access_audit_logs.sql`
15. `20260921150000_progressive_login_lockout.sql`
16. `20260923100000_secure_communications.sql`
17. `20260926120000_privacy_consent_and_audit_schema.sql`

## Estado confirmado

As três migrations originais de limite de login foram aplicadas ao projeto Supabase do AprendeIA. A migration progressiva adicionada em 21/09 ainda precisa ser aplicada; localmente, os testes confirmam cinco reservas, bloqueio antes da sexta chamada e cálculo crescente sem armazenar e-mail ou IP em texto puro.

A migration de segurança da API foi criada e validada localmente, mas ainda precisa ser aplicada no Supabase. Ela revoga leitura direta do banco de questões e escrita direta em tentativas e progresso, além de criar o contador das operações autenticadas.

A migration de auditoria mantém os eventos imutáveis para a aplicação: `anon` e `authenticated` não possuem acesso. A migration de comunicação remove `delete` do `service_role`; a migration de privacidade reduz a retenção dos logs para até 7 dias e agenda a limpeza horária via Supabase Cron.

A migration de comunicação cria `conversations`, `conversation_members` e `messages`. Ela ainda precisa ser aplicada no Supabase; criação de conversa, leitura de mensagens e tutor de IA não devem ser considerados prontos em produção antes dessa etapa.
