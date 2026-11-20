# Comunicação e tutor de IA

## O que entrou

O AprendeIA ganhou uma área única de conversas no frontend, mas o backend mantém dois fluxos separados:

- conversa direta, usada entre pessoas;
- conversa com o tutor de IA, usada somente pelo dono da sessão.

Essa separação evita que uma mensagem particular enviada a um professor seja reaproveitada como contexto da IA.

## Quem pode falar com quem

| Origem | Destino permitido |
| --- | --- |
| Aluno | professor responsável por uma disciplina em que o aluno está matriculado |
| Professor | alunos vinculados à sua disciplina |
| Professor | outros professores ativos |
| Aluno ou professor | tutor de IA individual |
| Administrador | não participa das conversas |

A regra é validada no FastAPI e repetida na função SQL `get_or_create_direct_conversation`. Trocar o ID da pessoa ou da conversa não pula a verificação de vínculo.

## Rotas

- `GET /communications/contacts` — contatos permitidos para o cargo atual;
- `GET /communications/conversations` — conversas das quais o usuário participa;
- `POST /communications/conversations` — cria ou reaproveita uma conversa direta;
- `GET /communications/conversations/{conversation_id}/messages` — histórico de uma conversa autorizada;
- `POST /communications/conversations/{conversation_id}/messages` — mensagem humana;
- `POST /communications/ai/messages` — mensagem destinada ao tutor de IA.

Todas exigem JWT válido, perfil de aluno ou professor e são registradas na auditoria de acesso. Escritas humanas têm limite de 120 chamadas por hora; o tutor de IA tem limite de 20 chamadas por hora.

## Proteção contra prompt injection

O arquivo `backend/ai_security.py` aplica quatro cuidados juntos:

1. normaliza Unicode e recusa caracteres de controle;
2. bloqueia tentativas explícitas de substituir ou revelar instruções internas;
3. separa política de sistema, pedido do usuário e contexto não confiável;
4. envia contexto e histórico como JSON sanitizado, omitindo injeções indiretas encontradas em dados do banco.

A resposta usa JSON Schema estrito, `store=False` e chega ao React como texto comum. O sistema não renderiza HTML retornado pelo modelo.

Detecção por padrão de texto não é uma garantia isolada. A principal barreira é a separação de papéis e dados, junto do limite de contexto, da saída estruturada e da autorização antes de consultar o banco.

## Banco e privacidade

A migration `20260923100000_secure_communications.sql` cria:

- `conversations`;
- `conversation_members`;
- `messages`;
- RPCs atômicas para conversa direta e conversa com IA.

`anon` e `authenticated` não possuem acesso direto a essas tabelas. Só o backend usa `service_role`, e mensagens não recebem permissão de alteração ou exclusão. A migration também remove a exclusão direta dos logs de auditoria e cria uma função restrita para expirar apenas eventos vencidos.

## Interface

Aluno e professor usam o mesmo componente `CommunicationCenter`. O menu usa `NavigationDock`: o movimento acompanha a distância do ponteiro alterando uma propriedade CSS diretamente, sem renderizar o React a cada pixel. Em tela pequena o dock vira horizontal; em dispositivo de toque ou com movimento reduzido, a ampliação é desligada.

## Antes de produção

1. aplicar a migration no Supabase de homologação;
2. configurar `OPENAI_API_KEY` e `OPENAI_MODEL` somente no backend - **já configurado no Railway**;
3. testar com contas reais de aluno, professor da matéria, outro professor e administrador;
4. confirmar que conversa alheia responde como não encontrada;
5. validar retenção e política institucional para mensagens escolares;
6. executar deploy somente depois dos testes e da migration terminarem com sucesso.
