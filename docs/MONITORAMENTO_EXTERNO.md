# Monitor externo RF32

O workflow `.github/workflows/external-monitor.yml` executa em runner GitHub-hosted com Node 22, sem dependências npm. O cron `*/5 * * * *` solicita uma execução a cada cinco minutos. Cada job tem limite de três minutos e permite disparo manual por `workflow_dispatch`.

## Configuração

Em Settings > Secrets and variables > Actions > Variables do repositório, defina:

| Variável | Valor esperado |
| --- | --- |
| `MONITOR_FRONTEND_URL` | URL HTTPS da página pública do AprendeIA |
| `MONITOR_API_URL` | Base HTTPS da API, com eventual prefixo `/api`, sem `/health/ready` |
| `MONITOR_MAX_LATENCY_MS` | Opcional: limite inteiro de 100 a 9000 ms. Padrão: 5000 ms |

Não há endereço padrão. Variável ausente ou inválida gera falha `configuration`, saída diferente de zero e alerta do serviço correspondente. As URLs não podem conter credenciais, query ou fragmento. O monitor acrescenta `/health/ready` à base da API. A URL do frontend é consultada como foi definida.

O token efêmero `github.token` recebe `contents: read` e `issues: write`. Habilite Issues no repositório e confirme que a política da organização permite escrita por Actions. Não cadastre credenciais dos serviços: as probes são públicas, sem Authorization ou cookies. Redirecionamentos das probes são rejeitados; a API GitHub também não segue redirecionamentos com o token.

## Critérios de resposta

O backend precisa responder HTTP 2xx, `application/json`, `status: "ready"` e `service: "aprendeIA"`, conforme `readiness()` em `backend/main.py`. Os campos de configuração de IA e CAPTCHA não condicionam esse critério. O endpoint atual consulta tabelas do banco; a resposta não comprova o funcionamento de todos os recursos do produto.

O frontend precisa responder HTTP 2xx e `text/html`, com título AprendeIA, `div` de id `root` e script de módulo. Comentários e conteúdo de scripts não comprovam o elemento root. Títulos comuns de proteção ou autenticação externa e campos de senha invalidam a resposta. Um HTTP 200 genérico falha. Essa checagem do HTML inicial não executa JavaScript nem valida navegação autenticada.

Cada tentativa tem prazo de dez segundos para conexão e leitura; a leitura aceita até 256 KiB. Uma resposta válida que demora mais que `MONITOR_MAX_LATENCY_MS` recebe motivo `latency`. Um HTTP 503 demorado mantém o motivo `http`. Limite inválido gera `configuration`, sem consulta aos serviços.

Falha ou lentidão recebe uma segunda tentativa após um segundo. Se ela responder corretamente dentro do limite, o resultado fica saudável. Configuração inválida dispensa repetição. Os dois serviços são checados em paralelo; uma verificação pode levar cerca de 21 segundos antes da comunicação com o GitHub.

O relatório registra apenas o nome fixo do serviço, resultado, código HTTP, latência e número de tentativas. Quando há lentidão, registra também o limite configurado. Um `x-request-id` entra no relatório somente quando tem formato UUID com versão e variante válidas. URLs, caminhos, queries e corpos HTTP não entram nos logs ou issues. Erros externos recebem mensagens fixas.

## Alertas e recuperação

Após a confirmação, o monitor cria uma issue com categoria Configuração, Lentidão ou Indisponibilidade, nome do serviço e marcador estável no corpo: `<!-- aprendeia-rf32:frontend:v1 -->` ou `<!-- aprendeia-rf32:api:v1 -->`. Falhas com o mesmo motivo e código HTTP mantêm a issue sem comentários ou atualizações. Mudanças nesses campos atualizam o registro. Variações de latência e request-id não provocam atualizações repetidas.

A primeira resposta válida dentro do limite de latência fecha os registros abertos com o marcador do serviço e autoria de `github-actions[bot]`. Marcadores copiados por outras pessoas não recebem alterações do monitor. Preserve esses marcadores para manter a reconciliação. O monitor percorre issues abertas com paginação e falha se atingir o limite de vinte páginas completas, evitando criar alertas sem concluir a busca. A concorrência fixa do workflow serializa os jobs manuais e agendados; mantenha esse workflow como único produtor dos alertas RF32.

Notificações dependem das configurações de cada conta GitHub, da assinatura do repositório ou issue e dos canais escolhidos. Confira essas opções com as pessoas responsáveis. O agendamento roda somente na branch padrão; o checkout manual também aponta para essa branch.

Não existe SLA de cinco minutos. O GitHub pode atrasar ou descartar execuções agendadas conforme a fila e suas políticas; repositórios públicos sem atividade podem ter o agendamento desabilitado. O limite de três minutos se aplica ao job após seu início, sem cobrir o tempo em fila.

## Validação local e ativação

O responsável confirmou em 02/11/2026 que o backend está apenas local. O frontend público já foi identificado, mas a API ainda não tem endereço público para o runner do GitHub. Não ative o workflow com a base da API ausente: ele registraria um problema de configuração em vez de monitorar o backend. A configuração atual exige os dois serviços.

Enquanto o backend permanecer local, mantenha os testes do monitor no CI de qualidade. A ativação do agendamento e dos alertas externos fica pendente da publicação da API e da confirmação de sua rota `/health/ready`. `localhost` em um runner aponta para o próprio runner, não para o computador do desenvolvedor.

Execute `node --test scripts/monitor-production.test.mjs` com Node 22 ou 24. Os testes injetam fetch e cliente GitHub, com servidor HTTP apenas em loopback. Importar o script não inicia o monitor.

Para conferir URLs sem token e sem escrita no GitHub, execute:

```powershell
$env:MONITOR_FRONTEND_URL = 'https://aprendeia-perfil-estudante.dig-mendes-baptista.chatgpt.site/'
$env:MONITOR_API_URL = 'https://sua-api.example'
$env:MONITOR_MAX_LATENCY_MS = '5000'
node scripts/monitor-production.mjs --check-only
```

O frontend acima foi informado pelo responsável e respondeu HTTP 200 com HTML válido na checagem de 02/11/2026. A base da API continua sendo um exemplo: substitua pelo endereço público real. O código de saída é 0 quando ambos os serviços estão saudáveis e 1 quando há falha, lentidão persistente ou configuração inválida. Sem `--check-only`, o script reconcilia issues e exige `GITHUB_REPOSITORY` e `GITHUB_TOKEN`; no Actions, o workflow fornece esses valores. Argumentos desconhecidos interrompem a execução antes das probes.

No domínio informado, `/health/ready` e `/api/health/ready` responderam HTTP 200 com a página HTML do frontend, sem o JSON de prontidão esperado. Isso não confirma uma API nesse domínio. O arquivo público de configuração não forneceu um endereço de API identificável; o bundle mantém referência a `http://localhost:8000`. Não configure esse endereço local no monitor externo.

A ativação remota permanece pendente. Em 02/11/2026, os endereços antigos `aprendeia-web-production.up.railway.app` e `aprendeia-api-production.up.railway.app/health/ready` responderam HTTP 404. O workflow não foi encontrado na `main` remota. A conexão Railway exigiu reautenticação e a consulta Vercel não retornou projeto AprendeIA. Nenhuma issue foi criada nesta verificação.

Para ativar, confirme os endereços públicos atuais, publique os arquivos na branch padrão e configure as variáveis do repositório. Execute um ciclo externo saudável e um incidente controlado com recuperação. Confirme o recebimento das notificações na conta responsável antes de marcar RF-32 como concluído.
