# Testes do projeto

## Backend

Na raiz do repositório:

```powershell
.\backend\.venv\Scripts\python.exe -m unittest discover -s backend -v
```

A suíte atual possui 52 testes, incluindo verificações específicas da auditoria, e cobre:

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

A personalização também possui testes de backend para impedir valores visuais arbitrários, restringir a rota ao estudante e recusar insígnias ainda não conquistadas.

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
