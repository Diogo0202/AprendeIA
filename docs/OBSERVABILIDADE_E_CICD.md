# CI/CD e monitoramento

## O que já está automatizado

O workflow `.github/workflows/quality-and-deploy.yml` roda em pull requests e nos pushes da `main` e da `entrega-2809`.

- Backend: instala as dependências, executa todos os testes Python e o Bandit.
- Frontend: executa testes Vitest e o build TypeScript/Vite.
- Jornada no navegador: executa os cenários Playwright em desktop e mobile.
- Deploy: só chama o Railway depois que as três etapas anteriores passam.

O deploy usa os secrets `RAILWAY_BACKEND_DEPLOY_HOOK` e `RAILWAY_FRONTEND_DEPLOY_HOOK`. Sem esses secrets, a etapa informa que o hook está ausente e não publica nada por acidente.

## Monitoramento do backend

O FastAPI agora oferece dois sinais próprios para infraestrutura:

- `GET /health/live`: confirma que o processo está respondendo.
- `GET /health/ready`: confirma que a configuração essencial do banco chegou ao serviço.

As chamadas recebem `X-Request-ID` e geram um log JSON com rota, método, status e tempo em milissegundos. O Railway consegue armazenar esses logs e o mesmo formato pode ser enviado ao Grafana, SigNoz ou outro coletor no próximo passo.

No Railway, configure o healthcheck do backend como `/health/live`. Para um monitor externo, use `/health/ready` e crie um alerta para respostas diferentes de 200 ou latência acima do limite escolhido.

## Ordem segura da publicação

1. Aplicar `supabase/migrations/20260918120000_learning_journey.sql`.
2. Publicar o backend e conferir `/health/live` e `/health/ready`.
3. Configurar Turnstile no Supabase Auth, no backend e no frontend.
4. Publicar o frontend.
5. Executar o cenário de login, diagnóstico, aula e revisão de questão em produção.

Essa ordem é importante porque o backend novo consulta colunas e tabelas criadas pela migration.
