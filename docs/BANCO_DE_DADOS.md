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
| Segurança | `private.login_rate_limits` | Hashes e bloqueios temporários do login. |

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

## Estado confirmado

As três migrations de limite de login foram aplicadas ao projeto Supabase do AprendeIA. Um teste transacional confirmou quatro reservas válidas, bloqueio antes da quinta tentativa e tempo de espera positivo sem manter dados de teste.
