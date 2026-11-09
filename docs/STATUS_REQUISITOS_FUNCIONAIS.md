# Status dos requisitos funcionais do AprendeIA

**Data da revisão:** 09/11/2026 (integração por agentes e migrations no Supabase)
**Branch verificada:** `entrega1109`
**Escopo:** código React/FastAPI, migrations, workflows e documentação do checkout local. A revisão inclui os pedidos de privacidade e o monitor externo; `darkmate/`, ambientes locais, dependências e saídas Graphify ficam fora da contagem funcional.

Este levantamento compara o que o projeto descreve com rotas, telas, regras de negócio, migrations e testes encontrados no checkout. Os percentuais medem a implementação no repositório, não a publicação em produção.

## Como ler os percentuais

| Status | Critério |
| --- | --- |
| **100%** | O fluxo funcional está implementado no código. Testes ou evidências diretas sustentam o status. Configuração externa e publicação são informadas à parte. |
| **50%** | Existe implementação, mas uma parte necessária ou a comprovação operacional específica continua pendente. Não representa metade do esforço de programação. |
| **0%** | Não foi encontrado fluxo funcional no código analisado. A menção em documentação, por si só, não conta como implementação. |

A revisão considera **28 requisitos em 100%**, **8 em 50%** e **0 em 0%**. Com pesos iguais, o índice é `(28 + 8 × 0,5) / 36 × 100 = 88,9%`. O RF-34 foi incluído em 03/11/2026; o RF-35 e o RF-36, em 04/11/2026.

**Código e publicação são medidas diferentes.** Em 09/11/2026, o Supabase `auwwfetxedberounjglo` foi restaurado e está ativo, com 35 migrations aplicadas até a política 1.7 e a proteção de ciclo de conta no envio. As duas contas antigas foram preservadas; a prévia informa execução de retenção desativada. A API Railway e o frontend Vercel ainda não têm deploy desta versão comprovado. As integrações reais de recuperação, CAPTCHA, e-mail e IA seguem pendentes. O índice de 88,9% permanece como indicador de código com a régua desta tabela, não como aprovação produtiva. A política 1.7 esclarece que a limpeza automática não está concluída.

## Requisitos funcionais verificados

| ID | Requisito | Status | Evidência no projeto e pendência |
| --- | --- | ---: | --- |
| RF-01 | Cadastro público de estudante e solicitação de cadastro docente, com aprovação administrativa e disciplina única. | **100%** | `frontend/src/App.tsx`, `backend/main.py`, migration `20260911120000_teacher_registration_workflow.sql` e testes de cadastro/aprovação. A solicitação docente não concede cargo de professor antes da aprovação. |
| RF-02 | Login, sessão e separação das áreas por cargo. | **100%** | `POST /auth/login`, dependências `current_user`/`require_role` em `backend/main.py`, cliente de sessão em `frontend/src/lib/supabase.ts` e migrations de RLS. Testes cobrem tentativas de acesso entre cargos. |
| RF-03 | Limite persistente de tentativas de login, bloqueio progressivo e proteção de requisições paralelas. | **100%** | `backend/auth_security.py`, `backend/main.py` e migrations `20260913143000_login_rate_limit.sql`, `20260913153000_login_attempt_reservation.sql` e `20260921150000_progressive_login_lockout.sql`. Testes incluem concorrência e reincidência. |
| RF-04 | Recuperação e redefinição de senha. | **50%** | Fluxo local de recuperação e redefinição presente em `App.tsx`. Falta evidência verificável do ciclo completo com e-mail, redirect e Supabase real. |
| RF-05 | Verificação Turnstile no cadastro, login e recuperação. | **50%** | Widget e validação em `backend/captcha.py` presentes. O código lê `VITE_TURNSTILE_SITE_KEY` e `TURNSTILE_SECRET_KEY`. Desde 03/11/2026, o login falha fechado em produção sem a chave: responde `503`, e `/health/ready` também fica em `503`. Há 4 testes novos em `backend/test_captcha.py`. Cadastro e recuperação dependem do CAPTCHA ativado no Supabase Auth. A ativação e os três percursos reais ainda precisam de comprovação. |
| RF-06 | Exibir a Política de Privacidade, exigir aceite no cadastro e registrar versão e horário. | **100%** | `PrivacyPolicyAccess.tsx`, `App.tsx`, rota `POST /privacy/accept`, tabelas/funções das migrations `20260926120000_privacy_consent_and_audit_schema.sql` e `20261006120000_profile_and_weekly_summary_audit.sql`. Em 04/11/2026, a versão exigida é a 1.6 (`20261109110000_privacy_policy_v1_6.sql`), sincronizada no documento, no modal, na API e no banco. A caixa da política registra ciência; os Termos de Uso 1.0 têm caixa própria (RF-36). Testes verificam as caixas, a versão vigente, a recusa das anteriores e o bloqueio de contas sem aceite. Nada disso foi aplicado no Supabase remoto. |
| RF-07 | Informar dados tratados, finalidades, retenção, IA e tratamento de dados de menores. | **50%** | Documento, modal, API e migration usam a versão 1.6 (04/11/2026), que separa a ciência da política dos consentimentos opcionais de medição. Controlador e canal de privacidade identificados no documento e no modal em 02/11/2026. A retenção acadêmica, os fornecedores ativos e o procedimento para responsáveis por menores continuam pendentes; o RF-08 não conclui esses pontos. |
| RF-08 | Receber e processar pedidos de acesso, correção, anonimização e exclusão dentro do produto. | **100%** | Implementação local: `PrivacyRequests.tsx`, `backend/privacy_requests.py`, rotas pessoais/administrativas e migration `20261102120000_privacy_requests.sql`. Acesso em JSON, correção, cancelamento, revisão, exclusão e anonimização testados com serviços simulados e PostgreSQL isolado. Desde 04/11/2026 (`20261109120000_extended_privacy_rights.sql`), também há 6 direitos assistidos: confirmação, informação sobre compartilhamento, oposição, revogação, portabilidade e revisão de decisão automatizada. Oposição e revogação exigem confirmar a medida adotada. Aplicação no Supabase e validação real de Auth/Cron pendentes. Ver `docs/PEDIDOS_DE_PRIVACIDADE.md`. |
| RF-09 | Perfil do estudante com avatar, tema de cor, insígnias e escolha de conquista em destaque. | **100%** | `FallbackAvatar.tsx`, `App.tsx`, `backend/gamification.py`, rota `/student/profile-personalization` e migration `20260914183000_student_profile_personalization.sql`. O backend aceita apenas opções permitidas e insígnias desbloqueadas. |
| RF-10 | Carregar disciplinas, módulos e aulas do banco, em vez de depender de catálogo fixo no frontend conectado. | **100%** | `GET /student/subjects` e `student_subject_catalog` em `backend/main.py`; `StudentProfile` consome a API em `frontend/src/App.tsx`. A existência de registros reais no banco depende de carga de dados. |
| RF-11 | Aplicar avaliação diagnóstica no primeiro acesso, guardar respostas e formar um mapa inicial por tópico. | **100%** | Rotas `/student/diagnostic`, `/student/diagnostic/{question_id}/answer` e `/student/diagnostic/complete`, componente `DiagnosticAssessment.tsx`, migration `20260918120000_learning_journey.sql` e testes. Sem questões publicadas, a tela informa que não há avaliação disponível. |
| RF-12 | Selecionar questões por matéria e dificuldade, corrigir respostas e mostrar explicação após a tentativa. | **100%** | Rotas `/question-bank/next` e `/question-bank/{question_id}/answer`, regras em `backend/learning_engine.py` e `main.py`, componente `LessonReader.tsx` e testes que impedem exposição antecipada do gabarito. |
| RF-13 | Gerar questões com IA e permitir revisão, edição e publicação por professor. | **100%** | `frontend/src/components/teacher/QuestionStudio.tsx`; rotas `/question-bank/generate`, `/teacher/questions` e `PATCH /teacher/questions/{question_id}`. A chamada real requer `OPENAI_API_KEY` e `OPENAI_MODEL`. |
| RF-14 | Classificar domínio por tópico e recomendar aulas relacionadas às dificuldades do estudante. | **100%** | `backend/learning_engine.py`, `GET /student/recommendations`, catálogo de aulas em `main.py` e testes de acerto mínimo e prioridade de aula. As recomendações usam conteúdos cadastrados. |
| RF-15 | Exibir aulas reais, registrar progresso e exigir exercícios definidos antes de liberar a conclusão. | **100%** | `LessonReader.tsx`, rotas `/student/lessons/*`, `Checklist.tsx`, migrations `20260918120000_learning_journey.sql` e `20260921120000_lesson_required_exercises.sql`; testes validam cada exercício obrigatório. |
| RF-16 | Calcular pontos, níveis, sequência de estudo e conquistas a partir de atividades registradas. | **100%** | `backend/gamification.py`, rota `/student/gamification`, migration `20260908170000_student_gamification.sql` e testes de XP, sequência e regras das insígnias. |
| RF-17 | Dashboard docente com turmas, alunos, detalhes e gestão dos vínculos sem editar dados acadêmicos. | **100%** | `TeacherProfile` em `frontend/src/App.tsx`; rotas `/teacher/classes*`, tabelas `classes` e `class_students`, migrations `20260909120000_teacher_dashboard.sql` e `20260909211500_post_deploy_hardening.sql`; testes de fronteira entre professor e aluno. |
| RF-18 | Ver histórico individual, evolução por semana e exportar relatório da turma. | **100%** | Rotas `/teacher/classes/{class_id}/students/{student_id}/history` e `/teacher/reports/export`; `backend/teacher_dashboard.py`, gráfico `DifficultyTrend` e teste de neutralização de fórmulas CSV. |
| RF-19 | Criar e importar materiais de aula em CSV/JSON. | **100%** | Rotas `/teacher/contents` e `/teacher/contents/import`, validação em `backend/teacher_dashboard.py` e testes de tipo e limites. A disciplina é definida pela atribuição do professor no servidor. |
| RF-20 | Gerar recomendações pedagógicas para professor usando dados da própria disciplina. | **100%** | `POST /teacher/recommendations`, autorização em `backend/main.py`, remoção de nome/e-mail no contexto e gravação em `pedagogical_recommendations`. A execução com o provedor exige credenciais externas. |
| RF-21 | Detectar dificuldade alta e mostrar alertas no painel do professor responsável pela disciplina. | **100%** | `backend/difficulty_alerts.py`, rota `/teacher/difficulty-alerts`, painel em `TeacherProfile` e testes de mínimo de tentativas, taxa e isolamento por matéria. |
| RF-22 | Enviar alerta imediato e resumo semanal por e-mail ao professor da matéria. | **50%** | Envio SMTP e resumo semanal por disciplina implementados, com segredo e controle de execução. Agendamento versionado em `.github/workflows/weekly-summary.yml` (segundas, 08:00 BRT) com `scripts/trigger-weekly-summary.mjs` e 6 testes (03/11/2026). Continua em 50% até haver merge na branch padrão, o segredo e a URL configurados no GitHub e uma execução com e-mail recebido. Ver `docs/ALERTAS_DIFICULDADE.md`. |
| RF-23 | Área administrativa para usuários, solicitações docentes, disciplinas, módulos, aulas, exercícios obrigatórios e visão geral. | **100%** | `AdminProfile`, `AdminCatalog.tsx`, `AuditLogPanel.tsx` e endpoints `/admin/*` em `backend/main.py`; migrations de cadastro docente, painel e exercícios. As rotas exigem perfil administrador. |
| RF-24 | Mensagens entre aluno e professor autorizado e entre professores, com histórico restrito aos participantes. | **100%** | `CommunicationCenter.tsx`, rotas `/communications/*`, `backend/communication_rules.py` e migration `20260923100000_secure_communications.sql`. As tabelas não liberam acesso direto ao cliente. A migration remota precisa ser confirmada. |
| RF-25 | Tutor de IA para aluno e professor, com separação entre conversa humana e contexto enviado ao modelo. | **50%** | Tutor e isolamento do contexto implementados; há validações e testes locais. Não há nesta revisão evidência de chamada concluída ao provedor real. Em 03/11/2026: `OPENAI_API_KEY` vazio no `backend/.env` local e backend offline no Railway, então ainda não há onde fazer a chamada. |
| RF-26 | Reduzir prompt injection em entradas e conteúdo recuperado, sem dar ferramentas de execução ao modelo. | **100%** | `backend/ai_security.py`, validações em `backend/main.py`, saída estruturada e testes para ataques diretos e indiretos. A defesa reduz o risco, não prova imunidade a toda variação de ataque. |
| RF-27 | Registrar eventos de auditoria, campos pedidos, filtros de consulta e retenção máxima de sete dias. | **100%** | `backend/access_audit.py`, `GET /admin/audit-logs`, `AuditLogPanel.tsx`, migrations `20260920120000_access_audit_logs.sql`, `20260926120000_privacy_consent_and_audit_schema.sql` e `20261006120000_profile_and_weekly_summary_audit.sql`. Inclui os eventos de negócio pedidos. A gravação no ambiente remoto depende das migrations aplicadas. |
| RF-28 | Exibir title, Open Graph, imagem de compartilhamento, schema, sitemap, robots.txt e llms.txt. | **100%** | `frontend/index.html`, `frontend/public/og-aprendeia.png`, `sitemap.xml`, `robots.txt` e `llms.txt`. O sitemap contém apenas a página pública e os caminhos autenticados são bloqueados para indexação. |
| RF-29 | Medição com consentimento: Microsoft Clarity (e, desde 04/11/2026, GA4), com escolha e mascaramento. | **50%** | A integração foi reescrita em `frontend/src/lib/tracking.ts` e `CookieConsent.tsx`; `ClarityConsent.tsx` e `lib/clarity.ts` foram removidos. GA4 e Clarity têm escolhas separadas, desligadas por padrão. Cada um só carrega com flag, aprovação de privacidade e ID válido, e somente na página pública `/sobre`. A revogação ou a saída da página interrompe a coleta. Há testes em `tracking.test.ts` e `e2e/cookie-tracking.spec.ts`. A verificação no navegador de 03/11/2026 cobriu o carregador antigo e não vale para este código. Falta configurar IDs reais no deploy, verificar o novo fluxo no navegador e ver uma sessão real nos painéis. |
| RF-30 | Health checks, logs operacionais estruturados e identificador de requisição. | **100%** | Rotas `/health/live`, `/health/ready`, middleware de `request_id` e log JSON em `backend/main.py`. Isso comprova recursos locais do serviço, não monitor externo. |
| RF-31 | CI para testes, análise Bandit, build frontend, Playwright e acionamento condicional do Railway. | **50%** | Workflow local inclui Python, Bandit, React, Playwright, testes do monitor e PostgreSQL isolado para privacidade. Execução remota comprovada: run [41559133882](https://github.com/Diogo0202/AprendeIA/actions/runs/41559133882), em 03/11/2026, no commit `390ec0c` da `entrega-2809`, com os jobs frontend, backend, e2e e deploy em sucesso. O job de deploy não publica nada: os hooks `RAILWAY_*_DEPLOY_HOOK` não estão configurados, e os serviços `aprendeia-api` e `aprendeia-web` estão offline no Railway desde 06/10/2026 (último deploy em 10/09, do `main`). Falta o deploy desta versão. |
| RF-32 | Monitoramento externo de disponibilidade e alertas operacionais em produção. | **50%** | Monitor implementado em `scripts/monitor-production.mjs` e `.github/workflows/external-monitor.yml`, com probes, alertas por issue e recuperação. Testes locais aprovados. Falta publicar na branch padrão, configurar as duas URLs e comprovar um ciclo externo. Em 03/11/2026, não havia o que monitorar: os dois serviços estavam offline no Railway. Ver `docs/MONITORAMENTO_EXTERNO.md`. |
| RF-33 | Catálogo didático inicial versionado, com disciplinas, módulos, aulas e questões publicados para uma instalação nova. | **100%** | A migration inicial já inclui 3 disciplinas, 3 módulos, 4 aulas e 2 questões. A migration de jornada acrescenta conteúdo e publicação; o teste PostgreSQL isolado aplica a sequência. É um catálogo mínimo, não cobertura de todas as matérias/tópicos. |
| RF-34 | Preferências de notificação: o professor liga ou desliga o alerta imediato e o resumo semanal por e-mail (RF-10 da monografia). | **100%** | `backend/notification_preferences.py`, rotas `GET/PUT /teacher/notification-preferences`, filtro de envio em `synchronize_difficulty_alert` e no resumo semanal, componente `NotificationPreferences.tsx` (aba Relatórios) e migration `20261103120000_notification_preferences.sql`. O padrão mantém os envios; desligar o e-mail não remove o alerta do painel. A mudança gera o evento `UPDATE_NOTIFICATION_PREFERENCES`. Estudantes e administração não recebem e-mails hoje, por isso não têm a opção. A migration precisa ser aplicada antes do deploy do backend. |
| RF-35 | Painel administrativo: desempenho agregado por turma e professor, lista de professores e turmas, histórico de atividades por usuário, exclusão de estudantes e professores e mensagens com professores. | **100%** | `backend/admin_panel.py`, filtro `user_id` em `/admin/audit-logs`, migration `20261105120000_admin_panel.sql`, componentes `admin/AdminPanels.tsx`, `AuditLogPanel.tsx` e `CommunicationCenter.tsx`. Testes: 14 Python, 11 cenários PostgreSQL e 9 Vitest (04/11/2026). Indicadores só em totais, com grupos menores que 3 alunos ocultos; administração não exclui a si mesma nem outras contas administrativas. A Política de Privacidade 1.5 (migration `20261107110000_privacy_policy_v1_5.sql`) descreve o painel e exige novo aceite. Ver `docs/PAINEL_ADMINISTRATIVO.md`. |
| RF-36 | Termos de Uso com aceite obrigatório e aba "Termos e privacidade" para estudantes, professores e administração, com a política, os termos e a LGPD citada. | **100%** | `LegalDocuments.tsx` (aba e modal dos termos), duas caixas obrigatórias no cadastro e no novo aceite, `terms_version` em `POST /privacy/accept`, bloqueio `428` sem os termos e migration `20261108110000_terms_of_use_v1_0.sql` (perfil, evidência, auditoria e limpeza do horário). Testes: 3 Vitest da aba, cadastro em `App.test.tsx`, Python em `test_access_audit.py` e 5 cenários PostgreSQL. Os termos e os resumos da LGPD precisam de validação jurídica. Ver `docs/TERMOS_E_PRIVACIDADE.md`. |

## Entrega de 09/11/2026

- Python: 218 testes aprovados; React: 115 testes aprovados.
- Navegador: 64 cenários aprovados em Chromium desktop e emulação móvel.
- Scripts Node: 40 testes aprovados. Build TypeScript/Vite e Bandit aprovados.
- Seis suítes SQL isoladas aprovadas. SQL real não equivale a Auth, Storage e cron reais.
- Supabase: 25 migrations novas aplicadas sobre as dez antigas; política 1.7 e RLS verificadas por consulta sem dados pessoais.
- Retenção: duas contas vencidas, nenhuma removida; faltam RPCs executoras e callback de resumo pré-exclusão.
- RF-22 agora aceita transporte Resend HTTPS, com deduplicação e estado `provider_accepted`; falta configuração e recebimento reais.
- RF-31 inclui `entrega1109` e verificação do SHA produtivo; falta comprovar o CI remoto do commit final e os deploys.
- RF-32 mantém alertas por issue, flags desativadas até configuração de URLs e teste externo.
- RF-29 permanece desligado por decisão do responsável.

Checklist operacional: [entrega 1109](CHECKLIST_ENTREGA1109.md). Os trechos datados abaixo permanecem como histórico, incluindo contagens e estados que mudaram.

## Resultado das validações locais

### Revalidação de 04/11/2026

| Verificação | Resultado |
| --- | --- |
| Testes Python (`python -m unittest discover backend`) | **204 passaram** |
| Testes React/Vitest (`npm run test:run -- --maxWorkers=1`) | **108 passaram em 15 arquivos**, depois de ajustar `App.test.tsx` ao novo texto da caixa de ciência da política 1.6 |
| Build React/TypeScript (`npm run build`) | **Passou**; continua o aviso de bundle acima de 500 kB |
| Scripts Node (`node --test scripts/*.test.mjs`) | **32 passaram** (monitor externo e resumo semanal) |
| Validação SQL com PGlite (`npm test` em `scripts/validation`) | **Passou**: privacidade e termos (26 cenários), ciclo de conta (RF-07), painel admin (11) e gamificação (20) |
| Playwright e Bandit | Não executados nesta revalidação |
| Supabase remoto | Projeto ativo, com 10 migrations aplicadas até 13/09/2026. As migrations posteriores do repositório não foram aplicadas |
| Railway | `aprendeia-api` e `aprendeia-web` offline |
| Git | Branch `entrega-2809`. Último commit `390ec0c`; todo o trabalho desde então está sem commit |

### Revisão de 02/11/2026

| Verificação | Resultado observado |
| --- | --- |
| Testes Python | **96 passaram** em 02/11/2026, com `python -m unittest discover backend` executado na raiz usando `backend/.venv`. |
| Testes React/Vitest | **22 passaram em 5 arquivos** em 02/11/2026, com `npm run test:run -- --maxWorkers=1`. |
| Validação SQL (RF-08) | **19 cenários passaram** em 02/11/2026, com `npm test` em `scripts/validation` (PGlite). |
| Monitor externo (RF-32) | **17 passaram** em 02/11/2026, com `node --test scripts/monitor-production.test.mjs`. |
| Playwright | **4 passaram** em Chromium desktop e mobile. Os cenários cobrem tela de login/recuperação e escolha aluno/professor no cadastro; não fazem login em Supabase real nem percorrem painel conectado. |
| Build React/TypeScript | **Passou** com `npm run build`. Vite emitiu aviso: o bundle principal fica acima de 500 kB. |
| Estado Git | Branch `entrega-2809`. Existem alterações locais anteriores a este relatório, uma migration nova ainda sem commit e artefatos Graphify não versionados; nada foi enviado ou publicado nesta verificação. |

## Pendências que impedem declarar o produto completo

1. Aplicar no Supabase remoto, em ordem e junto com o deploy do backend e do frontend, todas as migrations posteriores a `20260913153000_login_attempt_reservation.sql`, da `20260914183000` à `20261109120000`. Depois, testar em homologação o cadastro com termos 1.0 e política 1.6, um pedido de cada tipo e o painel admin.
2. Preencher controlador, contato de privacidade, fornecedores ativos e prazo institucional de retenção acadêmica. Definir o procedimento aplicável a menores.
3. Aplicar e validar as migrations pendentes em homologação antes de usar a base real. O checkout não prova o estado do Supabase remoto.
4. Configurar e testar OpenAI, SMTP, segredo do resumo semanal, CAPTCHA, URLs de autenticação e chaves de CI/deploy sem colocar segredos no frontend.
5. Ampliar o catálogo mínimo já incluído nas migrations. Ele ainda não cobre todos os tópicos e disciplinas.
6. Levar o workflow `external-monitor.yml` à branch padrão, definir `MONITOR_FRONTEND_URL` e `MONITOR_API_URL` e confirmar a primeira execução e o recebimento dos alertas.
7. Rodar E2E contra um Supabase de homologação com usuários de cada cargo e testar cadastro, aceite, aula, questão, relatório, auditoria e e-mails.

## Divergências de documentação encontradas

- O `README.md` diz que o login bloqueia após quatro falhas; o backend e os testes aplicam o bloqueio na quinta tentativa dentro da janela descrita em `docs/AUTENTICACAO_E_ACESSO.md`.
- `docs/README.md` declara que seus textos refletem o estado em 20/09/2026. O checkout contém migrations e componentes posteriores, então o índice e os documentos antigos precisam de revisão contínua.

## Limites deste levantamento

O status descreve evidências do checkout local revisado em 02/11/2026. Não confirma configuração do painel Supabase/Railway, execução de migrations remotas, disponibilidade de chaves, conteúdo populado, commit, push ou deploy. O diretório `darkmate/` é um export estático separado, sem ligação encontrada com as rotas do AprendeIA; dependências, build e saídas Graphify também não foram tratados como código funcional do produto.
