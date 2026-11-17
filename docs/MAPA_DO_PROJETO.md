# Mapa do código: projeto AprendeIA

## Visão geral
O projeto separa a interface React, o backend em arquitetura hexagonal (domínio, casos de uso e adaptadores) e a autorização PostgreSQL/Supabase. A documentação por área aponta para as partes que sustentam cada perfil e integração.

## Estrutura
- `frontend/src/App.tsx` — controla sessão, navegação entre telas e o fluxo de login e cadastro.
- `frontend/src/components/auth/` — telas de login, cadastro e recuperação de senha.
- `frontend/src/components/student/`, `teacher/` e `admin/` — painéis de cada cargo.
- `frontend/src/components/layout/Chrome.tsx` — marca, cabeçalho e avatar compartilhados.
- `frontend/src/domain/` — tipos compartilhados pelas telas (`app.ts`, `learning.ts`, `teacher.ts`).
- `frontend/src/application/` — portas que as telas usam para falar com o servidor (`ports.ts`), o resultado sem detalhes de HTTP (`result.ts`) e o registro das portas (`gateways.ts`).
- `frontend/src/adapters/http/` — cliente HTTP autenticado e a implementação das portas (`gateways.ts`); `adapters/supabase/client.ts` mantém sessão e token público; `adapters/browser/` cuida de tema, medição e URL de retorno.
- `frontend/src/adapters/supabase/session.ts` — porta de sessão (login aberto pelo backend, cadastro, recuperação de senha); `frontend/src/composition.ts` liga as portas aos adaptadores.
- `frontend/src/components/**/use*.ts` — estado e ações de cada tela grande (`useAuthFlow`, `useStudentProfile`, `useTeacherDashboard`, `usePrivacyRequestPanel`); o componente só desenha.
- `frontend/src/architecture.test.ts` — falha se uma tela chamar o cliente HTTP ou o Supabase direto, ou se uma camada importar outra mais externa.
- `backend/main.py` — ponto de entrada; só cria o app (`main:app`).
- `backend/aprendeia/domain/` — regras puras, sem FastAPI nem Supabase: login (`login_protection.py`), gamificação, catálogo, questões, alertas de dificuldade, painel do professor e erros de negócio (`errors.py`).
- `backend/aprendeia/application/ports/` — contratos (Protocol) que os casos de uso exigem de banco, identidade, IA, e-mail e limites.
- `backend/aprendeia/application/services/` — casos de uso por contexto: acesso, comunicação, banco de questões, trilha do estudante, professor, administração e direitos do titular.
- `backend/aprendeia/adapters/inbound/http/` — FastAPI: `routers/`, `schemas.py`, `dependencies.py` (sessão e cargo), `middleware.py` (cabeçalhos e auditoria) e `support.py` (erro de negócio → status HTTP).
- `backend/aprendeia/adapters/outbound/` — Supabase (`supabase/`), OpenAI (`openai_tutor.py`), e-mail (`email_delivery.py`) e Turnstile (`turnstile.py`).
- `backend/aprendeia/container.py` e `bootstrap.py` — ligam casos de uso aos adaptadores e montam a aplicação.
- `backend/test_architecture.py` — falha se uma camada importar outra mais externa.
- `supabase/migrations/` — cria tabelas, relações, funções e políticas RLS.
- `docs/` — descreve o projeto e cada área funcional.

## Fluxo principal
1. O React coleta a ação e envia ao FastAPI ou ao cliente público de sessão.
2. O router valida token, cargo e formato; o caso de uso aplica a regra de negócio por meio das portas.
3. O Supabase aplica RLS e persiste somente a operação autorizada.
4. OpenAI ou SMTP entram apenas quando a função solicitada precisa dessas integrações.

## Pontos de atenção
- Segredos pertencem ao backend e nunca aos arquivos versionados.
- Os painéis de professor e de aluno já separam estado (hooks) de apresentação; o JSX de cada um ainda pode ser dividido por aba.
- Mudanças locais só chegam à produção depois de commit, push e novo deploy.
