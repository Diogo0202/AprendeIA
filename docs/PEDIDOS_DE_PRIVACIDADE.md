# Pedidos de privacidade (RF-08)

A área Meus dados recebe pedidos autenticados de acesso, correção, anonimização e exclusão. Ela aparece no cabeçalho dos painéis e na tela de aceite. O usuário acompanha protocolo, estado, resposta e expiração. O modo demonstrativo informa indisponibilidade de persistência e não registra pedidos fictícios.

## Processo e autorização

O backend atribui o usuário pelo token; o formulário não recebe `user_id` nem cargo. As rotas pessoais usam a autenticação que dispensa o aceite vigente, para que alguém possa exercer seus direitos mesmo antes de concordar com a política. Isso não dispensa uma sessão válida.

Um pedido começa pendente e pode ser cancelado pelo titular. A administração pode concluir ou recusar, com resposta. Ninguém revisa o próprio pedido. Estudantes e professores não entram na fila administrativa; uma conta administrativa não pode ser encerrada por este fluxo. A instituição precisa reatribuir essa responsabilidade antes de tratar seu encerramento.

O processamento usa uma RPC com bloqueio de linha e trava por conta. Decisão repetida é recusada, e a conta é determinada pelo pedido persistido, nunca por um identificador enviado no corpo de execução. A chave publicável não consulta a tabela nem executa as RPCs.

| Rota | Uso |
| --- | --- |
| `GET /privacy/requests` | Lista os últimos 100 pedidos válidos da própria conta. |
| `POST /privacy/requests` | Abre pedido; permite um pendente de cada tipo por conta. |
| `POST /privacy/requests/{request_id}/cancel` | Cancela pedido próprio ainda pendente. |
| `GET /privacy/requests/{request_id}/export` | Baixa JSON para acesso próprio concluído e não expirado. |
| `GET /admin/privacy-requests` | Lista os últimos 100 pedidos válidos para revisão administrativa. |
| `POST /admin/privacy-requests/{request_id}/resolve` | Conclui ou recusa, após validar cargo e estado. |

Escritas de pedidos têm limite de 10 por hora por usuário; exportações, 2 por hora; revisão, 30 por hora por administrador. A consulta administrativa tem limite de 120 por hora. Os limites dependem da RPC persistente já adotada pelo projeto.

## Efeito de cada pedido

O acesso aprovado libera um JSON gerado no momento do download, sem guardar uma segunda cópia no servidor. A lista de campos permitidos exclui credenciais, tokens e metadados internos de Auth. Cada consulta filtra o dono antes da paginação. O arquivo inclui perfil, atividade acadêmica, vínculos próprios, mensagens de autoria do titular, contexto de sua conversa individual com a IA, aceites e eventos técnicos associados ao usuário. Dados acadêmicos de colegas não entram na exportação do professor. Mensagens de outras pessoas em conversas humanas não são incluídas como se fossem de autoria do titular.

O exportador pagina as consultas e não corta o resultado silenciosamente. Acima de 10 mil linhas por conjunto, retorna HTTP 413 para atendimento assistido. O arquivo não é um backup integral do fornecedor: senhas, tokens e registros externos de Auth ficam fora dele. A resposta é um anexo JSON com `Cache-Control: no-store`.

A correção altera somente nome, etapa escolar e objetivo de estudo. Campos desconhecidos, inclusive cargo e e-mail de autenticação, são recusados. Nome e metadados de cadastro ficam coerentes na mesma transação. Troca de credenciais exige atendimento específico do provedor.

A exclusão requer digitar `EXCLUIR` na análise administrativa. Remove a conta Auth, perfil, histórico acadêmico e vínculos dependentes, além de conversas das quais o titular participa. Turmas e materiais de uma conta docente são removidos; tentativas e progresso de outros alunos permanecem. Questões compartilhadas permanecem sem vínculo de autoria. Arquivos no Storage bloqueiam a transação com HTTP 412 e precisam de tratamento pela Storage API.

A anonimização exige `ANONIMIZAR` e também encerra a conta. Antes da remoção, soma tentativas, acertos, aulas concluídas e segundos de estudo em uma única linha privada global. Essa linha não tem UUID de estudante, disciplina, texto livre nem horário individual. Nenhuma rota do produto lê essas somas. O processo não mantém um perfil pseudônimo com histórico individual rastreável.

O apagamento inclui logs vinculados diretamente à conta e ao hash de sua identidade. Outros recibos do mesmo titular perdem texto, correções e vínculo pessoal. A resposta do administrador não é preservada com dados pessoais no recibo final da exclusão. A função roda em uma transação: se um passo falhar, o banco desfaz os passos anteriores. A remoção de conteúdo em cópias de terceiros, mensagens de e-mail já entregues e arquivos externos não é executada por essa RPC.

A exclusão de Auth e o comportamento de sessões e arquivos devem ser conferidos em homologação conforme a [documentação oficial do Supabase](https://supabase.com/docs/guides/auth/managing-user-data). Um JWT emitido antes da exclusão pode durar até seu vencimento em serviços que só validam a assinatura. A API do AprendeIA também consulta o usuário e o perfil persistido; o perfil removido deixa de passar por essa autorização.

## Banco e retenção

A migration `supabase/migrations/20261102120000_privacy_requests.sql` cria `privacy_requests`, as RPCs e `private.anonymous_learning_totals`. Logs das novas rotas registram ações e protocolo, sem incluir os detalhes livres do pedido ou o JSON exportado.

Pedidos e respostas detalhados expiram em seis dias; uma tarefa horária remove os expirados, mantendo a margem para a regra de até sete dias desta etapa. As rotas não listam nem executam pedidos vencidos, mesmo se o agendador estiver indisponível. A instituição precisa organizar o atendimento antes da expiração e definir o canal assistido. Esse prazo técnico não é uma afirmação de cumprimento de todos os prazos legais aplicáveis.

## Validação e publicação

Os testes HTTP verificam posse, papéis, confirmação, ausência de aceite, exportação e metadados de erro. Os testes React cobrem envio, cancelamento, download, correção e decisão administrativa. Para validar o SQL sem dados reais:

```powershell
cd D:\AprendeIA\scripts\validation
npm ci
npm test
```

O teste usa PostgreSQL WASM/PGlite com as migrations reais. Auth, Storage, Cron e a função de plataforma `rls_auto_enable` recebem estruturas mínimas de teste. O agendamento Cron é simulado; não houve validação do agendador nem do serviço Auth real. Os cenários incluem exclusão, anonimização, correção, expiração e negação para a role `authenticated`.

Antes da publicação, aplicar e testar as migrations pendentes em homologação, inclusive `20261102120000_privacy_requests.sql` e depois `20261102130000_privacy_policy_v1_2.sql`. Interface, API e trigger exigem o aceite 1.2; contas antigas precisam do novo aceite para as rotas pedagógicas. Publicar o backend depois da migration de pedidos: `/health/ready` agora também consulta `privacy_requests`. Testar contas descartáveis de cada cargo e o encerramento de sessões nos serviços realmente usados. Esta etapa não executa exclusão de contas reais.

A identificação do controlador, o canal institucional, a retenção acadêmica e o procedimento de responsáveis por menores continuam no RF-07. A versão foi alinhada em 1.2, mas os demais pontos não foram declarados concluídos pelo acréscimo do formulário.
