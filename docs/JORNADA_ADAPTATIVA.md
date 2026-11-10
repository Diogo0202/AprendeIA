# Jornada adaptativa do estudante

## Objetivo

A jornada deixa de escolher apenas entre dificuldade básica, intermediária e avançada. O sistema observa cada disciplina e tópico para separar o que já está dominado, o que ainda está em desenvolvimento e o que precisa de revisão.

## Primeiro acesso

1. O estudante personaliza o perfil.
2. O frontend consulta `GET /student/diagnostic`.
3. O backend cria uma sessão curta com até duas questões publicadas por disciplina.
4. Cada resposta é gravada em `diagnostic_answers`, sem devolver o gabarito durante a avaliação.
5. A conclusão agrupa as respostas por tópico e entrega o primeiro mapa de aprendizagem.

## Classificação

- Dominado: pelo menos três tentativas e 80% ou mais de acertos.
- Frágil: pelo menos duas tentativas e menos de 60% de acertos.
- Em desenvolvimento: os demais casos, inclusive quando ainda falta evidência.

As regras ficam em `backend/learning_engine.py` e têm testes próprios. Respostas da prática comum e da avaliação diagnóstica entram no mesmo cálculo, mas continuam registradas em tabelas separadas para auditoria.

## Recomendação

O motor procura aulas incompletas da mesma disciplina. Quando o título ou resumo combina com o tópico frágil, essa aula recebe prioridade. Se não houver uma combinação direta, o sistema recomenda a próxima aula incompleta da matéria.

Esse desenho evita inventar links ou conteúdos. A recomendação sempre aponta para uma aula que a administração cadastrou e publicou.

## Segurança

- O ID do estudante vem da sessão validada no backend.
- Diagnóstico e respostas não possuem acesso direto pela chave pública.
- O gabarito não aparece no payload da avaliação.
- A aula só abre depois que o backend confirma a matrícula na disciplina.
- A atualização de progresso usa o ID da sessão e tem limite de requisições.
