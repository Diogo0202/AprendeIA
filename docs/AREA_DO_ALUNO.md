# Área do aluno

## O que o aluno encontra

- Perfil com nome, série, avatar personalizável, insígnia em destaque e tema de cor.
- Lista de matérias e módulos.
- Quantidade de aulas concluídas e restantes.
- Dificuldade atual por conteúdo.
- Pontos, nível, sequência de estudo e insígnias.
- Área de prática com questões ajustadas ao desempenho.
- Explicação da resposta depois de cada tentativa.
- Avaliação diagnóstica no primeiro acesso.
- Recomendações por tópico dominado, em desenvolvimento ou frágil.
- Leitura e conclusão das aulas reais cadastradas no banco.

## Fluxo da prática

1. A tela pede a próxima questão em `GET /question-bank/next`.
2. O backend usa a dificuldade atual do próprio aluno.
3. A resposta segue para `POST /question-bank/{question_id}/answer`.
4. O servidor grava a tentativa, calcula a taxa de acerto e atualiza `student_difficulties`.
5. O aluno recebe o resultado, a explicação e o próximo nível.

O gabarito e a explicação ficam fora da resposta inicial. Eles só aparecem depois que a tentativa foi registrada.

## Avaliação e aulas

O primeiro acesso usa `GET /student/diagnostic` para montar uma avaliação curta com questões publicadas de várias matérias. As respostas são gravadas por sessão e o gabarito não é enviado durante a avaliação. Quando todas as questões são concluídas, o motor agrupa acertos por tópico e monta o primeiro mapa de aprendizagem.

O catálogo vem de `GET /student/subjects`. A resposta já junta `subjects`, `modules`, `lessons` e `lesson_progress`, então o frontend não mantém uma lista própria de matérias. O aluno abre uma aula em `GET /student/lessons/{lesson_id}` e salva o avanço somente no próprio perfil.

## Gamificação

As regras estão em `backend/gamification.py`:

- 100 pontos por aula concluída;
- 10 pontos por resposta correta;
- 20 pontos por dia ativo;
- um novo nível a cada 250 pontos.

As conquistas levam em conta consistência, quantidade de atividades e acertos. O resumo detalhado está em [GAMIFICACAO.md](GAMIFICACAO.md).

## Dados usados

- `enrollments` — matérias do aluno;
- `lesson_progress` — aulas concluídas;
- `question_attempts` — respostas e tempo;
- `student_difficulties` — resumo por matéria e tópico;
- `student_activity_days` — dias usados na sequência e nas conquistas.
- `profiles` — avatar, insígnia em destaque, tema e conclusão da configuração.

## Limites de acesso

O aluno consulta dados usando o ID do token, não um ID digitado na URL. Ele não pode abrir a área administrativa, consultar outro estudante nem acessar relatórios docentes.

## Arquivos principais

- `frontend/src/App.tsx` — coordenação de sessão, perfil e prática.
- `frontend/src/components/student` — diagnóstico e leitura de aula.
- `frontend/src/types/learning.ts` — contratos usados pelo catálogo e recomendações.
- `backend/main.py` — rotas `/student/*` e rotas de prática.
- `backend/learning_engine.py` — classificação e recomendações por tópico.
- `backend/gamification.py` — cálculo de pontos e conquistas.
- `supabase/migrations/20260908170000_student_gamification.sql` — registro dos dias ativos.
- `supabase/migrations/20260914183000_student_profile_personalization.sql` — preferências visuais protegidas.
- `supabase/migrations/20260918120000_learning_journey.sql` — diagnóstico, conteúdo das aulas e revisão de questões.
