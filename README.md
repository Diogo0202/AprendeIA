# 🎓 AprendeIA

> Aprender no seu ritmo, praticar de verdade e transformar dificuldades em próximos passos. ✨

O **AprendeIA** é um protótipo de plataforma de reforço escolar que combina React, Python e inteligência artificial para criar uma experiência de estudo mais adaptativa. Aqui, cada resposta ajuda o sistema a entender o momento do aluno e sugerir o próximo desafio. 🧠

## 🌱 O que a plataforma faz

- 🔐 Login por e-mail e senha com Supabase Auth.
- 👩‍🎓 Perfil do estudante com matérias, progresso, aulas restantes e dificuldades.
- 🧩 Questões geradas por IA com níveis básico, intermediário e avançado.
- 💡 Correção com explicações para transformar erro em aprendizado.
- 👨‍🏫 Painel do professor para acompanhar estudantes vinculados, sem alterar seus dados.
- 📬 Alertas de dificuldade por disciplina no painel e por e-mail para o professor responsável.
- 🗓️ Resumo semanal dos alertas ativos, protegido por um segredo interno.
- 🛠️ Área administrativa para cadastrar estudantes e professores.
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

Os comentários explicam as escolhas que realmente importam: login, permissões, fluxo das telas e adaptação das questões. Para entender o panorama do projeto, veja [docs/ARQUITETURA.md](docs/ARQUITETURA.md).

Para usar modelos locais e dividir tarefas entre IAs, consulte o [guia de modelos Ollama](docs/OLLAMA_MODELOS.md). 🤖

Arquivos gerados automaticamente, como `package-lock.json`, ficam sem comentários para não quebrar seu formato. As versões das dependências continuam fixas para o projeto se comportar igual em outras máquinas.

## 🚀 Rodando o projeto localmente

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
| 🛠️ Administração | Cadastrar estudantes e professores, atribuindo a disciplina do professor | Consultar dados pedagógicos ou entrar no modo de professor |

As regras são verificadas na API e também no banco com políticas RLS. Assim, trocar um ID na URL não libera dados de outra pessoa. ✋

## 🧪 Endpoints principais

| Método | Endpoint | Para que serve |
| --- | --- | --- |
| `GET` | `/health` | Verifica se a API está disponível para um usuário autenticado |
| `GET` | `/question-bank` | Lista questões permitidas ao usuário |
| `POST` | `/question-bank/generate` | Gera uma questão para professor ou administração |
| `GET` | `/question-bank/next` | Escolhe a próxima questão do estudante |
| `POST` | `/question-bank/{question_id}/answer` | Corrige uma resposta e atualiza o desempenho |
| `GET` | `/student/subjects` | Mostra as matérias do próprio estudante |
| `GET` | `/teacher/students` | Mostra estudantes vinculados ao professor |
| `GET` | `/teacher/difficulty-alerts` | Mostra alertas ativos da disciplina do professor |
| `POST` | `/admin/users` | Cria estudantes ou professores |
| `POST` | `/internal/weekly-difficulty-summary` | Envia resumo semanal; exige `X-Cron-Secret` |

## 🗃️ Preparando o Supabase

1. Crie um projeto no Supabase.
2. Execute, nesta ordem, as migrations:
   - `supabase/migrations/20260905192035_initial_learning_schema.sql`
   - `supabase/migrations/20260906120000_harden_authorization.sql`
   - `supabase/migrations/20260908150000_teacher_subject_alerts.sql`
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
| ⚙️ API | `/backend` | `OPENAI_API_KEY`, `OPENAI_MODEL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `FRONTEND_URL`, variáveis SMTP e `WEEKLY_SUMMARY_CRON_SECRET` |
| 🎨 Interface | `/frontend` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_URL` |

Os `Dockerfile`s já definem como cada serviço é construído. O frontend monta um `runtime-config.js` quando inicia, então as variáveis `VITE_*` podem ser configuradas no painel do Railway sem entrar no Git.

Quando o Railway gerar a URL da interface, copie-a para `FRONTEND_URL` na API. Isso mantém o CORS fechado apenas para o site do AprendeIA. ✅

Para os alertas, configure o provedor SMTP no serviço da API e agende uma chamada semanal autenticada para o endpoint interno. O passo a passo e as regras de privacidade estão em [docs/ALERTAS_DIFICULDADE.md](docs/ALERTAS_DIFICULDADE.md).

## 🌟 Próximos passos

- Validar as questões com professores antes de usá-las com estudantes reais.
- Criar recuperação de senha e limites de uso da API.
- Fazer testes completos de RLS com contas de cada perfil.
- Adicionar monitoramento de erros e disponibilidade após o deploy.

Feito por um estudante para ajudar outros estudantes a aprender com mais clareza, prática e autonomia. 📚🤖
