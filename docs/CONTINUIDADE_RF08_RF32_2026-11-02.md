# Continuidade do RF-08 e RF-32

Data: 02/11/2026. Checkout: `D:\AprendeIA`, branch `entrega-2809`. Este resumo registra a entrega local e pode ser usado para retomar o trabalho em outro chat. O diretório já continha alterações de outras etapas; elas foram preservadas. Não houve commit, push, deploy, aplicação de migration no Supabase ou exclusão de conta real nesta etapa.

## Porcentagens de implementação

| Item | Antes | Agora | Critério e pendência |
| --- | ---: | ---: | --- |
| RF-08: pedidos do titular | 0% | 100% local | Fluxo completo no código e testes HTTP/React/PostgreSQL isolado. Migrações e validação com Auth, Storage e Cron reais pendentes. |
| RF-32: monitoramento externo | 0% | 50% | Monitor, workflow e alertas implementados e testados. Falta publicação na branch padrão, variáveis de URL e comprovação de um ciclo externo. |
| Índice global dos 33 requisitos | 83,3% | 87,9% | 25 itens em 100%, 8 em 50% e nenhum em 0%, com pesos iguais. |

Fórmula: `(25 + 8 × 0,5) / 33 × 100 = 87,9%`. A escala acompanha o levantamento anterior. Ela não mede linhas de código, cobertura de testes, esforço restante ou disponibilidade de produção. RF-04, RF-05, RF-07, RF-22, RF-25, RF-29, RF-31 e RF-32 permanecem parciais.

## RF-08 entregue

A área Meus dados permite abrir pedidos de acesso, correção de perfil, exclusão ou anonimização, acompanhar o protocolo e cancelar enquanto o pedido estiver pendente. O acesso aprovado libera um JSON dos dados da própria conta. A área aparece também antes do aceite vigente, mas continua exigindo autenticação.

O painel administrativo recebe os pedidos e permite concluir ou recusar com resposta. Pedidos próprios não podem ser revisados pela mesma pessoa. Exclusão exige a confirmação `EXCLUIR`; anonimização exige `ANONIMIZAR`. Contas administrativas têm encerramento bloqueado neste fluxo, para tratamento institucional específico.

A execução no banco confere cargo, dono, estado e expiração na mesma transação. Chaves públicas não consultam a tabela nem executam as RPCs. Correções aceitam apenas nome, etapa escolar e objetivo. A exclusão encerra a conta e remove o histórico identificável; a anonimização também encerra a conta, conservando apenas somas privadas globais sem identidade individual. A remoção de uma conta docente preserva o progresso dos estudantes. Arquivos no Storage bloqueiam a execução para atendimento assistido.

Pedidos e respostas detalhados expiram em seis dias com limpeza horária. O exportador pagina os dados e retorna erro explícito acima de 10 mil linhas por conjunto, em vez de produzir uma cópia incompleta. Todas as novas rotas têm nomes de ação no catálogo de auditoria, sem registrar detalhes livres ou o conteúdo exportado.

Arquivos principais:

- `backend/privacy_requests.py` e `backend/test_privacy_requests.py`.
- `backend/main.py` e `backend/access_audit.py`, integração e políticas de limite.
- `frontend/src/components/PrivacyRequests.tsx` e seu teste.
- `frontend/src/App.tsx` e `frontend/src/index.css`, acesso aos painéis.
- `supabase/migrations/20261102120000_privacy_requests.sql`.
- `docs/PEDIDOS_DE_PRIVACIDADE.md`.

O checkout também passou a conter a política 1.2 alinhada em frontend, backend e `20261102130000_privacy_policy_v1_2.sql`. A testagem final incluiu essa revisão e as alterações de segurança que estavam em andamento. Isso não preenche automaticamente a identificação do controlador, o canal institucional, a retenção acadêmica ou o procedimento de responsáveis por menores, que continuam no RF-07.

## RF-32 entregue

O monitor consulta o HTML inicial do frontend e `/health/ready` da API a partir de um runner externo do GitHub Actions. Há limites de tempo e de corpo, rejeição de redirects e verificação de conteúdo; um HTTP 200 genérico não comprova saúde. Logs e alertas contêm somente alias do serviço, código, motivo e latência, com request-id válido quando disponível.

Uma falha cria uma issue do serviço. Repetições iguais ficam quietas; mudança de estado atualiza o alerta; recuperação fecha a issue. O monitor modifica somente registros de autoria de `github-actions[bot]`, com marcador próprio. O token efêmero do GitHub é enviado apenas à API fixa do GitHub, nunca às probes públicas.

Arquivos: `scripts/monitor-production.mjs`, `scripts/monitor-production.test.mjs`, `.github/workflows/external-monitor.yml` e `docs/MONITORAMENTO_EXTERNO.md`. O cron solicita execução a cada cinco minutos; filas e políticas do GitHub podem atrasar ou desabilitar execuções. Notificações dependem das preferências da conta responsável.

## Verificação final

| Verificação | Resultado observado |
| --- | --- |
| Suíte Python atual | 96 testes passaram. |
| React/Vitest | 22 testes passaram em 5 arquivos. |
| Monitor | 17 testes passaram; a versão final também foi testada no Node 22. |
| SQL da aplicação em PostgreSQL WASM | 19 cenários passaram. |
| Playwright | 4 execuções passaram, dois cenários de autenticação visual em desktop/mobile. |
| TypeScript e Vite | Build passou; permanece aviso de JavaScript principal acima de 500 kB, em cerca de 647 kB. |
| Bandit | Sem achados nos módulos Python da aplicação examinados. |

Os 19 cenários SQL aplicam as migrations reais em PostgreSQL isolado. Auth, Storage, Cron e `rls_auto_enable` têm estruturas mínimas de teste; não são os serviços Supabase reais. A suíte confere decisões repetidas, isolamento, correções, exclusão, anonimização, expiração, Storage e remoção docente sem apagar progresso alheio. Isso não comprova o agendador nem revogação em todos os serviços hospedados.

O CI de qualidade recebeu o job `privacy-database` e os testes do monitor. O deploy condicional agora espera também o job do banco isolado. O pacote de validação usa `scripts/validation/package.json` e lockfile próprios; PGlite não entra no frontend nem no runtime FastAPI. Seu `node_modules` está ignorado.

Comandos para repetir:

```powershell
cd D:\AprendeIA
.\backend\.venv\Scripts\python.exe -m unittest discover -s backend -q
node --test scripts/monitor-production.test.mjs
npm ci --prefix scripts/validation
npm test --prefix scripts/validation
cd frontend
npm run test:run
npm run build
npm run test:e2e
```

## Próxima etapa

### Continuação do monitor e alertas, 02/11/2026

O monitor recebeu confirmação de falha com até duas tentativas e intervalo de um segundo. Resposta válida acima de 5000 ms gera alerta de lentidão; `MONITOR_MAX_LATENCY_MS` ajusta o limite entre 100 e 9000 ms. HTTP inválido conserva sua causa original. A recuperação exige resposta válida dentro do limite. As categorias Configuração, Lentidão e Indisponibilidade compartilham a mesma issue de cada serviço; repetições iguais seguem sem novas notificações.

O comando `node scripts/monitor-production.mjs --check-only` confere os serviços sem token e sem consultar ou escrever issues. A saída conserva somente campos permitidos, incluindo tentativas e limite de latência quando pertinente. O workflow recebeu a variável opcional do limite.

Verificação desta continuação: **27 de 27 testes do monitor passaram no Node 22**, o YAML foi lido sem erro e `git diff --check` passou. Os testes cobrem falhas transitórias, lentidão, troca de categoria, recuperação e execução sem notificações. As suítes Python, React, SQL e Playwright listadas acima pertencem à etapa anterior e não foram repetidas para esta mudança restrita ao monitor.

Na consulta externa desta etapa, o frontend antigo do Railway e `/health/ready` da API antiga retornaram HTTP 404. O workflow não foi encontrado na `main` remota, a conexão Railway pediu reautenticação e a busca Vercel não retornou projeto AprendeIA. Os endereços atuais foram solicitados ao responsável. Nenhuma issue, publicação ou variável remota foi criada. **RF-32 permanece em 50% e o índice global em 87,9%**, aguardando ativação comprovada.

### Pendências de publicação

O responsável confirmou depois que o backend está apenas local. Não há URL pública de API a cadastrar neste momento. O workflow externo exige frontend e API; sua ativação deve aguardar a publicação do backend. Os testes locais continuam disponíveis. RF-32 permanece em 50%, sem novos alertas remotos ou publicação nesta etapa.

O responsável informou `https://aprendeia-perfil-estudante.dig-mendes-baptista.chatgpt.site/`. A probe do frontend passou com HTTP 200 e latência de 146 ms nesta consulta. As rotas `/health/ready` e `/api/health/ready` nesse domínio retornaram HTML da aplicação, não o JSON de saúde. A configuração pública não revelou uma base de API e o bundle conserva referência a `http://localhost:8000`. Frontend confirmado; API pública e ativação do workflow seguem pendentes. A verificação foi somente de leitura, sem login, criação de alertas ou alteração remota.

1. Conferir a sequência de migrations pendentes no Supabase de homologação. Aplicar pedidos e depois a política 1.2, sem anunciar isso como realizado apenas porque o SQL passou localmente.
2. Com contas descartáveis, confirmar cadastro/aceite 1.2, exportação, correção e encerramento, incluindo sessões e eventuais arquivos reais. Conferir o Cron e a limpeza dos pedidos.
3. Publicar o monitor na branch padrão e configurar `MONITOR_FRONTEND_URL` e `MONITOR_API_URL` como variáveis do repositório. Confirmar Issues e permissões de Actions.
4. Executar um ciclo externo saudável, um incidente controlado e a recuperação. Conferir se a pessoa responsável recebe a notificação configurada.
5. Atualizar RF-32 para 100% somente depois dessa evidência. Com os outros itens mantidos, isso levaria o índice a 89,4%.

As saídas Graphify e credenciais locais continuam fora desta entrega. Não houve instalação ou geração de grafo pelo graft: faltavam comando, servidor MCP e índice nesse checkout. A skill foi lida, e a análise seguiu pelos arquivos. A ponytail-gain exibiu apenas seu benchmark publicado, sem atribuir economia medida a este repositório.
