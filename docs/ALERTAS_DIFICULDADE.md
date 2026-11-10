# Alertas de dificuldade 📬

## O que acontece quando o aluno responde

O AprendeIA guarda cada tentativa e calcula o desempenho por **tópico dentro da disciplina**. Depois de pelo menos três tentativas, se o aproveitamento ficar abaixo de 60%, o backend abre um alerta.

O alerta aparece no painel do professor responsável por aquela disciplina e tenta enviar um e-mail imediato. Se o provedor de e-mail estiver fora do ar, a atividade do aluno continua salva e o alerta permanece no painel.

Quando o desempenho volta a 60% ou mais, o alerta é marcado como resolvido.

## Quem vê o quê

| Perfil | Acesso aos alertas |
| --- | --- |
| Estudante | Não vê os alertas do professor; vê apenas o próprio acompanhamento. |
| Professor | Vê apenas estudantes, tentativas, progresso e alertas da sua disciplina. Não edita esses dados. |
| Administradora | Cria estudantes e professores. Ao criar professor, escolhe uma disciplina ainda sem professor. |

A relação `teacher_subjects` é exclusiva neste MVP: uma disciplina tem um professor e cada professor fica ligado a uma disciplina. As políticas RLS do Supabase e as consultas do FastAPI repetem essa regra.

## Senhas e e-mail

- Senhas de usuários são tratadas pelo Supabase Auth com hash; não existem em tabelas do projeto.
- `SMTP_PASSWORD` não é salva no banco. Ela entra apenas como variável secreta do serviço da API no Railway.
- O envio usa SSL direto (`SMTP_USE_SSL=true`, normalmente porta 465) ou STARTTLS (`SMTP_USE_SSL=false`, normalmente porta 587).

## Configuração no Railway

No serviço **API** (`/backend`), configure estas variáveis privadas:

```text
SMTP_HOST
SMTP_PORT
SMTP_USERNAME
SMTP_PASSWORD
SMTP_FROM
SMTP_USE_SSL
WEEKLY_SUMMARY_CRON_SECRET
```

Use um endereço remetente permitido pelo seu provedor SMTP. Não coloque nenhum desses valores no frontend, no README público ou no Supabase.

Antes do envio real, autentique o domínio do remetente com SPF, DKIM e DMARC. Comece o DMARC em modo de monitoramento e só endureça a política depois de confirmar que os e-mails legítimos passam na validação. Também acompanhe rejeições e mantenha o volume semanal previsível para proteger a entregabilidade.

## Resumo semanal

O agendamento está versionado em `.github/workflows/weekly-summary.yml`. Ele roda toda segunda-feira às 08:00 de Brasília (11:00 UTC) e também pode ser disparado manualmente em **Actions → Resumo semanal RF22 → Run workflow**. Para ativar:

1. Fazer merge na branch padrão, porque o GitHub só agenda workflows que estão nela.
2. Em **Settings → Secrets and variables → Actions**:
   - **Secret** `WEEKLY_SUMMARY_CRON_SECRET`, com o mesmo valor configurado no Railway;
   - **Variable** `WEEKLY_SUMMARY_API_URL`, com a URL base da API (sem a rota). Se ausente, o workflow usa `MONITOR_API_URL`.
3. Rodar uma vez manualmente e conferir a caixa de entrada de um professor de teste.

O script `scripts/trigger-weekly-summary.mjs` só aceita HTTPS e envia o segredo apenas no cabeçalho. Ele repete uma vez em 502 ou 504 e escreve no resumo do job somente totais: notificados, que desligaram o resumo e falhas. O job fica vermelho quando há falha de entrega, credencial recusada ou configuração ausente; o GitHub avisa por e-mail quem administra o repositório. O histórico do Actions serve de comprovante do agendamento, não da entrega na caixa de entrada.

A chamada é equivalente a:

```text
POST https://SUA-API.up.railway.app/internal/weekly-difficulty-summary
X-Cron-Secret: mesmo valor de WEEKLY_SUMMARY_CRON_SECRET
```

O endpoint não usa sessão do navegador e recusa chamadas sem o segredo. A tabela `weekly_summary_runs` guarda a segunda-feira da semana já processada, impedindo dois resumos na mesma semana.

> Antes de ativar em produção, aplique todas as migrations do diretório `supabase/migrations` no Supabase e faça um teste com uma caixa de e-mail da equipe.
