# Correções da revisão de 10/11/2026

Branch `entrega1109`. As alterações locais que já existiam no início foram preservadas. Esta revisão não criou commit, push ou deploy.

## Checklist dos apontamentos

- [x] Tutor: o histórico é consultado antes da chamada e a pergunta atual entra apenas em `user_request`. Repetições legítimas em trocas anteriores continuam no histórico.
- [x] Tutor: pergunta e resposta são gravadas juntas pela RPC `append_ai_exchange`, depois da resposta validada. A mesma transação atualiza o horário da conversa.
- [x] Tutor: falha do provedor ou resposta inválida não grava a pergunta. Falha de qualquer INSERT desfaz o par inteiro. Falha de persistência responde 503 sem detalhes do banco.
- [x] RPCs: `backend/rpc_errors.py` concentra a tradução de códigos para HTTP. Os módulos fornecem as mensagens permitidas, mantendo fallback 503 e sem publicar o texto externo.
- [x] Versões legais: tabela `legal_document_versions` como fonte central, com metadados atuais 1.7 e 1.0. Não foram editadas migrations históricas nesta revisão.
- [x] Cadastro, aceite e visibilidade da gamificação consultam a fonte central. Um INSERT publica outra vigência sem copiar essas funções.
- [x] API `GET /legal/versions` entrega somente versão e data de vigência, com `Cache-Control: no-store`; fonte ausente falha com 503.
- [x] A interface lê os metadados da API, sem constantes de versão em produção. Antes de cadastrar ou aceitar, consulta novamente e desmarca os aceites se a versão tiver mudado.
- [x] Perfis: leitura direta por `authenticated` limitada a `id = auth.uid()`. Professor e administrador usam a API para consultar terceiros com as permissões respectivas.
- [x] Preservados os acessos do backend por `service_role` e a política separada de UPDATE próprio.

## Banco real

Foram aplicadas somente as três migrations desta revisão:

- `20261110130000_profiles_self_select.sql`;
- `20261110140000_legal_document_versions.sql`;
- `20261110150000_atomic_ai_exchange.sql`.

A conferência no Supabase confirmou a remoção de `profiles_select_subject_authorized`, presença de `profiles_select_own`, fonte central em 1.7/1.0 e RPC atômica instalada. As duas contas existentes foram preservadas. Uma sessão SQL com papel `authenticated` e claim de titular leu apenas o próprio perfil; a transação foi revertida. Isso verifica RLS real, sem alegar uma sessão JWT no navegador ou um teste de professor real via PostgREST.

A migration de exercícios que já estava no checkout antes desta revisão não foi aplicada por esta tarefa.

## Evidências locais

- Python: 246 testes aprovados na suíte completa, incluindo os contratos novos e as mudanças locais preservadas. Depois do ajuste final do aceite, 14 testes focados passaram.
- PostgreSQL isolado: nove suítes aprovadas. Há cenários de rollback do segundo INSERT, ordem do par, isolamento e grants; nove cenários específicos de versões legais; professor ativo da disciplina sem leitura de perfis alheios.
- Frontend: 118 testes aprovados e build TypeScript/Vite concluído, com aviso de bundle de aproximadamente 715 kB antes de gzip. A suíte de navegador passou em 68 cenários na execução conjunta, incluindo metadados 1.8/1.1 e indisponibilidade sem fallback.
- Bandit aprovado na execução da suíte Python.

O PostgreSQL isolado tem Auth, Storage e Cron simulados e uma conexão; não comprova disputa entre conexões. Os testes do tutor simulam OpenAI. Não houve chamada real de IA nesta revisão.

## Publicação de outra versão legal

Após publicar e revisar o texto correspondente, o servidor pode inserir, por exemplo:

```sql
insert into public.legal_document_versions(document_type, version, effective_at)
values ('privacy', '1.8', now());
```

O INSERT muda a vigência e a validação. Ele não escreve um novo texto jurídico: o conteúdo dos documentos continua versionado no frontend e na documentação, e precisa ser preparado antes da publicação dos metadados. As versões da política e dos termos avançam separadamente. A tabela não concede UPDATE ou DELETE à chave da aplicação.

## Limites operacionais

As migrations já estão no banco real; o backend e o frontend precisam ser publicados com o código desta revisão. Os bloqueios de acesso aos provedores descritos no checklist da entrega 1109 continuam separados desta correção. A gravação atômica evita mensagem órfã, mas não é uma promessa de entrega exatamente uma vez se uma resposta HTTP se perder depois do commit.

## Conferência antes do commit

A suíte SQL de gamificação passou em 21 cenários, incluindo recusa de XP após resposta revelada. O teste de evolução fixa os horários das tentativas para evitar empate artificial entre respostas na base isolada. Os 40 testes dos scripts de monitoramento, agendamento e verificação de publicação passaram. A busca por padrões de credenciais não encontrou ocorrências nos arquivos candidatos ao commit.
