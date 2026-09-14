# Mapa do código: projeto AprendeIA

## Visão geral
O projeto separa a interface React, as regras FastAPI e a autorização PostgreSQL/Supabase. A documentação por área aponta para as partes que sustentam cada perfil e integração.

## Estrutura
- `frontend/src/App.tsx` — reúne login, cadastro e painéis de aluno, professor e administração.
- `frontend/src/lib/supabase.ts` — mantém sessão e token público do navegador.
- `backend/main.py` — expõe endpoints, valida cargos e coordena banco, IA e SMTP.
- `backend/auth_security.py` — protege as tentativas de login.
- `backend/gamification.py` — calcula pontos, níveis e conquistas.
- `backend/teacher_dashboard.py` — prepara gráficos, importações e relatórios.
- `backend/difficulty_alerts.py` — identifica dificuldade alta e monta os e-mails.
- `supabase/migrations/` — cria tabelas, relações, funções e políticas RLS.
- `docs/` — descreve o projeto e cada área funcional.

## Fluxo principal
1. O React coleta a ação e envia ao FastAPI ou ao cliente público de sessão.
2. O FastAPI valida token, cargo, disciplina e dados de entrada.
3. O Supabase aplica RLS e persiste somente a operação autorizada.
4. OpenAI ou SMTP entram apenas quando a função solicitada precisa dessas integrações.

## Pontos de atenção
- Segredos pertencem ao backend e nunca aos arquivos versionados.
- A interface ainda está concentrada em um arquivo grande e pode ser dividida quando o projeto crescer.
- Mudanças locais só chegam à produção depois de commit, push e novo deploy.
