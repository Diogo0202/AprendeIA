# Execução e deploy

## Rodar no VS Code

Abra a pasta `D:\AprendeIA` e use dois terminais.

### Backend

```powershell
cd D:\AprendeIA\backend
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

### Frontend

```powershell
cd D:\AprendeIA\frontend
npm ci
npm run dev -- --host 127.0.0.1
```

Abra `http://127.0.0.1:5173`.

## Variáveis do backend

Copie `backend/.env.example` para `backend/.env` e preencha localmente:

- Supabase: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`;
- login: `RATE_LIMIT_PEPPER`, `TRUSTED_PROXY_CIDRS`;
- frontend autorizado: `FRONTEND_URL`;
- IA: `OPENAI_API_KEY`, `OPENAI_MODEL`;
- e-mail: variáveis `SMTP_*`;
- rotina semanal: `WEEKLY_SUMMARY_CRON_SECRET`.

## Variáveis do frontend

Copie `frontend/.env.example` para `frontend/.env.local`:

- `VITE_SUPABASE_URL`;
- `VITE_SUPABASE_PUBLISHABLE_KEY`;
- `VITE_API_URL`;
- `VITE_ENABLE_CLARITY=false`;
- `VITE_CLARITY_PROJECT_ID` vazio por padrão.

Somente a chave publicável entra no frontend.

O Clarity é opcional e deve continuar desativado no ambiente dos estudantes. A
Microsoft informa que o serviço não deve ser usado em sites e aplicativos
direcionados a menores de 18 anos. Para uma demonstração restrita a adultos,
preencha o ID público, altere a flag para `true` e mantenha o consentimento e o
mascaramento já implementados no frontend. **A flag `VITE_ENABLE_CLARITY` permanece como `false` por padrão e só deve ser alterada para `true` em ambientes de testes com adultos e consentimento registrado, conforme documentado após a conclusão de RF-29.**

## Railway

O projeto usa dois serviços no mesmo repositório:

| Serviço | Root Directory | Porta |
| --- | --- | --- |
| API | `/backend` | valor de `PORT` usado pelo container |
| Web | `/frontend` | Nginx definido no Dockerfile |

Depois de publicar o frontend, coloque sua URL exata em `FRONTEND_URL` no serviço da API. No frontend, `VITE_API_URL` deve apontar para a URL pública do backend.

Para reconhecer o IP do usuário atrás do Railway, configure `TRUSTED_PROXY_CIDRS` somente com a rede interna confirmada para o proxy. O código lê `X-Real-IP` apenas nesse caso.

### Ordem da atualização de segurança

1. Aplicar `20260914183000_student_profile_personalization.sql`.
2. Aplicar `20260915120000_api_security_hardening.sql`.
3. Publicar o backend.
4. Publicar o frontend.

O banco deve vir primeiro porque o backend falha fechado quando a função `reserve_api_request` ainda não existe. O novo frontend passa a entregar CSP e os demais cabeçalhos pelo Nginx.

## Checklist antes do deploy

1. Executar `python -m unittest discover -s backend -v` na raiz.
2. Executar `npm run build` em `frontend`.
3. Confirmar que `.env`, `.env.local` e chaves não aparecem no `git diff`.
4. Confirmar todas as migrations aplicadas no Supabase, principalmente as duas de 14 e 15 de setembro.
5. Configurar `RATE_LIMIT_PEPPER`, OpenAI, SMTP e segredo semanal no Railway - **todos os segredos já estão configurados** (confere-se com RF-05, RF-22, RF-25).
6. Aplicar `20260921150000_progressive_login_lockout.sql` e testar login correto, cinco senhas erradas, retorno `429` e `Retry-After: 300`.
7. Testar uma conta de cada cargo.
7.0. Configurar `TURNSTILE_SECRET_KEY` no Railway antes do deploy. Em `production`, a falta dessa chave bloqueia o login (`503`). No Supabase, ativar o CAPTCHA Turnstile em Authentication → Bot and Abuse Protection.
7.1. No Supabase, em Authentication > Sign In / Providers > Email, conferir **Minimum password length = 6** e **Password requirements = Lowercase, uppercase letters and digits**. Testar que um cadastro com `abcdef1` é recusado pelo próprio Supabase.
8. Conferir logs do backend sem credenciais ou tokens.

## Estado atual

O código e as migrations do limite de login e da API estão implementados. A migration de segurança da API ainda não foi aplicada e o deploy da nova versão ainda depende de commit/push; este documento não trata mudanças locais como publicação concluída.
