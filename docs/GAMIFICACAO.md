# Gamificação do estudante

A tela inicial do estudante transforma o progresso já salvo no sistema em sinais simples de evolução. A ideia é incentivar a constância e o aprendizado, sem criar uma competição entre alunos.

## Como os pontos são calculados

| Ação registrada | Pontos |
| --- | ---: |
| Aula concluída | 100 XP |
| Questão respondida corretamente | 10 XP |
| Dia com atividade | 20 XP |

O nível começa no 1 e sobe a cada 250 XP. O cálculo acontece em `backend/gamification.py`; o frontend só recebe o resumo pronto em `GET /student/gamification`.

## Conquistas disponíveis

| Insígnia | Regra |
| --- | --- |
| 🌱 Primeira aula | Concluir uma aula |
| 🔥 Ritmo de estudo | Estudar por 3 dias seguidos |
| 🎯 Mira certeira | Acertar 10 questões |
| ⭐ Mandou bem | Ter pelo menos 80% de acerto depois de 5 tentativas |

As insígnias ficam logo abaixo da foto do estudante. Por enquanto a foto usa as iniciais do nome. Os avatares ilustrados só devem substituir esse espaço depois que forem gerados e aprovados para uso no projeto.

## Dados e privacidade

- A migration `20260908170000_student_gamification.sql` registra um único dia de atividade por estudante.
- Os gatilhos do banco marcam o dia ao responder uma questão ou ao atualizar o acesso a uma aula.
- A tabela possui RLS: o estudante consulta somente as próprias datas, e não recebe permissão para escrever nela diretamente.
- O endpoint exige o cargo `student`, usa sempre o ID do JWT e não aceita um ID de estudante enviado pelo navegador.

As atividades anteriores à aplicação da migration não são inventadas. A contagem de dias começa a ser registrada a partir dela.

## Acessibilidade

O anel de nível contém um elemento `progress` nativo para leitores de tela e modo de alto contraste. As conquistas são uma lista com texto, não dependem só de cor e respeitam a preferência do sistema por reduzir animações.
