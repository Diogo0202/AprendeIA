# Perfil gamificado do estudante

## Objetivo

Transformar a área pós-cadastro em um perfil de estudante que mostre progresso real, pontos, nível e conquistas obtidas por consistência de estudo e acertos.

## Regras

- A atividade diária é registrada automaticamente quando o estudante responde questão ou atualiza uma aula.
- Pontos: 100 por aula concluída, 10 por resposta correta e 20 por dia ativo.
- Nível: começa no 1 e sobe a cada 250 pontos completos.
- Conquistas: primeira aula concluída, sequência de 3 dias, 10 acertos e 80% de acerto após 5 tentativas.
- Dados de gamificação são exclusivos do próprio estudante e chegam pela rota autenticada `GET /student/gamification`.
- A foto é um espaço de avatar. Enquanto os arquivos gerados não forem liberados pelo Artlist, o app usa avatar de iniciais sem dados pessoais.

## Interface

- Foto, nome e nível ficam no cartão principal do perfil.
- Pontos e a barra para o próximo nível ficam ao lado da foto.
- As medalhas aparecem imediatamente abaixo da foto, com texto para não depender somente de cor ou ícone.
- O visual preserva o vermelho do AprendeIA, com cartões claros e detalhes de incentivo inspirados na tela do Figma.
