# Auditoria de acessos

## Objetivo

A auditoria registra quando uma funcionalidade protegida é usada, por quem e com qual resultado. Ela ajuda a investigar acessos negados, erros e alterações administrativas sem copiar o conteúdo acadêmico para os logs.

## O que é registrado

- usuário e cargo validados pelo backend;
- ação estável, como `student.lesson.view` ou `admin.users.create`;
- método e template da rota, sem UUID na URL;
- código HTTP e resultado `success`, `denied` ou `error`;
- identificador da requisição para correlação;
- HMAC da rede, sem armazenar o IP puro;
- data do evento e prazo de expiração.

No login sem sucesso, o e-mail é representado pelo mesmo HMAC usado no limite de tentativas. Senha, token, corpo, query string, resposta da IA e endereço IP puro não são gravados.

## Acesso e retenção

A tabela `access_audit_logs` bloqueia `anon` e `authenticated` com RLS e permissões revogadas. Somente a chave `service_role` do backend grava ou consulta os eventos. A interface de consulta exige `require_role("admin")`, possui limite de requisições e nunca devolve os hashes de rede ou identidade.

Os registros e as evidências detalhadas de aceite expiram em até 7 dias. A migration `20260926120000_privacy_consent_and_audit_schema.sql` reduz também o prazo das linhas antigas e agenda a rotina `purge_expired_access_audit_logs` de hora em hora via Supabase Cron.

## Arquivos principais

- `backend/access_audit.py` — catálogo das ações e montagem segura do evento;
- `backend/main.py` — identificação do ator, middleware e rota administrativa;
- `frontend/src/components/admin/AuditLogPanel.tsx` — filtros e visualização;
- `supabase/migrations/20260920120000_access_audit_logs.sql` — tabela, índices e isolamento;
- `backend/test_access_audit.py` — cobertura das rotas e das regras de privacidade.

## Ordem de publicação

1. Aplicar `20260920120000_access_audit_logs.sql` no Supabase.
2. Publicar o backend.
3. Publicar o frontend.
4. Entrar com aluno, professor e administração e confirmar os eventos no painel.

Se o backend entrar no ar antes da migration, as funcionalidades continuam respondendo e um aviso técnico com `request_id` é enviado ao log operacional, mas o evento de auditoria não será persistido.
