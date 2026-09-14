# Área do professor

## Regra central

Cada professor possui uma única disciplina e cada disciplina possui um único professor no MVP. A tabela `teacher_subjects` aplica as duas restrições no banco.

O professor pode visualizar e organizar os alunos da própria matéria, mas não pode alterar perfil, progresso, tentativas ou dificuldades.

## Dashboard

O painel reúne:

- visão geral das turmas;
- lista de estudantes;
- detalhe de uma turma;
- histórico individual;
- gráfico de evolução por semana;
- dificuldades por tópico;
- exportação de relatório CSV;
- criação e importação de conteúdos;
- recomendação pedagógica gerada por IA;
- alertas de dificuldade da disciplina.

## Turmas

O professor cria turmas da disciplina atribuída e inclui alunos matriculados nessa matéria. Remover um aluno da turma remove apenas o vínculo em `class_students`; o histórico acadêmico continua preservado.

## Relatórios e gráficos

O relatório CSV usa células neutralizadas para impedir fórmulas maliciosas quando o arquivo é aberto em uma planilha. Os gráficos agrupam tentativas por semana e mostram taxa de acerto e pontuação de dificuldade.

## Conteúdos

É possível criar um conteúdo individual ou importar até 100 itens em CSV/JSON. Os tipos aceitos são `lesson`, `exercise`, `video` e `link`.

## Recomendações da IA

O backend confirma professor, disciplina, turma e aluno antes da chamada. Nomes e e-mails não entram no prompt; a IA recebe apenas métricas e tópicos. A recomendação salva fica ligada ao professor e à turma.

## Alertas

Depois de pelo menos três tentativas, um aproveitamento abaixo de 60% abre um alerta. O professor vê o caso no aplicativo e pode receber:

- e-mail imediato quando surge uma dificuldade alta;
- resumo semanal dos alertas ativos.

## Arquivos principais

- `frontend/src/App.tsx` — `TeacherProfile` e o dashboard.
- `backend/main.py` — endpoints `/teacher/*`.
- `backend/teacher_dashboard.py` — gráficos, importação e CSV.
- `backend/difficulty_alerts.py` — regra e textos dos alertas.
- `supabase/migrations/20260909120000_teacher_dashboard.sql` — turmas, conteúdos e recomendações.
- `supabase/migrations/20260908150000_teacher_subject_alerts.sql` — disciplina única e alertas.
