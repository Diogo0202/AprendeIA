# Implementation Plan: Complete 50% Functional Requirements

## Overview
This plan identifies all Functional Requirements (RF) currently at 50% status in `STATUS_REQUISITOS_FUNCIONAIS.md` and defines the steps needed to complete them. Additionally, it proposes an automatic checklist update mechanism that will be triggered when the user finishes completing these features.

## Current 50% Status RF Items

The following 7 requirements are at 50% status:

| RF ID | Requirement | Status Note |
|-------|-------------|-------------|
| **RF-04** | Recuperação e redefinição de senha | Real email delivery, allowed URLs, and SMTP config pending |
| **RF-05** | Verificação Turnstile no cadastro, login e recuperação | CAPTCHA not configured; keys are external |
| **RF-07** | Informar dados tratados, finalidades, retenção, IA e tratamento de dados de menores | Missing controller identification, official channel, legal review |
| **RF-22** | Enviar alerta imediato e resumo semanal por e-mail ao professor da matéria | Missing valid SMTP credentials and weekly scheduling confirmation |
| **RF-25** | Tutor de IA para aluno e professor, com separação entre conversa humana e contexto enviado ao modelo | Requires OpenAI key and model, not verified in environment |
| **RF-29** | Microsoft Clarity com escolha de consentimento e mascaramento | Integration disabled by default; no real ID confirmed |
| **RF-31** | CI para testes, análise Bandit, build frontend, Playwright e acionamento condicional do Railway | No recent execution verified; secrets not configured |

---

## Detailed Analysis per RF Item

### RF-04: Recuperação e redefinição de senha

**Current Implementation:**
- Frontend (`frontend/src/App.tsx`) calls `resetPasswordForEmail` and `updateUser`
- Interface tests exist
- Emails use Supabase Auth

**Pending Changes:**
1. Configure Supabase Auth email confirmation settings (email redirect URL, models, redirection list)
2. Set up SMTP delivery for password reset emails
3. Verify allowed URLs are in Supabase project's Redirect URLs
4. Test end-to-end email delivery flow
5. Update `docs/SEGURANCA.md` to reflect configuration status

**Dependencies:**
- Supabase project dashboard configuration
- SMTP service credentials (see SEGURANCA.md for required secrets: `SMTP_PASSWORD`, `SMTP_HOST`, etc.)
- Frontend redirect URLs configuration

---

### RF-05: Verificação Turnstile no cadastro, login e recuperação

**Current Implementation:**
- Frontend component `frontend/src/components/TurnstileWidget.tsx`
- Usage points in `App.tsx`
- Backend validation in `backend/captcha.py`

**Pending Changes:**
1. Configure Cloudflare Turnstile site key and secret key
2. Add Turnstile verification to registration flow
3. Add Turnstile verification to login flow
4. Add Turnstile verification to password recovery flow
5. Update `docs/SEGURANCA.md` to document CAPTCHA configuration status
6. Ensure keys are not exposed in frontend code or commits

**Dependencies:**
- Cloudflare Turnstile account
- Site key and secret key (must remain backend-only)
- Backend captcha validation logic

---

### RF-07: Informar dados tratados, finalidades, retenção, IA e tratamento de dados de menores

**Current Implementation:**
- Modal displays data treatment information
- `docs/POLITICA_DE_PRIVACIDADE.md` includes these topics
- Describes data sent to OpenAI

**Pending Changes:**
1. Identify data controller (institutional identification)
2. Define official contact channel for privacy matters
3. Establish institutional retention period for academic data
4. Conduct legal review of data processing requirements
5. Implement responsible consent mechanism (if required by law)
6. Update `docs/POLITICA_DE_PRIVACIDADE.md` with complete information
7. Add privacy consent acceptance UI component

**Dependencies:**
- Institutional legal review
- Data protection officer (DPO) or responsible identification
- Compliance with LGPD/BR data protection laws

---

### RF-22: Enviar alerta imediato e resumo semanal por e-mail ao professor da matéria

**Current Implementation:**
- SMTP sending implemented in backend
- `POST /internal/weekly-difficulty-summary` endpoint exists
- Summary limited by discipline
- Protected by `X-Cron-Secret` header (value from `WEEKLY_SUMMARY_CRON_SECRET`)

**Pending Changes:**
1. Configure valid SMTP credentials (see ALERTAS_DIFICULDADE.md for required vars: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_USE_SSL`)
2. Test SMTP email delivery
3. Configure weekly summary scheduling (cron job or external scheduler)
4. Validate `WEEKLY_SUMMARY_CRON_SECRET` is properly set
5. Test end-to-end weekly summary flow
6. Update documentation

**Dependencies:**
- SMTP service credentials (must NOT be in frontend or commits)
- Railway or hosting cron job capability
- `WEEKLY_SUMMARY_CRON_SECRET` environment variable

---

### RF-25: Tutor de IA para aluno e professor, com separação entre conversa humana e contexto enviado ao modelo

**Current Implementation:**
- Interface implemented
- `POST /communications/ai/messages` endpoint exists
- `backend/ai_security.py` sanitizes messages/context

**Pending Changes:**
1. Configure OpenAI API key and model selection
2. Test real AI tutor functionality in staging environment
3. Verify conversation separation (human vs. AI context)
4. Ensure `OPENAI_API_KEY` and `OPENAI_MODEL` are not exposed in frontend
5. Add fallback behavior when AI service is unavailable
6. Update `docs/POLITICA_DE_PRIVACIDADE.md` AI section if needed

**Dependencies:**
- OpenAI account and API key
- `OPENAI_API_KEY` environment variable (backend only)
- `OPENAI_MODEL` configuration

---

### RF-29: Microsoft Clarity com escolha de consentimento e mascaramento

**Current Implementation:**
- `src/lib/clarity.ts` - Clarity integration logic
- `ClarityConsent.tsx` - Consent choice component
- Consent and masking in `index.html`

**Pending Changes:**
1. Obtain real Microsoft Clarity ID (if project decides to activate)
2. Implement consent mechanism that defaults to OFF
3. Add policy check: "project should not activate for minor public without own evaluation"
4. Document the default-disabled state in code comments
5. Add clarification in `docs/SEGURANCA.md` about Clarity usage

**Dependencies:**
- Microsoft Clarity account (optional, may not be needed)
- Decision on whether to activate for this project

---

### RF-31: CI para testes, análise Bandit, build frontend, Playwright e acionamento condicional do Railway

**Current Implementation:**
- `.github/workflows/quality-and-deploy.yml` defines stages
- Requires secret hooks to trigger deploy

**Pending Changes:**
1. Verify recent GitHub Actions execution
2. Configure required secrets:
   - `RAILWAY_BACKEND_DEPLOY_HOOK`
   - `RAILWAY_FRONTEND_DEPLOY_HOOK`
3. Add Bandit analysis step (already in workflow)
4. Add Playwright test execution (already in workflow)
5. Ensure all CI steps pass reliably
6. Test deploy hook functionality

**Dependencies:**
- GitHub repository secrets configuration
- Railway project deployment hooks
- Successful test execution environment

---

## Automatic Checklist Update Mechanism

### Proposed Solution

Create a script that automatically updates the `STATUS_REQUISITOS_FUNCIONAIS.md` checklist when all 50% items are completed. The mechanism should:

1. **Detect completion status** by checking:
   - Code evidence for each RF item
   - Configuration presence (secrets, API keys, etc.)
   - Test results
   - Documentation updates

2. **Update the markdown checklist** automatically when all pending items for a requirement are satisfied

3. **Maintain audit trail** of when and how updates were made

### Implementation Approach

#### Option A: Post-commit Hook Script
```bash
#!/bin/bash
# Script to update RF status after completion
# Run after each feature completion PR merge

# Check each RF item's status
# Update markdown file accordingly
```

#### Option B: GitHub Actions Workflow
Create a workflow that runs on PR updates and checks:
- Code evidence for each requirement
- Configuration presence
- Test status
- Updates the markdown file via commit

#### Option C: Manual Trigger with Script
A script the user runs after finishing all completions:
```bash
python update_rf_status.py --complete <rf-item-ids>
```

### Recommended Implementation

I recommend **Option B (GitHub Actions)** with the following structure:

1. Create a new workflow `.github/workflows/update-rf-status.yml`
2. The workflow checks for evidence of completion for each 50% RF item
3. If all pending items for a requirement are met, automatically update the status from 50% to 100%
4. Commit the change back to the repository

#### Workflow Steps:

```yaml
name: Update RF Status

on:
  push:
    paths:
      - 'docs/STATUS_REQUISITOS_FUNCIONAIS.md'
  manual_job:
    inputs:
      trigger:
        description: "Trigger RF status update"
        required: true
        default: "false"

jobs:
  check-rf-status:
    runs-on: ubuntu-latest
    if: github.event_name == 'push' || inputs.trigger == 'true'

    steps:
      - uses: actions/checkout@v4

      - name: Check RF-04 completion
        run: |
          # Check if email reset flow is fully configured
          # Update STATUS_REQUISITOS_FUNCIONAIS.md if complete

      - name: Check RF-05 completion
        run: |
          # Check if Turnstile is configured
          # Update STATUS_REQUISITOS_FUNCIONAIS.md if complete

      - name: Check RF-07 completion
        run: |
          # Check if privacy info is complete
          # Update STATUS_REQUISITOS_FUNCIONAIS.md if complete

      - name: Check RF-22 completion
        run: |
          # Check if SMTP and weekly summary are configured
          # Update STATUS_REQUISITOS_FUNCIONAIS.md if complete

      - name: Check RF-25 completion
        run: |
          # Check if AI tutor is verified
          # Update STATUS_REQUISITOS_FUNCIONAIS.md if complete

      - name: Check RF-29 completion
        run: |
          # Check if Clarity is configured/decided
          # Update STATUS_REQUISITOS_FUNCIONAIS.md if complete

      - name: Check RF-31 completion
        run: |
          # Check if CI is verified and running
          # Update STATUS_REQUISITOS_FUNCIONAIS.md if complete

      - name: Commit status update
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git commit -am "Update RF status: completed 50% requirements" || echo "No changes to commit"
          git push
```

### Usage Flow

1. **User completes a 50% feature** (e.g., configures SMTP, sets up Turnstile, etc.)
2. **User pushes changes** to the repository
3. **GitHub Actions workflow triggers**
4. **Workflow checks completion evidence** for all 50% RF items
5. **If all pending items for a requirement are met**, automatically updates status from 50% to 100%
6. **Workflow commits the change** to `STATUS_REQUISITOS_FUNCIONAIS.md`
7. **User sees the updated checklist** in the next pull request or on the main branch

### Manual Override

The system should also allow manual updates via:
- A GitHub Actions workflow dispatch input
- A simple script: `python scripts/update_rf_status.py`
- Direct edit of the markdown file when automated checks can't determine completion

---

## Priority Order for Completion

Based on dependencies and impact, I recommend completing the 50% items in this order:

1. **RF-31** (CI/CD) - Relatively low risk, mainly involves verifying and configuring existing pipeline
2. **RF-29** (Microsoft Clarity) - Decision-based, may not require actual implementation
3. **RF-05** (Turnstile) - External service configuration, moderate complexity
4. **RF-04** (Password recovery) - Critical user flow, requires SMTP configuration
5. **RF-22** (Weekly email alerts) - Critical for teacher workflow, requires SMTP + cron
6. **RF-25** (AI tutor) - Requires OpenAI credentials, moderate complexity
7. **RF-07** (Privacy policy details) - Legal/compliance, may require institutional review

---

## Success Criteria

After completing all 50% items and running the automatic update mechanism:

- ✅ All 27 RF items reach 100% status
- ✅ `STATUS_REQUISITOS_FUNCIONAIS.md` reflects accurate implementation status
- ✅ No pending critical user flows (auth, privacy, communication)
- ✅ CI/CD pipeline fully operational and verified
- ✅ Documentation accurately reflects project state
- ✅ All secrets and external configurations properly set (not in code/fixtures)

---
*Plan generated on 07/10/2026 for AprendeIA project*
