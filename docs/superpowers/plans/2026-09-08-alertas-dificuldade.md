# Alertas de dificuldade por disciplina Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar alertas de dificuldade por disciplina, envio SMTP e resumo semanal sem abrir dados entre estudantes, professores ou administradora.

**Architecture:** Uma migração passa a ligar professor e disciplina de forma exclusiva e substitui as leituras amplas por políticas RLS baseadas na disciplina. O backend calcula o risco após cada resposta, grava o alerta e centraliza os e-mails num módulo pequeno e testável. O React consulta apenas a rota do professor autenticado.

**Tech Stack:** FastAPI, Supabase/PostgreSQL/RLS, React/TypeScript, SMTP TLS/SSL, unittest.

**Spec:** `docs/superpowers/specs/2026-09-08-alertas-dificuldade-design.md`

## Global Constraints

- Não salvar senhas ou segredos no banco, nos arquivos de exemplo, no Git ou nos logs.
- Todos os novos comportamentos Python começam por teste que falha.
- Comentários explicam decisões não óbvias em linguagem simples.
- Professores só leem a própria disciplina; estudantes não acessam alertas; administradora não tem rota de consulta pedagógica.

---

### Task 1: Regras puras e textos de e-mail

**Files:**
- Create: `backend/difficulty_alerts.py`
- Create: `backend/test_difficulty_alerts.py`

**Interfaces:**
- Produces: `is_high_difficulty(accuracy_percent: float, attempts: int) -> bool`.
- Produces: `build_immediate_email(...) -> tuple[str, str]` e `build_weekly_email(...) -> tuple[str, str]`.

- [ ] Escrever testes que comprovem o limiar de 3 tentativas e 60%.
- [ ] Executar os testes e confirmar que falham porque o módulo não existe.
- [ ] Implementar as funções puras e executar os testes novamente.

### Task 2: Banco e isolamento por disciplina

**Files:**
- Create: `supabase/migrations/20260908150000_teacher_subject_alerts.sql`

**Interfaces:**
- Produces: tabelas `teacher_subjects`, `difficulty_alerts` e `weekly_summary_runs`.
- Produces: `private.is_teacher_for_subject(uuid)` para políticas RLS.

- [ ] Criar a relação exclusiva entre professor e disciplina.
- [ ] Criar alertas e registro idempotente do resumo semanal.
- [ ] Trocar políticas de leitura de professor por escopo de disciplina e retirar a leitura ampla por turma.
- [ ] Garantir que todo estudante seja matriculado nas disciplinas existentes.

### Task 3: API, SMTP e cron protegido

**Files:**
- Modify: `backend/main.py`
- Modify: `backend/test_security.py`
- Modify: `backend/test_difficulty_alerts.py`

**Interfaces:**
- Consumes: funções de `difficulty_alerts.py`, tabelas novas e `X-Cron-Secret`.
- Produces: `GET /teacher/difficulty-alerts` e `POST /internal/weekly-difficulty-summary`.

- [ ] Escrever testes de acesso negado ao job e ao alerta do professor.
- [ ] Implementar criação de alerta após resposta, envio SMTP sem logar dados sensíveis e fechamento de alertas recuperados.
- [ ] Fazer a criação de professor exigir uma disciplina existente ainda livre.
- [ ] Executar todos os testes do backend.

### Task 4: Área do professor e formulário administrativo

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/styles.css`

**Interfaces:**
- Consumes: `GET /teacher/difficulty-alerts`.
- Produces: cartão de alertas com estado de carregamento e falha acessível; campo de disciplina no cadastro de professor.

- [ ] Consultar a rota do professor com o token já usado pelo app.
- [ ] Mostrar somente dados devolvidos pelo backend e não criar caminhos para outro cargo.
- [ ] Aplicar mensagens acessíveis para carregamento/erro e construir o frontend.

### Task 5: Operação e documentação

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Create: `docs/ALERTAS_DIFICULDADE.md`

- [ ] Documentar variáveis SMTP, segredo do cron, migração e configuração no Railway.
- [ ] Documentar o modelo de acesso e a limitação de uma disciplina por professor.
- [ ] Rodar verificações finais e sincronizar somente arquivos testados para o repositório de publicação.
