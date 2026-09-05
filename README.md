# AprendeIA

Protótipo de uma plataforma de reforço escolar com aprendizagem adaptativa e geração de questões por inteligência artificial.

## Tecnologias

- Frontend: React, TypeScript e Vite
- Backend: Python e FastAPI
- Inteligência artificial: OpenAI Responses API
- Persistência planejada: PostgreSQL

## Funcionalidades atuais

- Login demonstrativo com acesso aos perfis de estudante, professor e administradora.
- Perfil do estudante com matérias, progresso, aulas restantes e dificuldades.
- Área de prática com questões, correção e explicações.
- Perfil do professor com acompanhamento demonstrativo por estudante.
- Perfil da administradora com inclusão local de estudantes e professores.
- API para gerar, listar, selecionar e corrigir questões.
- Ajuste do nível entre básico, intermediário e avançado conforme os acertos.

## Estrutura

```text
AprendeIA/
├── backend/
│   ├── .env.example
│   ├── main.py
│   └── requirements.txt
├── frontend/
│   ├── src/
│   ├── index.html
│   ├── package.json
│   ├── package-lock.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── .gitignore
└── README.md
```

## Executar o frontend

Requer Node.js compatível com a versão registrada no `package-lock.json`.

```bash
cd frontend
npm ci
npm run dev
```

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
```

Nunca publique o arquivo `.env` ou uma chave real. A documentação interativa da API ficará em `http://localhost:8000/docs`.

## Endpoints principais

| Método | Endpoint | Finalidade |
| --- | --- | --- |
| `GET` | `/health` | Verifica o backend e a configuração da IA |
| `POST` | `/auth/login` | Login demonstrativo |
| `POST` | `/auth/register` | Cadastro demonstrativo |
| `GET` | `/question-bank` | Lista questões em memória |
| `POST` | `/question-bank/generate` | Gera uma questão com a OpenAI |
| `GET` | `/question-bank/next` | Seleciona a próxima questão |
| `POST` | `/question-bank/{question_id}/answer` | Corrige e atualiza o desempenho |

## Estado do protótipo

Os dados ainda ficam em memória e são apagados quando o backend reinicia. O login e os cargos são demonstrativos; ainda faltam autenticação JWT real, autorização por perfil, persistência no PostgreSQL e limites de uso da API.

Questões geradas por IA devem passar por validação pedagógica antes do uso com estudantes reais.
