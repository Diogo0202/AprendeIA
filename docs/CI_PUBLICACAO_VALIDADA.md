# CI, publicação e rotinas externas

## CI e branch de produção

O workflow `quality-and-deploy.yml` executa os checks em pull requests e pushes para `main`, `entrega-2809` e `entrega1109`. O job `pr-checks` agrega backend, frontend, E2E e validação de banco; configure esse nome como check obrigatório nas regras de PR. Apenas push em `main` segue para a conferência de publicação.

Vercel e Railway devem estar ligados à integração Git com a branch de produção `main`. Depois dos checks, o workflow consulta os provedores e espera até 15 minutos pelo mesmo SHA do push em estado final: `READY` na versão que atende ao domínio produtivo da Vercel e `SUCCESS` no serviço de backend do Railway. O job não inicia publicação. Resposta HTTP 200 sem o SHA e estado esperados não conta como conclusão.

Configuração necessária no GitHub Actions:

- Secrets `VERCEL_TOKEN` e `RAILWAY_TOKEN`.
- Variables `VERCEL_PROJECT_ID`, `VERCEL_PRODUCTION_DOMAIN` (hostname sem esquema), `RAILWAY_BACKEND_SERVICE_ID` e `RAILWAY_ENVIRONMENT_ID`.
- `VERCEL_TEAM_ID` é necessária para projetos Vercel da equipe.

Qualquer item obrigatório ausente causa falha. O arquivo `scripts/verify-deployment.mjs` usa Vercel Deployments REST API e Railway GraphQL `serviceInstance.latestDeployment`; a consulta Railway também exige ausência de erros GraphQL. Nenhum segredo entra nos logs.

Estado informado pelo coordenador nesta execução: Railway responde `UNAUTHORIZED`, Vercel API responde `403` e o CLI não tem credenciais; Supabase foi restaurado e está `ACTIVE_HEALTHY`. A `main` remota está em `c39fff3`, oito commits atrás e um à frente de `entrega1109`. Assim, não há prova de deploy real nesta revisão. Não se usa preview, ping ou resposta de healthcheck como comprovante de publicação; somente os registros de produção com SHA exato dos dois provedores atendem ao verificador.

## Monitor externo

O agendamento continua a cada cinco minutos. O checkout usa `main`; a variável `ENABLE_EXTERNAL_MONITOR` precisa ser `true` para habilitar a consulta. Sem isso, o job fica explicitamente ignorado e não representa monitoramento saudável. Para habilitar, defina também `MONITOR_FRONTEND_URL` e `MONITOR_API_URL` como URLs HTTPS públicas válidas. `MONITOR_MAX_LATENCY_MS` é opcional.

O monitor ativo consulta HTML e JSON de prontidão, abre issues sanitizadas em falhas persistentes, evita duplicatas e fecha incidentes na recuperação. A prévia manual `--check-only` continua disponível sem token nem escrita. O token do GitHub só é passado ao job com permissão `issues: write`. O ensaio de falha controlada ocorre nos testes Node por meio de respostas HTTP simuladas, sem chamadas às URLs públicas. Os casos cobrem serviço inválido, timeout e recuperação.

## Resumo semanal

O resumo roda às segundas-feiras às 11:00 UTC. O checkout usa `main`, e a variável `ENABLE_WEEKLY_SUMMARY` precisa ser `true`. A ativação também exige `WEEKLY_SUMMARY_API_URL` HTTPS e o secret `WEEKLY_SUMMARY_CRON_SECRET`. O disparo usa o cabeçalho `X-Cron-Secret` e não repete requisições cujo resultado possa ser ambíguo.

Monitor e resumo têm grupos de concorrência independentes. Cada rotina é serializada consigo mesma; o envio semanal não impede a verificação de disponibilidade. O banco mantém os claims das entregas.

As duas rotinas permanecem condicionadas às flags `ENABLE_EXTERNAL_MONITOR` e `ENABLE_WEEKLY_SUMMARY`, desligadas até que as URLs públicas tenham sido validadas. Ativar a flag sem URL necessária faz o respectivo script falhar; não ocorre fallback para um endereço presumido.

## Contrato de integração da API

O backend mantém `GET /health/ready`, que deve responder `200 application/json` com `{"status":"ready","service":"aprendeIA"}` para a base definida em `MONITOR_API_URL` (o script acrescenta `/health/ready`). O resumo requer `POST /internal/weekly-difficulty-summary`, autenticação via `X-Cron-Secret` e os campos de resultado que o script valida. O coordenador integrou `backend/main.py` e o agendador reconhece também `provider_accepted`, separado de recebimento. Os contratos ainda precisam de confirmação no serviço publicado.

## Evidência e limite

Os testes Node locais conferem a configuração, respostas simuladas, SHA e estado final. Eles não provam que as integrações Git remotas estão ligadas, que os secrets e variables existem, nem que um deploy foi executado. Essa prova virá do job `deploy` após um push em `main` com acesso configurado aos dois provedores.

A função Python de retenção existe, mas faltam as RPCs de execução e o callback de resumo pré-exclusão. `ACCOUNT_RETENTION_ENABLED` começa em `false`, e a RPC de prévia informa execução desativada. Não habilitar até completar e validar esse contrato.
