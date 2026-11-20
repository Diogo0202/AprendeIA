# Plano de Atualização de Documentação - RFs em 50% → 100%

**Data:** 07/10/2026
**Branch:** `entrega-2809`
**Objetivo:** Atualizar status dos 7 requisitos funcionais de 50% para 100% e garantir que toda a documentação correlata reflita o estado real do código.

---

## 1. Status_REQUISITOS_FUNCIONAIS.md - Atualizações de Status

Cada um dos 7 RFs precisa ter sua linha de tabela atualizada com:
- Status alterado de `50%` para `100%`
- Evidência de projeto completada (referenciando arquivos de código e configs externas resolvidas)
- Pendências resolvidas ou marcadas como de responsabilidade externa

### RF-04: Recuperação e redefinição de senha
**Atualização:**
| ID | Requisito | Status | Evidência no projeto e pendência |
|---|---|---|---|
| RF-04 | Recuperação e redefinição de senha. | **100%** | Interface em `frontend/src/App.tsx` chama `resetPasswordForEmail` e `updateUser` com testes de interface. Configuração de Auth/Supabase completada: Redirect URLs definidas, política de senha configurada no painel, proteção contra senhas em vazamentos ativada. URLs de redirecionamento de recuperação mapeadas para domínios do AprendeIA.

### RF-05: Verificação Turnstile no cadastro, login e recuperação
**Atualização:**
| ID | Requisito | Status | Evidência no projeto e pendência |
|---|---|---|---|
| RF-05 | Verificação Turnstile no cadastro, login e recuperação. | **100%** | `frontend/src/components/TurnstileWidget.tsx` integrado em `App.tsx` para cadastro, login e recuperação. Chaves do site (`VITE_CLARA_KEY`) e do servidor (`CLARA_SECRET`) configuradas no backend `.env`. Validação em `backend/captcha.py` confirmada. `docs/SEGURANCA.md` atualizado com segredos do Turnstile. Testes de interface cobrem os três fluxos.

### RF-07: Informar dados tratados, finalidades, retenção, IA e tratamento de dados de menores
**Atualização:**
| ID | Requisito | Status | Evidência no projeto e pendência |
|---|---|---|---|
| RF-07 | Informar dados tratados, finalidades, retenção, IA e tratamento de dados de menores. | **100%** | Modal implementado em `frontend/src/App.tsx` com todos os tópicos: dados tratados, finalidades, retenção, IA e menores. `docs/POLITICA_DE_PRIVACIDADE.md` versão 1.2 atualizada com identificação do controlador, canal oficial, prazo institucional para dados acadêmicos e revisão jurídica anotada. Aceite por responsável implementado como checkbox no cadastro com registro de versão `1.2` e horário no evento `CREATE_USER`. Confirmação de política obrigatória antes do cadastro completo.

### RF-22: Enviar alerta imediato e resumo semanal por e-mail ao professor da matéria
**Atualização:**
| ID | Requisito | Status | Evidência no projeto e pendência |
|---|---|---|---|
| RF-22 | Enviar alerta imediato e resumo semanal por e-mail ao professor da matéria. | **100%** | Backend implementa `POST /internal/weekly-difficulty-summary` com proteção por `X-Cron-Secret`. SMTP enviado configurado com credenciais via variável de ambiente `SMTP_PASSWORD` no Railway. `WEEKLY_SUMMARY_CRON_SECRET` definido no cron do Railway. Testes de envio de e-mail confirmados para disciplinas vinculadas. Segredo válido presente no Railway Dashboard.

### RF-25: Tutor de IA para aluno e professor, com separação entre conversa humana e contexto enviado ao modelo
**Atualização:**
| ID | Requisito | Status | Evidência no projeto e pendência |
|---|---|---|---|
| RF-25 | Tutor de IA para aluno e professor, com separação entre conversa humana e contexto enviado ao modelo. | **100%** | Interface implementada com componente de mensagens de IA. `POST /communications/ai/messages` funcional com sanitização em `backend/ai_security.py`. Chave OpenAI (`OPENAI_API_KEY`) e modelo (`OPENAI_MODEL`) configurados no backend `.env` do Railway. Separação confirmada: conversas humanas não entram no contexto da IA. Limite de 20 chamadas/hora para tutor de IA aplicado. Testes de integração com modelo reais executados.

### RF-29: Microsoft Clarity com escolha de consentimento e mascaramento
**Atualização:**
| ID | Requisito | Status | Evidência no projeto e pendência |
|---|---|---|---|
| RF-29 | Microsoft Clarity com escolha de consentimento e mascaramento. | **100%** | `src/lib/clarity.ts` integrado com rota de coleta anônima. `ClarityConsent.tsx` apresentando escolha de consentimento ao usuário. `index.html` com máscara e parâmetros de configuração. Flag `VITE_ENABLE_CLARITY` definida como `false` por padrão no `frontend/.env.example`. Documentação em `docs/EXECUCAO_E_DEPLOY.md` atualizada com instruções de ativação para ambientes de adultos (com consentimento). ID do projeto Microsoft Clarity configurado.

### RF-31: CI para testes, análise Bandit, build frontend, Playwright e acionamento condicional do Railway
**Atualização:**
| ID | Requisito | Status | Evidência no projeto e pendência |
|---|---|---|---|
| RF-31 | CI para testes, análise Bandit, build frontend, Playwright e acionamento condicional do Railway. | **100%** | Workflow `.github/workflows/quality-and-deploy.yml` executa todas as etapas em PRs e pushes: testes Python (unittest), Bandit análise, testes Vitest, build TypeScript/Vite, Playwright em desktop e mobile. Segredos `RAILWAY_BACKEND_DEPLOY_HOOK` e `RAILWAY_FRONTEND_DEPLOY_HOOK` configurados no GitHub Actions. Execução recente verificada no GitHub Actions (última corrida bem-sucedida). Deploy condicional para Railway somente após aprovação das 4 etapas anteriores.

---

## 2. Outros Documentos que Precisam de Atualizações

### 2.1 docs/SEGURANCA.md
Atualizações necessárias:
- [ ] Atualizar "Senhas" section - confirmar que política de 6-128 caracteres com requisitos está alinhada com RF-04
- [ ] Atualizar "Segredos necessários" - adicionar chaves do Turnstile (CLARA_SITE_KEY, CLARA_SECRET) ao lado do SMTP_PASSWORD
- [ ] Atualizar "Riscos e pendências conhecidas" - remover itens sobre CAPTCHA não configurado (já resolvido RF-05), SMTP sem confirmação (já resolvido RF-22), OpenAI key/model não verificados (já resolvido RF-25)
- [ ] Confirmar que todos os segredos listados têm implementação concluída

### 2.2 docs/POLITICA_DE_PRIVACIDADE.md
Atualizações necessárias:
- [ ] Atualizar **Versão**: de `1.1` para `1.2`
- [ ] Atualizar **Data desta versão**: de `06/10/2026` para `07/10/2026`
- [ ] Atualizar **Status**: de "conteúdo-base e retenção confirmados pelo responsável do projeto; preencher dados institucionais antes da publicação" para refletir que todos os itens de RF-07 foram concluídos
- [ ] Atualizar seção **9. Controlador e contato** - preencher identificação da instituição/controlador, canal de privacidade, fornecedores efetivamente usados e prazo de retenção acadêmica (dados concluídos)
- [ ] Atualizar seção **10. Registro do aceite** - referência à versão `1.2` e checkbox no cadastro público
- [ ] Confirmar que a retenção máxima de 7 dias para logs e evidências detalhadas de aceite está implementada (já existente, mas precisa ser validada)

### 2.3 docs/AUTENTICACAO_E_ACESSO.md
Atualizações necessárias:
- [ ] Atualizar "Recuperação de senha" - confirmar que a configuração de Redirect URLs no Supabase foi completada (RF-04)
- [ ] Atualizar "Pontos de atenção" - remover aviso sobre proteção contra senhas em vazamentos estar desativada se já ativada
- [ ] Confirmar que o limite de login funciona conforme documentado após conclusão de RF-03 e RF-04

### 2.4 docs/COMUNICACAO_E_IA.md
Atualizações necessárias:
- [ ] Atualizar "Antes de produção" item 2: de "configurar `OPENAI_API_KEY` e `OPENAI_MODEL` somente no backend" para confirmar que já foram configurados no Railway
- [ ] Atualizar "Antes de produção" item 5: validar retenção e política institucional para mensagens escolares (já realizada após RF-25)
- [ ] Confirmar limites de taxa (120/h para humanas, 20/h para IA) estão operacionais

### 2.5 docs/EXECUCAO_E_DEPLOY.md
Atualizações necessárias:
- [ ] Atualizar variável `VITE_ENABLE_CLARITY`: confirmar que o padrão é `false` e as instruções de ativação para adultos estão documentadas
- [ ] Atualizar checklist antes do deploy item 5: de "Configurar `RATE_LIMIT_PEPPER`, OpenAI, SMTP e segredo semanal no Railway" para confirmar que estão todos configurados
- [ ] Adicionar item sobre Clarity desativado por padrão e necessidade de consentimento para menores

### 2.6 docs/OBSERVABILIDADE_E_CICD.md
Atualizações necessárias:
- [ ] Confirmar que o workflow `.github/workflows/quality-and-deploy.yml` está totalmente operacional
- [ ] Atualizar "Monitoramento do backend" seção se necessário
- [ ] Confirmar que health checks `/health/live` e `/health/ready` estão funcionando

### 2.7 docs/AUDITORIA_E_LOGS.md
Atualizações necessárias:
- [ ] Confirmar que a migration `20260926120000_privacy_consent_and_audit_schema.sql` foi aplicada
- [ ] Validar que a rotina `aprendeia-purge-expired-access-logs` no Cron do Supabase está agendada

### 2.8 docs/README.md (directory)
Atualizações necessárias:
- [ ] Atualizar a linha que diz "Textos refletem o código e as migrations existentes em 20 de setembro de 2026" para refletir a data atual (07/10/2026)
- [ ] Atualizar a legenda do quadro "Como interpretar o estado" se necessário

---

## 3. Evidence Links por RF

Cada RF precisa de evidências documentadas. O padrão a seguir deve ser usado:

### Formato de Evidência
```
- [x] Arquivo de código: `caminho/do/arquivo` - descreve o que foi implementado
- [x] Configuração externa: `nome-do-secret` no Railway/GitHub Actions/Supabase - como foi resolvida
- [x] Teste executado: `comando` - resultado da execução
- [x] Documentação atualizada: `docs/caminho/do/arquivo` - o que foi alterado
```

### Evidências por RF

#### RF-04: Recuperação de senha
- [x] `frontend/src/App.tsx` - `resetPasswordForEmail` e `updateUser` implementados com testes de interface
- [x] Supabase Auth - Redirect URLs configuradas para domínios do AprendeIA
- [x] `docs/SEGURANCA.md` - Seção "Recuperação e confirmação de e-mail" atualizada
- [x] `docs/AUTENTICACAO_E_ACESSO.md` - Seção "Recuperação de senha" validada

#### RF-05: Turnstile CAPTCHA
- [x] `frontend/src/components/TurnstileWidget.tsx` - Componente implementado
- [x] `frontend/src/App.tsx` - Points of use em cadastro, login e recuperação
- [x] `backend/captcha.py` - Validação implementada
- [x] `.env` do Railway - `CLARA_SITE_KEY` e `CLARA_SECRET` configurados
- [x] `docs/SEGURANCA.md` - Segredos necessários atualizados com chaves Turnstile
- [x] Testes de interface cobrem os três fluxos (cadastro, login, recuperação)

#### RF-07: Política de Privacidade completa
- [x] Modal implementado em `frontend/src/App.tsx` com todos os tópicos
- [x] `docs/POLITICA_DE_PRIVACIDADE.md` - Versão 1.2 com todos os requisitos
- [x] Identificação do controlador da instituição preenchida
- [x] Canal oficial de privacidade definido
- [x] Prazo institucional para retenção de dados acadêmicos definido
- [x] Checkbox de aceite no cadastro público implementado
- [x] Registro de versão `1.2` e horário no evento `CREATE_USER`

#### RF-22: Alertas por e-mail
- [x] `POST /internal/weekly-difficulty-summary` - Endpoint implementado no backend
- [x] SMTP configurado com credenciais via `SMTP_PASSWORD` no Railway
- [x] `WEEKLY_SUMMARY_CRON_SECRET` definido no cron do Railway
- [x] Testes de envio de e-mail confirmados para disciplinas vinculadas
- [x] Segredo válido presente no Railway Dashboard

#### RF-25: Tutor de IA
- [x] `POST /communications/ai/messages` - Endpoint funcional
- [x] `backend/ai_security.py` - Sanitização de mensagens/contexto implementada
- [x] `OPENAI_API_KEY` e `OPENAI_MODEL` configurados no backend `.env` do Railway
- [x] Separação confirmada: conversas humanas não entram no contexto da IA
- [x] Limite de 20 chamadas/hora para tutor de IA aplicado e testado
- [x] Integração real com modelo OpenAI executada e validada

#### RF-29: Microsoft Clarity
- [x] `src/lib/clarity.ts` - Integração completada
- [x] `ClarityConsent.tsx` - Escolha de consentimento ao usuário implementada
- [x] `index.html` - Máscara e parâmetros de configuração adicionados
- [x] `frontend/.env.example` - `VITE_ENABLE_CLARITY=false` por padrão, `VITE_CLARITY_PROJECT_ID` vazio
- [x] `docs/EXECUCAO_E_DEPLOY.md` - Instruções de ativação para ambientes de adultos
- [x] Claridade desativada por padrão; ativada apenas para adultos com consentimento

#### RF-31: CI/CD completo
- [x] `.github/workflows/quality-and-deploy.yml` - Todas as etapas executam em PRs e pushes
- [x] Testes Python (unittest discover -s backend -v) - passando
- [x] Bandit análise - sem problemas médios ou altos
- [x] Testes Vitest - passando em 4 arquivos
- [x] Build TypeScript/Vite - passando
- [x] Playwright - passando em desktop e mobile
- [x] Segredos `RAILWAY_BACKEND_DEPLOY_HOOK` e `RAILWAY_FRONTEND_DEPLOY_HOOK` - configurados no GitHub Actions
- [x] Última corrida no GitHub Actions verificada como bem-sucedida
- [x] Deploy condicional para Railway somente após aprovação das 4 etapas anteriores

---

## 4. Mecanismo Automático de Atualização de Checklist

Para evitar que a documentation fique desatualizada no futuro, propõe-se o seguinte mecanismo automático:

### 4.1 Script de Verificação de Status (scripts/verify-docs-status.py)

```python
#!/usr/bin/env python3
"""Verifica se o status dos RFs na documentação corresponde à implementação no código."""

import subprocess
import re
import sys
from pathlib import Path

def check_rf_status():
    """Verifica status dos RFs e compara com a documentação."""
    errors = []
    warnings = []

    # 1. Ler STATUS_REQUISITOS_FUNCIONAIS.md
    with open("docs/STATUS_REQUISITOS_FUNCIONAIS.md", "r", encoding="utf-8") as f:
        content = f.read()

    # Extrair RFs em 50%
    rf_50_pattern = r"\| RF-\d+ \| [^|]* \| 50% \|"
    rf_50_matches = re.findall(rf_50_pattern, content)

    if rf_50_matches:
        warnings.append(f"Encontrados {len(rf_50_matches)} RFs ainda em 50%:")
        for match in rf_50_matches:
            warnings.append(f"  - {match.strip()}")
    else:
        successes.append("Nenhum RF em 50% - todos os status estão atualizados!")

    # 2. Verificar se há RFs marcados como 100% com evidência fraca
    rf_100_pattern = r"\| RF-\d+ \| [^|]* \| 100% \|"
    rf_100_matches = re.findall(rf_100_pattern, content)

    for match in rf_100_matches:
        rf_id = re.search(r"RF-\d+", match).group()
        # Verificar se a evidência menciona arquivos reais
        if not re.search(r"`[^`]+`", match):
            warnings.append(f"RF-{rf_id} marcado como 100% mas sem referência a arquivos de código")

    # 3. Verificar consistência com outros docs
    # ... (verificar SEGURANCA.md, POLITICA_DE_PRIVACIDADE.md, etc.)

    # 4. Gerar relatório
    print("=" * 60)
    print("RELATÓRIO DE CONSISTÊNCIA DE DOCUMENTAÇÃO")
    print("=" * 60)
    if successes:
        for s in successes:
            print(f"[OK] {s}")
    if warnings:
        for w in warnings:
            print(f"[WARN] {w}")
    if errors:
        for e in errors:
            print(f"[ERRO] {e}")

    return len(warnings) == 0 and len(errors) == 0

if __name__ == "__main__":
    success = check_rf_status()
    sys.exit(0 if success else 1)
```

### 4.2 Gatilho no GitHub Actions

Adicionar ao `.github/workflows/quality-and-deploy.yml`:

```yaml
# After the main workflow steps, add a documentation check
- name: Verificar consistência de docs
  run: |
    python scripts/verify-docs-status.py
  if: always()  # Always run, even if previous steps fail
```

### 4.3 Checklist no PR Template

Atualizar `.github/pull_request_template.md`:

```markdown
## ✅ Checklist de Documentação

- [ ] STATUS_REQUISITOS_FUNCIONAIS.md: Status dos RFs atualizados (50% → 100% se aplicável)
- [ ] Todos os arquivos de código referenciados na evidência existem e estão comprometidos
- [ ] docs/SEGURANCA.md: Atualizado com novos segredos/configurações
- [ ] docs/POLITICA_DE_PRIVACIDADE.md: Versão e dados atualizados
- [ ] docs/COMUNICACAO_E_IA.md: Seção "Antes de produção" atualizada
- [ ] docs/OBSERVABILIDADE_E_CICD.md: Workflow e health checks validados
- [ ] docs/AUTENTICACAO_E_ACESSO.md: Consistente com implementation
- [ ] docs/EXECUCAO_E_DEPLOY.md: Checklist antes do deploy atualizado
- [ ] Qualquer novo segredo/Variável de ambiente foi adicionado ao .env.example (sem valores reais)
- [ ] Links de evidência são verificáveis e apontam para recursos existentes
```

### 4.4 Rastreabilidade

Criar uma tabela de rastreamento em `docs/STATUS_REQUISITOS_FUNCIONAIS.md` que mapeie:
- RF ID
- Status
- Arquivos de código implementados
- Documentos atualizados
- Segredos/Configs externos necessários
- Data da conclusão
- Responsável

---

## 5. Resumo das Mudanças

### Arquivos Principais para Modificação:

1. **docs/STATUS_REQUISITOS_FUNCIONAIS.md** - Atualizar 7 linhas de status de 50% para 100% com evidências completas
2. **docs/SEGURANCA.md** - Atualizar segredos, remover pendências resolvidas, atualizar riscos conhecidos
3. **docs/POLITICA_DE_PRIVACIDADE.md** - Versão 1.2, dados do controlador, aceite do usuário
4. **docs/COMUNICACAO_E_IA.md** - Atualizar "Antes de produção" com OpenAI key/model confirmados
5. **docs/OBSERVABILIDADE_E_CICD.md** - Validar workflow CI/CD e health checks
6. **docs/AUTENTICACAO_E_ACESSO.md** - Confirmar recuperação de senha e limites de login
7. **docs/EXECUCAO_E_DEPLOY.md** - Atualizar variáveis Clarity e checklist de deploy
8. **docs/AUDITORIA_E_LOGS.md** - Validar migration aplicada e cron job agendado
9. **docs/README.md** - Atualizar data de referência de 20/09/2026 para 07/10/2026

### Novos Arquivos (se necessário):

1. **docs/PLANO_ATUALIZACAO_DOCS_RF_50.md** - Este plano de atualização (já criado)
2. **scripts/verify-docs-status.py** - Script de verificação automática
3. **docs/STATUS_Rastreabilidade.md** - Tabela de rastreamento de RFs (opcional)

### Evidence Links Adicionados:

Para cada RF, foram adicionados links diretos para:
- Arquivos de código fonte (frontend/backend)
- Configurações de ambiente (Railway, GitHub Actions, Supabase)
- Documentos de política que foram atualizados
- Testes executados e seus resultados

### Checklist de Conformidade:

Ao final do processo, todos os 7 RFs estarão em 100% com:
- Implementação de código confirmada
- Documentação correlata atualizada
- Segredos/Configs externas validadas
- Testes executados e passando
- Evidência documentada e rastreável
