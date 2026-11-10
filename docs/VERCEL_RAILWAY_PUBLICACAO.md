# Publicação do frontend e da API

## Vercel

Crie o projeto Vercel apontando a raiz para `frontend`. O projeto usa Vite com React; mantenha o preset Vite, o comando `npm run build` e a pasta de saída `dist`. A regra em `frontend/vercel.json` encaminha rotas da SPA para `index.html`, para que `/sobre` e as rotas de autenticação abram também após recarregar a página.

Configure a branch de produção como `main`. Pull requests e demais branches podem gerar previews. Configure variáveis próprias para cada contexto. Previews não devem receber credenciais ou chaves de produção.

Configure `VITE_API_URL` com a origem HTTPS pública do serviço FastAPI no Railway, sem caminho `/api` e sem barra final. O navegador chama endpoints diretamente nessa origem, por exemplo `${VITE_API_URL}/auth/login`. O Vercel não encaminha chamadas de API.

As variáveis `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` e `VITE_TURNSTILE_SITE_KEY` são públicas e podem ser compiladas no frontend. Use apenas a chave publishable/anon do Supabase e a chave pública de site do Turnstile. Segredos, `service_role` e chaves privadas ficam no backend ou no painel seguro do serviço que as consome.

O CSP aceita scripts da aplicação e do Turnstile, conexões HTTPS/WSS para a API e Supabase e frames do Turnstile. Ele não libera scripts de GA4 ou Clarity nesta entrega, em linha com RF29 desligada.

## Contrato necessário no Railway/backend

O backend deve estar acessível por HTTPS na origem definida por `VITE_API_URL`, atender os caminhos atuais do frontend sem prefixo adicional `/api` e responder à verificação de prontidão em `GET /health/ready` com JSON indicando estado pronto. O responsável pelo backend deve configurar CORS para permitir a origem exata do domínio de produção Vercel, incluindo esquema e host. Se houver domínio próprio, inclua essa origem separadamente. Inclua origens de preview apenas quando necessárias, com regra restrita aos domínios de preview previstos; não use curinga aberto com credenciais.

Antes de marcar a integração como pronta, confirme a resposta HTTPS de `GET /health/ready`, uma chamada de autenticação e a política CORS a partir da origem real do frontend. A compilação local não comprova disponibilidade da API nem configuração remota.

## Prévia e operação

Para cada preview, defina `VITE_API_URL` e as chaves públicas que apontam ao ambiente de teste correspondente. Configure a lista CORS desse backend para o domínio exato do preview em uso. Não replique variáveis secretas de produção em previews. A configuração Vercel deste repositório não cria projeto, não publica a API e não altera configurações remotas.
