# Perfil Gamificado Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar pontos, níveis e medalhas reais no perfil do estudante após o cadastro.

**Architecture:** Triggers do Supabase registram dias ativos sem entregar escrita extra ao navegador. Um módulo Python puro calcula a jornada a partir de totais, e uma rota estudantil entrega o resultado ao React. O React coloca a jornada abaixo do avatar e preserva um fallback de iniciais até os avatares gerados ficarem disponíveis.

**Tech Stack:** PostgreSQL/Supabase RLS, FastAPI, Python unittest, React/TypeScript e CSS.

**Spec:** `docs/superpowers/specs/2026-09-08-gamificacao-perfil-design.md`

## Global Constraints

- Pontos e conquistas nunca são fornecidos pelo navegador; o backend calcula os valores.
- A rota aceita somente estudante autenticado e não recebe ID de estudante na URL.
- Não usar nomes, fotos ou dados reais nos avatares gerados.
- A interface deve usar `<progress>`, headings, listas e texto de estado acessíveis.

---

### Task 1: Regras de pontuação e conquistas

**Files:**
- Create: `backend/gamification.py`
- Create: `backend/test_gamification.py`

**Interfaces:**
- Produces: `build_gamification_summary(completed_lessons, correct_answers, attempts, active_days, current_streak) -> dict[str, object]`.

- [ ] Escrever teste com 2 aulas, 12 acertos, 15 tentativas, 4 dias e sequência de 3 dias, esperando 400 pontos, nível 2 e quatro conquistas.
- [ ] Executar `python -m unittest backend/test_gamification.py` e confirmar falha por módulo ausente.
- [ ] Implementar cálculo sem consulta ao banco e executar o teste novamente.

### Task 2: Atividade diária e rota protegida

**Files:**
- Create: `supabase/migrations/20260908170000_student_gamification.sql`
- Modify: `backend/main.py`
- Modify: `backend/test_security.py`

**Interfaces:**
- Consumes: `build_gamification_summary` e tabela `student_activity_days`.
- Produces: `GET /student/gamification` protegido por `require_role("student")`.

- [ ] Escrever teste que prova que professor não atravessa a dependência de estudante.
- [ ] Criar tabela, RLS e triggers de atividade em tentativas e progresso de aula.
- [ ] Consultar somente totais do estudante atual e retornar a jornada calculada.
- [ ] Executar todos os testes do backend.

### Task 3: Cartão de perfil e medalhas

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/index.css`

**Interfaces:**
- Consumes: `GET /student/gamification`.
- Produces: cartão de identidade, progresso do nível e lista de conquistas abaixo da foto.

- [ ] Buscar a jornada com o token existente e manter dados demonstrativos apenas sem Supabase.
- [ ] Renderizar `<progress>` para o nível, lista de medalhas e avatar de iniciais.
- [ ] Respeitar movimento reduzido e construir o frontend.

### Task 4: Documentação e publicação

**Files:**
- Create: `docs/GAMIFICACAO.md`
- Modify: `README.md`

- [ ] Explicar pontos, níveis, conquistas, migração e a dependência temporária dos avatares do Artlist.
- [ ] Rodar testes e build finais antes de publicar apenas os arquivos verificados.
