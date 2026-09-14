# IA e banco de questões

## Objetivo

A IA ajuda a criar atividades e recomendações, mas o cálculo do desempenho e as permissões continuam no código do sistema. Isso evita entregar decisões de segurança ao modelo.

## Geração de questões

`POST /question-bank/generate` recebe disciplina, tópico e dificuldade. Apenas o professor da disciplina pode usar a rota.

A OpenAI devolve JSON estruturado com:

- enunciado;
- quatro alternativas;
- índice correto;
- explicação curta.

O backend usa `store=False`, valida a estrutura e grava a origem como `openai`. A chave nunca vai para o navegador.

## Questões personalizadas

As dificuldades possíveis são `basic`, `intermediate` e `advanced`.

- Com menos de 60% de acerto, a próxima dificuldade fica em `basic`.
- Com 80% ou mais e pelo menos três tentativas, avança para `advanced`.
- Os demais casos usam `intermediate`.

A seleção consulta `student_difficulties` usando o aluno autenticado e a matéria pedida.

## Correção e explicação

O estudante não recebe o campo `correct_index` nem `explanation` antes de responder. Depois da tentativa, o backend devolve o resultado, o gabarito, a explicação e a nova dificuldade.

## Recomendação pedagógica

O professor pode gerar uma recomendação para uma turma ou aluno da própria disciplina. O prompt leva métricas anônimas, como taxa de acerto, quantidade de tentativas, aulas concluídas e tópicos de dificuldade.

A saída estruturada é salva em `pedagogical_recommendations` para manter histórico.

## Arquivos principais

- `backend/main.py` — schemas, prompts, geração, seleção e correção.
- `frontend/src/App.tsx` — prática do aluno e recomendação docente.
- `supabase/migrations/20260905192035_initial_learning_schema.sql` — questões, tentativas e dificuldades.
- `supabase/migrations/20260909120000_teacher_dashboard.sql` — recomendações pedagógicas.

## Pontos de atenção

- Sem `OPENAI_API_KEY`, as rotas que geram conteúdo respondem `503`.
- Erros do provedor viram resposta genérica `502`; detalhes internos não são enviados ao usuário.
- Questões geradas precisam de revisão pedagógica antes de serem usadas em uma turma real.
- Os campos de disciplina e tópico rejeitam controles e formatos usados em injeção simples de prompt.
