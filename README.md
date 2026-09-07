# AprendeIA

Protótipo de uma plataforma de reforço escolar com aprendizagem adaptativa e geração de questões por inteligência artificial.

## Tecnologias

- Frontend: React, TypeScript e Vite
- Backend: Python e FastAPI
- Inteligência artificial: OpenAI Responses API
- Autenticação e persistência: Supabase Auth e PostgreSQL

## Funcionalidades atuais

- Login real por e-mail e senha com sessão persistida pelo Supabase Auth.
- Autorização por cargo (`student`, `teacher` e `admin`) definida no banco, sem seleção de cargo no login.
- Perfil do estudante com matérias, progresso, aulas restantes e dificuldades.
- Área de prática com questões, correção e explicações.
- Perfil do professor com acompanhamento demonstrativo por estudante.
- Perfil da administradora com inclusão segura de estudantes e professores pelo backend.
- API para gerar, listar, selecionar e corrigir questões.
- Persistência de matérias, módulos, aulas, progresso, questões, tentativas e dificuldades.
- Ajuste do nível entre básico, intermediário e avançado conforme os acertos.
- Políticas RLS que limitam cada usuário aos dados permitidos para seu cargo.

## Estrutura

```text
AprendeIA/
├── backend/
│   ├── .env.example
│   ├── main.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   ├── .env.example
│   ├── index.html
│   ├── package.json
│   ├── package-lock.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── docs/
│   └── ARQUITETURA.md
├── supabase/
│   └── migrations/
├── .gitignore
└── README.md
```

## Como o código está explicado

Os arquivos têm comentários curtos sobre as partes que realmente importam: autenticação, permissões, fluxo das telas e adaptação das questões. A visão geral e o motivo das principais escolhas ficam em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

Arquivos gerados, como `package-lock.json`, não recebem comentários porque isso quebraria o formato. As dependências ficam com versões fixas para o projeto rodar do mesmo jeito em outras máquinas.

## Executar o frontend

Requer Node.js compatível com a versão registrada no `package-lock.json`.

```bash
cd frontend
npm ci
npm run dev
```

Copie `frontend/.env.example` para `frontend/.env.local` e preencha os dados exibidos no painel **Connect** do Supabase:

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_API_URL=http://localhost:8000
```

A chave publicável pode ficar no navegador; sua segurança depende das políticas RLS. Nunca use a chave secreta no frontend.

A interface ficará disponível em `http://localhost:5173`.

Para gerar o build de produção:

```bash
npm run build
```

## Executar o backend

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

Copie `backend/.env.example` para `backend/.env` e configure localmente:

```env
OPENAI_API_KEY=sua_chave_local
OPENAI_MODEL=gpt-5-mini
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
FRONTEND_URL=http://localhost:5173
```

Nunca publique o arquivo `.env` ou uma chave real. A documentação interativa fica desativada para não expor a superfície da API.

## Endpoints principais

| Método | Endpoint | Finalidade |
| --- | --- | --- |
| `GET` | `/health` | Verifica backend, IA e Supabase |
| `GET` | `/question-bank` | Lista questões persistidas |
| `POST` | `/question-bank/generate` | Gera uma questão com a OpenAI |
| `GET` | `/question-bank/next` | Seleciona a próxima questão |
| `POST` | `/question-bank/{question_id}/answer` | Corrige e atualiza o desempenho |
| `GET` | `/student/subjects` | Retorna as matérias do estudante |
| `GET` | `/teacher/students` | Retorna os estudantes vinculados ao professor |
| `POST` | `/admin/users` | Cria estudantes ou professores |

## Preparar o Supabase

1. Crie um projeto no Supabase.
2. Execute, nesta ordem, os arquivos `supabase/migrations/20260905192035_initial_learning_schema.sql` e `supabase/migrations/20260906120000_harden_authorization.sql` no SQL Editor ou aplique-os com a CLI.
3. Crie sua primeira conta pela interface.
4. No SQL Editor, promova somente essa conta inicial:

```sql
update public.profiles
set role = 'admin'
where email = 'seu-email@exemplo.com';
```

5. Saia e entre novamente. A administradora poderá criar as demais contas.

## Estado do protótipo

Sem variáveis do Supabase, o projeto não libera endpoints protegidos nem cargos administrativos; a tela local serve apenas para visualizar o perfil de estudante. Com as variáveis configuradas, autenticação e dados passam a usar o Supabase; cada rota valida o token no backend e o cargo vem do perfil persistido.

Ainda são necessários limites de uso da API, recuperação de senha, testes completos das políticas RLS e validação pedagógica das questões antes de uma implantação real.

Questões geradas por IA devem passar por validação pedagógica antes do uso com estudantes reais.

## Deploy no Railway

Crie dois serviços a partir deste mesmo repositório, cada um com sua própria pasta raiz:

| Serviço | Pasta raiz | Variáveis necessárias |
| --- | --- | --- |
| API | `/backend` | `OPENAI_API_KEY`, `OPENAI_MODEL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `FRONTEND_URL` |
| Interface | `/frontend` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_API_URL` |

Os `Dockerfile`s das duas pastas definem o build e a porta de cada serviço. A interface gera `runtime-config.js` na inicialização; portanto, apenas dados publicáveis podem ser usados nas variáveis `VITE_*`. Depois de gerar o domínio da interface, use-o como valor de `FRONTEND_URL` na API para manter o CORS fechado.
