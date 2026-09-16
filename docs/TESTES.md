# Testes do projeto

## Backend

Na raiz do repositório:

```powershell
.\backend\.venv\Scripts\python.exe -m unittest discover -s backend -v
```

A suíte atual possui 39 testes e cobre:

- fronteiras de aluno, professor e administração;
- ausência de configuração do Supabase;
- validação de campos enviados à IA;
- ocultação do gabarito;
- gamificação e sequência de estudo;
- criação de alertas e segredo do resumo semanal;
- gráficos, importação de conteúdo e exportação CSV;
- bloqueio na quarta falha de login;
- limite de quatro autenticações mesmo em uma rajada paralela;
- normalização e HMAC do e-mail;
- proxy confiável e tentativa de falsificar IP;
- login correto e limpeza do contador da conta.
- cabeçalhos de segurança em respostas da API;
- limite por usuário com `Retry-After`;
- revogação de acesso direto ao gabarito, tentativas e progresso.

## Frontend

```powershell
cd D:\AprendeIA\frontend
npm run build
```

O comando executa a checagem TypeScript e o build de produção do Vite.

A personalização também possui testes de backend para impedir valores visuais arbitrários, restringir a rota ao estudante e recusar insígnias ainda não conquistadas.

## Auditoria de dependências e código

```powershell
cd D:\AprendeIA\frontend
npm audit

cd D:\AprendeIA
.\backend\.venv\Scripts\python.exe -m pip_audit -r backend\requirements.txt
.\backend\.venv\Scripts\python.exe -m bandit backend\main.py backend\auth_security.py backend\difficulty_alerts.py backend\gamification.py backend\teacher_dashboard.py
```

Na revisão de 15/09/2026, `npm audit` e `pip-audit` não encontraram vulnerabilidades conhecidas. O Bandit não encontrou achados médios ou altos no código de produção.

## Banco

As migrations foram verificadas com transações que:

1. registraram quatro falhas para um hash sintético;
2. reservaram quatro tentativas antes da autenticação;
3. bloquearam a quinta reserva;
4. confirmaram `retry_after_seconds > 0`;
5. fizeram rollback, sem manter registros de teste.

## Ainda recomendado

- Testes E2E no navegador com Supabase real.
- Testes simultâneos para várias requisições de login.
- Teste de entrega SMTP em uma caixa de e-mail própria.
- Teste de deploy no Railway após configurar o novo segredo.
- Varredura dinâmica com Strix quando o Docker estiver disponível.
