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
| 🌱 Primeiro passo | Concluir uma aula |
| 🔥 Ritmo de estudo | Estudar por 3 dias seguidos |
| 🎯 Mente afiada | Acertar 10 questões |
| ⭐ Em ótima fase | Ter pelo menos 80% de acerto depois de 5 tentativas |

As insígnias ficam logo abaixo do avatar. O estudante pode escolher uma conquista já desbloqueada para aparecer em destaque, mas não consegue selecionar uma conquista que ainda não ganhou.

## Personalização do perfil

Depois do primeiro cadastro, o estudante escolhe uma variação de avatar, uma insígnia em destaque e uma entre quatro cores do site. O avatar usa somente as iniciais do nome, sem exigir foto pessoal.

A rota `PUT /student/profile-personalization` valida o cargo e usa o ID da sessão. Antes de salvar, o backend recalcula as conquistas e confirma que a insígnia escolhida realmente pertence ao estudante. Os valores aceitos são listas fechadas, então o navegador não consegue enviar CSS ou nomes arbitrários.

## Dados e privacidade

- A migration `20260908170000_student_gamification.sql` registra um único dia de atividade por estudante.
- Os gatilhos do banco marcam o dia ao responder uma questão ou ao atualizar o acesso a uma aula.
- A tabela possui RLS: o estudante consulta somente as próprias datas, e não recebe permissão para escrever nela diretamente.
- O endpoint exige o cargo `student`, usa sempre o ID do JWT e não aceita um ID de estudante enviado pelo navegador.
- A migration `20260914183000_student_profile_personalization.sql` adiciona as preferências com restrições no banco, sem liberar escrita direta ao navegador.

As atividades anteriores à aplicação da migration não são inventadas. A contagem de dias começa a ser registrada a partir dela.

## Acessibilidade

O anel de nível contém um elemento `progress` nativo para leitores de tela e modo de alto contraste. As conquistas são uma lista com texto, não dependem só de cor e respeitam a preferência do sistema por reduzir animações.
