# 🎓 AprendeIA

> Aprender no seu ritmo, praticar de verdade e transformar dificuldades em próximos passos. ✨

O **AprendeIA** é um protótipo de plataforma de reforço escolar que combina React, Python e inteligência artificial para criar uma experiência de estudo mais adaptativa. Aqui, cada resposta ajuda o sistema a entender o momento do aluno e sugerir o próximo desafio. 🧠

## 🌱 O que a plataforma faz

- 🔐 Login por e-mail e senha com Supabase Auth e bloqueio após quatro falhas.
- 👩‍🎓 Perfil do estudante com matérias, progresso, aulas restantes e dificuldades.
- 🏆 Jornada gamificada com XP, níveis, sequência de estudos e insígnias por consistência e acertos.
- 🎨 Perfil personalizável com avatar, insígnia conquistada e cor de destaque.
- 🧩 Questões geradas por IA com níveis básico, intermediário e avançado.
- 💡 Correção com explicações para transformar erro em aprendizado.
- 👨‍🏫 Dashboard do professor com turmas, histórico, gráficos, relatórios e conteúdos, sem alterar os dados dos estudantes.
- 🧭 Recomendações pedagógicas geradas por IA a partir de métricas anônimas da disciplina.
- 📬 Alertas de dificuldade por disciplina no painel e por e-mail para o professor responsável.
- 🗓️ Resumo semanal dos alertas ativos, protegido por um segredo interno.
- 🛠️ Área administrativa para cadastrar estudantes e professores.
- ✅ Solicitação de cadastro docente com aprovação da administradora antes de liberar o painel.
- 📈 Ajuste de dificuldade conforme os acertos do aluno.
- 🛡️ Regras de segurança que impedem acesso a dados de outros usuários.

## 🧰 Tecnologias

| Parte do projeto | Ferramentas |
| --- | --- |
| 🎨 Interface | React, TypeScript e Vite |
| ⚙️ API | Python e FastAPI |
| 🤖 IA | OpenAI Responses API |
| 🗃️ Dados e login | Supabase Auth e PostgreSQL |
| 🚂 Publicação | Railway |

## 🗺️ Organização do projeto

```text
AprendeIA/
├── backend/                 # API, autenticação e regras do sistema
│   ├── Dockerfile
│   ├── .env.example
│   ├── main.py
│   └── requirements.txt
├── frontend/                # Telas e experiência de estudo
│   ├── docker-entrypoint.d/
│   ├── src/
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
├── docs/                    # Decisões e arquitetura
├── supabase/migrations/     # Estrutura e permissões do banco
└── README.md
```

## 💬 Código comentado

Os comentários explicam as escolhas que realmente importam: login, permissões, fluxo das telas e adaptação das questões. O índice completo está em [docs/README.md](docs/README.md), e o panorama técnico em [docs/ARQUITETURA.md](docs/ARQUITETURA.md).

A regra de XP, níveis e insígnias está explicada em [docs/GAMIFICACAO.md](docs/GAMIFICACAO.md), e a área docente em [docs/PAINEL_PROFESSOR.md](docs/PAINEL_PROFESSOR.md).

O fluxo de solicitação e aprovação de professores está detalhado em [docs/CADASTRO_PROFESSOR.md](docs/CADASTRO_PROFESSOR.md).

Arquivos gerados automaticamente, como `package-lock.json`, ficam sem comentários para não quebrar seu formato. As versões das dependências continuam fixas para o projeto se comportar igual em outras máquinas.

## 🐳 Rodando com Docker

Precisa só de Docker e de Node.js para o `npx` do Supabase CLI. Não é preciso instalar Python nem aplicar migrations à mão.

```bash
git clone https://github.com/Diogo0202/AprendeIA.git
cd AprendeIA
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
npx supabase start           # Supabase local em Docker, já com todas as migrations
```

O `supabase start` mostra a URL da API e as chaves. Copie-as para os dois arquivos:

| Arquivo | Variável | Valor |
| --- | --- | --- |
| `backend/.env` | `SUPABASE_URL` | `http://host.docker.internal:54321` |
| `backend/.env` | `SUPABASE_SECRET_KEY` | chave secreta exibida |
| `backend/.env` | `SUPABASE_PUBLISHABLE_KEY` | chave publicável exibida |
| `frontend/.env` | `VITE_SUPABASE_URL` | `http://localhost:54321` |
| `frontend/.env` | `VITE_SUPABASE_PUBLISHABLE_KEY` | chave publicável exibida |

```bash
docker compose up --build    # API em http://localhost:8000, interface em http://localhost:8080
```

`VITE_API_URL` e `FRONTEND_URL` já são definidos pelo `docker-compose.yml`. Deixe as variáveis `TURNSTILE_*` vazias para rodar sem CAPTCHA. Se já houver um projeto Supabase hospedado, preencha os dois `.env` com a URL e as chaves dele e rode só o `docker compose up --build`.

## 🚀 Rodando o projeto sem Docker

### 🎨 Frontend

É necessário usar uma versão do Node.js compatível com o `package-lock.json`.

```bash
cd frontend
npm ci
npm run dev
```

Crie `frontend/.env.local` a partir de `frontend/.env.example`:

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_API_URL=http://localhost:8000
VITE_ENABLE_CLARITY=false
VITE_CLARITY_PROJECT_ID=
```

Depois, abra `http://localhost:5173`. Para gerar uma versão de produção:

```bash
npm run build
```

> A chave publicável do Supabase pode existir no navegador. A chave secreta nunca deve sair do backend. 🔒

### ⚙️ Backend

Requer Python 3.10 ou superior.

```bash
cd backend
python -m venv .venv
```

No Windows PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload
```

Crie `backend/.env` a partir de `backend/.env.example`:

```env
OPENAI_API_KEY=sua_chave_local
OPENAI_MODEL=gpt-5-mini
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
RATE_LIMIT_PEPPER=gere_um_valor_longo_e_aleatorio
TRUSTED_PROXY_CIDRS=
FRONTEND_URL=http://localhost:5173
SMTP_HOST=smtp.seu-provedor.com
SMTP_PORT=465
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_FROM=aprendeia@escola.com
SMTP_USE_SSL=true
WEEKLY_SUMMARY_CRON_SECRET=gere_um_valor_longo_e_aleatorio
```

> Nunca envie `.env` ou uma chave real para o GitHub. A documentação interativa da API fica desativada em produção para reduzir a superfície exposta. 🛡️

## 🔐 Papéis e limites de acesso

| Perfil | Pode fazer | Não pode fazer |
| --- | --- | --- |
| 👩‍🎓 Estudante | Ver o próprio progresso, aulas e questões | Acessar dados de outro aluno ou área administrativa |
| 👨‍🏫 Professor | Consultar estudantes e alertas da própria disciplina | Alterar perfil, progresso ou dificuldades de estudantes; ver outra matéria |
| 🛠️ Administração | Cadastrar usuários e aprovar solicitações de professor, atribuindo a disciplina | Consultar dados pedagógicos ou entrar no modo de professor |

As regras são verificadas na API e também no banco com políticas RLS. Assim, trocar um ID na URL não libera dados de outra pessoa. ✋

## 🧪 Endpoints principais

| Método | Endpoint | Para que serve |
| --- | --- | --- |
| `POST` | `/auth/login` | Autentica e bloqueia a conta após quatro falhas em quinze minutos |
| `GET` | `/health` | Verifica se a API está disponível para um usuário autenticado |
| `GET` | `/question-bank` | Lista questões permitidas ao usuário |
| `POST` | `/question-bank/generate` | Gera uma questão para o professor da disciplina |
| `GET` | `/question-bank/next` | Escolhe a próxima questão do estudante |
| `POST` | `/question-bank/{question_id}/answer` | Corrige uma resposta e atualiza o desempenho |
| `GET` | `/student/subjects` | Mostra as matérias do próprio estudante |
| `GET` | `/student/gamification` | Mostra o XP, nível, sequência e conquistas do próprio estudante |
| `PUT` | `/student/profile-personalization` | Salva avatar, insígnia desbloqueada e tema do próprio estudante |
| `GET` | `/teacher/students` | Mostra estudantes vinculados ao professor |
| `GET` | `/teacher/difficulty-alerts` | Mostra alertas ativos da disciplina do professor |
| `GET/POST` | `/teacher/classes` | Lista ou cria turmas da disciplina atribuída |
| `GET` | `/teacher/classes/{class_id}` | Mostra alunos e evolução de uma turma autorizada |
| `POST/DELETE` | `/teacher/classes/{class_id}/students[/{student_id}]` | Organiza vínculos sem alterar o histórico do aluno |
| `GET` | `/teacher/reports/export` | Exporta o relatório CSV da turma |
| `GET/POST` | `/teacher/contents` | Lista ou cria conteúdos da disciplina |
| `POST` | `/teacher/contents/import` | Importa até 100 conteúdos em CSV ou JSON |
| `POST` | `/teacher/recommendations` | Gera uma orientação pedagógica com métricas anônimas |
| `GET` | `/admin/teacher-requests` | Lista solicitações docentes pendentes para a administração |
| `POST` | `/admin/teacher-requests/{user_id}/approve` | Aprova o professor e vincula sua disciplina em uma transação |
| `POST` | `/admin/users` | Cria estudantes ou professores |
| `POST` | `/internal/weekly-difficulty-summary` | Envia resumo semanal; exige `X-Cron-Secret` |

## 🗃️ Preparando o Supabase

1. Crie um projeto no Supabase.
2. Aplique todas as migrations de `supabase/migrations/` pelo CLI, que respeita a ordem dos arquivos:

   ```bash
   npx supabase link --project-ref <ref-do-projeto>
   npx supabase db push
   ```

   No Supabase local (`npx supabase start`) elas já são aplicadas na subida. Não execute os arquivos um a um no SQL Editor: a lista muda a cada entrega e pular uma migration quebra o login e o `/health/ready`.
3. Crie sua primeira conta pela interface.
4. No SQL Editor, promova somente essa conta inicial:

```sql
update public.profiles
set role = 'admin'
where email = 'seu-email@exemplo.com';
```

5. Saia e entre novamente. Pronto: a conta administrativa poderá cadastrar os demais perfis. 🎉

## 🚂 Publicando no Railway

Crie dois serviços usando este mesmo repositório:

| Serviço | Pasta raiz | Variáveis no Railway |
| --- | --- | --- |
| ⚙️ API | `/backend` | `OPENAI_API_KEY`, `OPENAI_MODEL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `RATE_LIMIT_PEPPER`, `TRUSTED_PROXY_CIDRS`, `FRONTEND_URL`, variáveis SMTP e `WEEKLY_SUMMARY_CRON_SECRET` |
| 🎨 Interface | `/frontend` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_URL`; Clarity opcional com `VITE_ENABLE_CLARITY` e `VITE_CLARITY_PROJECT_ID` |

Os `Dockerfile`s já definem como cada serviço é construído. O frontend monta um `runtime-config.js` quando inicia, então as variáveis `VITE_*` podem ser configuradas no painel do Railway sem entrar no Git.

Quando o Railway gerar a URL da interface, copie-a para `FRONTEND_URL` na API. Isso mantém o CORS fechado apenas para o site do AprendeIA. ✅

O Microsoft Clarity está integrado, mas permanece desligado por padrão. Como a
plataforma pode atender menores de 18 anos, não ative essa telemetria no ambiente
dos estudantes. Em uma demonstração exclusiva para adultos, a ativação ainda
exige consentimento no navegador e todo o conteúdo da aplicação fica mascarado.

Para os alertas, configure o provedor SMTP no serviço da API e agende uma chamada semanal autenticada para o endpoint interno. O passo a passo e as regras de privacidade estão em [docs/ALERTAS_DIFICULDADE.md](docs/ALERTAS_DIFICULDADE.md).

## 🌟 Próximos passos

- Validar as questões com professores antes de usá-las com estudantes reais.
- Criar recuperação de senha e CAPTCHA para cadastro, login e recuperação.
- Expandir os limites de uso conforme as métricas reais do ambiente escolar.
- Fazer testes completos de RLS com contas de cada perfil.
- Adicionar monitoramento de erros e disponibilidade após o deploy.

Feito por um estudante para ajudar outros estudantes a aprender com mais clareza, prática e autonomia. 📚🤖
