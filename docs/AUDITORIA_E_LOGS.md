# Auditoria e logs de acesso

## Objetivo

Registrar ações relevantes para segurança, rastreabilidade e operação do AprendeIA, evitando registrar o conteúdo privado das interações ou credenciais.

## Campos persistidos

| Campo | Uso |
| --- | --- |
| `id` | Identificador sequencial do evento. |
| `user_id` | Usuário autenticado que iniciou a ação; nulo para tentativas anônimas. |
| `role` | Papel validado pelo backend (`student`, `teacher`, `admin` ou `service`). |
| `action` | Nome estável do evento, incluindo os eventos de negócio listados abaixo. |
| `resource` | Template da rota ou nome do recurso afetado; não inclui query string. |
| `resource_id` | UUID do recurso afetado, quando disponível. |
| `ip_hash` | HMAC da origem de rede; nunca o IP em texto puro. |
| `created_at` | Horário UTC em que o registro foi criado. |
| `metadata` | Lista permitida de metadados técnicos; não recebe corpo ou conteúdo livre. |

Os campos anteriores (`actor_id`, `actor_role`, `route`, `network_hash` e `occurred_at`) continuam temporariamente disponíveis para compatibilidade. A migration preenche os novos campos a partir deles sem remover o histórico.

## Eventos obrigatórios

| Evento | Origem |
| --- | --- |
| `LOGIN_SUCCESS` | Login concluído. |
| `LOGIN_FAILED` | Login negado ou malsucedido. |
| `CREATE_USER` | Cadastro público com aceite ou criação administrativa. |
| `APPROVE_TEACHER` | Aprovação de solicitação de professor. |
| `CREATE_CLASS` | Criação de turma. |
| `ADD_STUDENT_TO_CLASS` | Inclusão de estudante em turma. |
| `GENERATE_QUESTION` | Geração de questão pelo professor/IA. |
| `ANSWER_QUESTION` | Resposta de estudante a questão. |
| `EXPORT_REPORT` | Exportação de relatório docente. |

As ações das demais rotas protegidas continuam com identificadores técnicos em formato `area.recurso.acao`.

## Aceite da política

O cadastro registra a versão aceita (`policy_version`) e `privacy_policy_accepted=true` no metadata do evento `CREATE_USER`. A tabela `privacy_policy_acceptances` guarda separadamente usuário, versão, horário e referência ao log. Essa tabela não concede acesso a `anon` ou `authenticated` e não permite atualização/remoção por `service_role`. Contas antigas ou criadas pela administração ficam sem data/versão até o próprio titular aceitar; o backend permite somente a rota de aceite nesse estado e bloqueia as demais rotas protegidas.

Para essas contas, a RPC `record_privacy_policy_acceptance` grava a versão no perfil, a evidência em `privacy_policy_acceptances` e o evento `PRIVACY_POLICY_ACCEPTED` dentro da mesma transação.

## Acesso e retenção

- RLS e grants restringem a tabela de auditoria ao backend com `service_role`.
- O usuário não lê nem altera os logs diretamente pelo cliente.
- A administração acessa somente a visualização sanitizada oferecida pelo backend.
- Logs técnicos e evidências detalhadas de consentimento expiram antes do limite: o banco marca vencimento em 6 dias e o Cron faz a limpeza horária, mantendo a retenção física abaixo de 7 dias.
- A rota de consulta também não permite pesquisar mais de 7 dias.
- O perfil mantém somente a versão atualmente aceita para controlar acesso; o timestamp de aceite é apagado após 7 dias.

## Dados que não devem ser registrados

Não registrar senhas, tokens de sessão, cabeçalhos `Authorization`, corpo de requisição, respostas de IA, texto de mensagens, e-mail usado em tentativa de login, query string, IP puro ou qualquer segredo. Os metadados adicionais passam por allowlist no construtor de eventos.

## Aplicação da migration e validação

A migration `20260926120000_privacy_consent_and_audit_schema.sql` adiciona os campos compatíveis, índices, tabela de aceite, reduz o vencimento de dados antigos e agenda a limpeza horária via Supabase Cron. Executar testes locais não aplica migration no Supabase: antes de publicar, aplicar a migration no ambiente correto e conferir em `cron.job` se `aprendeia-purge-expired-access-logs` ficou agendado.
