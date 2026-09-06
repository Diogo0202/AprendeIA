# 📒AprendeIA👌

Protótipo de uma plataforma de reforço escolar com aprendizagem adaptativa e geração de questões por inteligência artificial.

## 🤖Tecnologias🤖

- Frontend: React, TypeScript e Vite
- Backend: Python e FastAPI
- Inteligência artificial: OpenAI Responses API
- Autenticação e persistência: Supabase Auth e PostgreSQL

## 🤔Funcionalidades atuais🤔

- Login real por e-mail e senha com sessão persistida pelo Supabase Auth.
- 
- Autorização por cargo definida no banco, sem seleção de cargo no login.
- 
- Perfil do estudante com matérias, progresso, aulas restantes e dificuldades.
- Área de prática com questões, correção e explicações.
- 
- Perfil do professor com acompanhamento demonstrativo por estudante.
- Perfil da administradora com inclusão segura de estudantes e professores pelo backend.
- 
- API para gerar, listar, selecionar e corrigir questões.
- 
- Persistência de matérias, módulos, aulas, progresso, questões, tentativas e dificuldades.
- 
- Ajuste do nível entre básico, intermediário e avançado conforme os acertos.
- 
- Políticas RLS que limitam cada usuário aos dados permitidos para seu cargo.

## 👾Executar o frontend👾

Requer Node.js compatível com a versão registrada no `package-lock.json`.

```bash
cd frontend
npm ci
npm run dev
```

Copie `frontend/.env.example` para `frontend/.env.local` e preencha os dados exibidos no painel **Connect** do Supabase:

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

## 🕝Estado do protótipo🕝

Sem variáveis do Supabase, o projeto mantém um modo demonstrativo local para facilitar a apresentação. Com as variáveis configuradas, autenticação e dados passam a usar o Supabase; endpoints protegidos validam o token no backend e a chave secreta permanece somente no servidor.

Questões geradas por IA devem passar por validação pedagógica antes do uso com estudantes reais.
