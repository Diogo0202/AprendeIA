# Dashboard do professor

## Objetivo

A área do professor transforma tentativas, tempo de estudo e dificuldades em uma visão prática da turma. O docente acompanha apenas a disciplina atribuída a ele e não recebe rotas para editar perfil, respostas, progresso ou dificuldade dos estudantes.

## Recursos entregues

1. **Visão geral:** quantidade de turmas, alunos, alertas ativos e média de acertos.
2. **Turmas:** criação de turmas, inclusão por e-mail e remoção do vínculo sem apagar histórico.
3. **Acompanhamento individual:** acertos, tentativas, tempo, aulas concluídas, histórico e trilha de dificuldade.
4. **Relatórios:** exportação CSV por turma com proteção contra fórmulas de planilha.
5. **Conteúdos e IA:** cadastro ou importação de materiais e recomendação pedagógica a partir de métricas anônimas.

## Trilha de dificuldade

As tentativas são agrupadas por semana. A barra mostra `100 - taxa de acerto`: quanto menor a barra, menor a dificuldade observada. O cálculo fica em `backend/teacher_dashboard.py` e mantém no máximo 12 semanas no retorno.

Esse gráfico não faz diagnóstico clínico. Ele organiza sinais pedagógicos para apoiar a decisão do professor.

## Importação de conteúdo

O backend aceita CSV ou JSON de até 100 KB e no máximo 100 registros por envio. Os campos disponíveis são:

| Campo | Regra |
| --- | --- |
| `title` | Obrigatório, de 2 a 120 caracteres |
| `description` | Opcional, até 1.000 caracteres |
| `content_type` | `lesson`, `exercise`, `video` ou `link` |
| `source_url` | Opcional, somente HTTP ou HTTPS |

Arquivos executáveis não são aceitos. O professor não informa a disciplina no envio; o backend usa a atribuição gravada em `teacher_subjects`.

## Recomendação pedagógica pela IA

A rota `POST /teacher/recommendations` recebe uma turma e, opcionalmente, um estudante pertencente a ela. Antes de chamar a OpenAI, o servidor:

- prova que a turma pertence ao professor autenticado;
- prova que o estudante está na turma;
- consulta somente questões da disciplina atribuída;
- remove nomes e e-mails do contexto enviado;
- usa saída estruturada e `store=False`.

A resposta contém diagnóstico pedagógico, objetivo, três a cinco ações e uma sugestão de conteúdo. Ela é apoio para planejamento, não substitui a avaliação profissional do professor.

## Segurança

A migration `20260909120000_teacher_dashboard.sql` ativa RLS em `classes`, `class_students`, `learning_contents` e `pedagogical_recommendations`. As políticas repetem no banco o mesmo limite verificado pelo FastAPI:

- estudante vê somente o próprio vínculo de turma e conteúdos das matérias em que está matriculado;
- professor gerencia apenas as próprias turmas e materiais da própria disciplina;
- recomendações ficam visíveis somente para o professor que as criou;
- administradores não recebem acesso aos dados pedagógicos.

O modo `?demo=teacher` funciona apenas quando o frontend está sem Supabase. Ele serve para apresentação local e não cria token nem libera endpoints protegidos.

