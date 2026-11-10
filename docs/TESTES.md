# Testes do projeto

## Backend

Na raiz do repositório:

```powershell
.\backend\.venv\Scripts\python.exe -m unittest discover -s backend -v
```

A suíte atual possui 77 testes Python, incluindo verificações específicas da auditoria, e cobre:

- fronteiras de aluno, professor e administração;
- ausência de configuração do Supabase;
- validação de campos enviados à IA;
- ocultação do gabarito;
- gamificação e sequência de estudo;
- criação de alertas e segredo do resumo semanal;
- gráficos, importação de conteúdo e exportação CSV;
- bloqueio na quinta falha de login por cinco minutos;
- limite de cinco autenticações mesmo em uma rajada paralela;
- duplicação do bloqueio nas novas rodadas de falhas, limitada a 24 horas;
- normalização e HMAC do e-mail;
- proxy confiável e tentativa de falsificar IP;
- login correto e limpeza do contador da conta.
- cabeçalhos de segurança em respostas da API;
- limite por usuário com `Retry-After`;
- revogação de acesso direto ao gabarito, tentativas e progresso.
- validação do Turnstile quando configurado;
- classificação de domínio por tópico e recomendações de aula;
- rotas protegidas da jornada e da administração;
- bloqueio direto das tabelas de diagnóstico pela chave pública.
- catálogo completo de ações auditadas para todas as rotas protegidas;
- ausência de token, payload, query e IP puro no registro;
- separação entre acesso bloqueado e erro da aplicação;
- consulta da auditoria restrita à administração;
- migration de auditoria sem permissão de atualização.

## Frontend

```powershell
cd D:\AprendeIA\frontend
npm run build
npm run test:run
npm run test:e2e
```

O build executa a checagem TypeScript e gera o pacote de produção do Vite. O Vitest cobre componentes e o Playwright percorre login, recuperação e cadastro em desktop e mobile.

A personalização também possui testes de backend para impedir valores visuais arbitrários, restringir a rota ao estudante e recusar insígnias ainda não conquistadas. A suíte Vitest possui 8 testes distribuídos em 4 arquivos.

## Auditoria de dependências e código

```powershell
cd D:\AprendeIA\frontend
npm audit

cd D:\AprendeIA
.\backend\.venv\Scripts\python.exe -m pip_audit -r backend\requirements.txt
.\backend\.venv\Scripts\python.exe -m bandit backend\main.py backend\access_audit.py backend\auth_security.py backend\difficulty_alerts.py backend\gamification.py backend\teacher_dashboard.py
```

Na revisão de 20/09/2026, a instalação dos novos pacotes frontend informou zero vulnerabilidades conhecidas. As verificações finais devem repetir `npm audit`, `pip-audit` e Bandit antes do deploy.

## Banco

As migrations foram verificadas com transações que:

1. registraram cinco falhas para um hash sintético;
2. reservaram cinco tentativas antes da autenticação;
3. bloquearam a sexta reserva e validaram a regra progressiva;
4. confirmaram `retry_after_seconds > 0`;
5. fizeram rollback, sem manter registros de teste.

## Ainda recomendado

- Testes E2E da jornada completa com um projeto Supabase de homologação.
- Testes simultâneos para várias requisições de login.
- Teste de entrega SMTP em uma caixa de e-mail própria.
- Teste de deploy no Railway após configurar o novo segredo.
- Varredura dinâmica com Strix quando o Docker estiver disponível.

## Atualização de comunicação — 24/09/2026

- 69 testes Python passaram, incluindo matriz de cargos, proteção de prompt, auditoria das rotas e permissões da migration.
- 5 testes React passaram, incluindo o centro de comunicação e o novo dock.
- O build TypeScript/Vite de produção passou.
- O Vite manteve um aviso não bloqueante: o bundle principal supera 500 kB e pode ser dividido em uma refatoração posterior.
- A migration nova foi validada como arquivo, mas não foi aplicada remotamente nesta etapa.

## Verificação de privacidade e auditoria — 06/10/2026

- Os testes da API conferem os eventos `UPDATE_PROFILE` e `SEND_WEEKLY_SUMMARY`, a lista permitida de metadados do resumo e a versão de aceite 1.1.
- Os testes do modal verificam a data vigente, o aviso de uso da IA, os direitos de exclusão e anonimização e o aviso a respeito de dados de menores.
- A migration `20261006120000_profile_and_weekly_summary_audit.sql` foi criada e deve ser aplicada primeiro em homologação. Nenhuma alteração remota do banco foi feita nesta etapa.

## Política de Privacidade 1.2 — 02/11/2026

- A versão exigida passou de 1.1 para 1.2 com a migration `20261102130000_privacy_policy_v1_2.sql`.
- `backend/test_access_audit.py` confere que a migration exige 1.2, que `POST /privacy/accept` recusa 1.0 e 1.1 e que documento e modal declaram a mesma versão.
- `scripts/validation/privacy-database.mjs` cria contas pelo gatilho com a versão 1.2 depois de aplicar todas as migrations.
- Resultado final desta etapa: 96 testes Python, 22 Vitest, 17 testes do monitor, 19 cenários SQL e 4 execuções Playwright passaram. O build e o Bandit passaram. Nenhuma migration foi aplicada no Supabase remoto.

## Preferências de notificação — 03/11/2026

- `backend/test_notification_preferences.py` (10 testes):
  - a rota grava só no perfil da sessão e recusa campo extra, escolha omitida e estudantes;
  - o alerta continua no painel quando o e-mail imediato está desligado;
  - o resumo semanal pula quem desligou, sem contar falha;
  - a migration mantém o envio como padrão e libera o evento `UPDATE_NOTIFICATION_PREFERENCES`.
- `NotificationPreferences.test.tsx` (3 testes): carrega e salva as duas escolhas, bloqueia o envio quando a leitura falha e não chama a API sem Supabase.
- Resultado: 106 testes Python, 25 Vitest, build e 19 cenários SQL passaram; o PostgreSQL isolado aplica a nova migration. Nenhuma migration foi aplicada no Supabase remoto.

## Agendamento do resumo semanal — 03/11/2026

```powershell
node --test scripts/trigger-weekly-summary.test.mjs
```

- Testes sem rede externa (o contrato foi revisado em 04/11/2026):
  - URL montada a partir da base, com HTTPS obrigatório fora de localhost e sem credenciais na URL;
  - segredo só no cabeçalho, nunca na URL nem no relatório, e sem seguir redirects;
  - nenhuma repetição automática: gateway, 503 e perda de rede viram falha única;
  - resultados ambíguos, contrato antigo e contagens inválidas deixam o job vermelho;
  - a resposta remota não injeta texto no comprovante.
- O workflow de qualidade também roda esses testes. O agendamento real não foi executado: depende de merge na branch padrão e do segredo no GitHub.

## Painel administrativo — 04/11/2026

- `backend/test_admin_panel.py` (14 testes):
  - grupos com menos de 3 alunos revelam só o tamanho;
  - acerto e tendência de 4 semanas; tentativas contam só na disciplina da turma; professor soma alunos distintos;
  - rotas de professores, turmas e desempenho, sem nome ou identificador de aluno na resposta; não admin recebe 403;
  - exclusão exige `EXCLUIR` e motivo, recusa a própria conta e outras contas administrativas, envia o hash de identidade e traduz recusas do banco;
  - auditoria guarda só `deleted_role` e `reason`; `/admin/audit-logs` aceita `user_id`.
- `test_communication_rules.py` e `test_communications_security.py`: administração conversa com professor, não com aluno nem com outra administração, e não usa o tutor de IA.
- `scripts/validation/admin-database.mjs` (11 cenários PostgreSQL): chat administração–professor nos dois sentidos, bloqueio com aluno, vínculo pedagógico, recusa por cargo, confirmação, motivo e Storage, exclusão de professor e de aluno, 404 e bloqueio para `anon` e `authenticated`.
- `AdminPanels.test.tsx` (9 testes): sem botão de exclusão para administração, filtro e "Ver atividades", confirmação digitada, recusa do servidor, amostra pequena, filtro por professor, listas, auditoria por usuário e central de mensagens sem tutor de IA.
- Resultado: 174 testes Python, 66 Vitest, build, 32 testes de scripts e os cenários SQL de privacidade e administração passaram. A validação SQL do ciclo de conta falhou por causa da migration `20261106120000_weekly_gamification.sql`, de outra frente de trabalho, cujas três tabelas novas ainda não têm as políticas `rf07_*`.

## Termos e privacidade — 04/11/2026

- `LegalDocuments.test.tsx` (3 testes): a aba abre na Política de Privacidade vigente, alterna para os Termos de Uso 1.0 e lista a LGPD com link oficial, os artigos relacionados e as quatro orientações da ANPD com `rel="noreferrer"`.
- Resultado: 93 testes Vitest em 14 arquivos e o build passaram.
## Aceite dos Termos de Uso — 04/11/2026

- `test_access_audit.py`: `PrivacyPolicyAccept` exige `terms_version` 1.0; conta sem termos recebe 428; a migration `20261108110000_terms_of_use_v1_0.sql` exige os dois aceites, remove a RPC de 2 argumentos e limpa o horário dos termos.
- `scripts/validation/privacy-database.mjs` (5 cenários novos): cadastro sem termos é recusado; versão dos termos fica no perfil, na evidência e na auditoria; conta que só aceitou a política registra os termos; RPC recusa versão errada, não existe sem os termos e não é executada por `authenticated`; limpeza apaga o horário dos termos.
- `App.test.tsx`: o cadastro tem as duas caixas obrigatórias e só a política marcada não libera a conta.
- Resultado: validação SQL de privacidade (24 cenários), ciclo de conta e administração, 103 testes Vitest e build passaram. Falharam um teste Python da política 1.5 e `gamification-database.mjs`, ambos ligados à política 1.6 que outra frente está editando.