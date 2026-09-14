# Área do aluno

## O que o aluno encontra

- Perfil com nome, série e avatar.
- Lista de matérias e módulos.
- Quantidade de aulas concluídas e restantes.
- Dificuldade atual por conteúdo.
- Pontos, nível, sequência de estudo e insígnias.
- Área de prática com questões ajustadas ao desempenho.
- Explicação da resposta depois de cada tentativa.

## Fluxo da prática

1. A tela pede a próxima questão em `GET /question-bank/next`.
2. O backend usa a dificuldade atual do próprio aluno.
3. A resposta segue para `POST /question-bank/{question_id}/answer`.
4. O servidor grava a tentativa, calcula a taxa de acerto e atualiza `student_difficulties`.
5. O aluno recebe o resultado, a explicação e o próximo nível.

O gabarito e a explicação ficam fora da resposta inicial. Eles só aparecem depois que a tentativa foi registrada.

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

## Limites de acesso

O aluno consulta dados usando o ID do token, não um ID digitado na URL. Ele não pode abrir a área administrativa, consultar outro estudante nem acessar relatórios docentes.

## Arquivos principais

- `frontend/src/App.tsx` — `StudentProfile` e `PracticeProfile`.
- `backend/main.py` — rotas `/student/*` e rotas de prática.
- `backend/gamification.py` — cálculo de pontos e conquistas.
- `supabase/migrations/20260908170000_student_gamification.sql` — registro dos dias ativos.
