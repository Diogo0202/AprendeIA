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
- `VITE_API_URL`.

Somente a chave publicável entra no frontend.

## Railway

O projeto usa dois serviços no mesmo repositório:

| Serviço | Root Directory | Porta |
| --- | --- | --- |
| API | `/backend` | valor de `PORT` usado pelo container |
| Web | `/frontend` | Nginx definido no Dockerfile |

Depois de publicar o frontend, coloque sua URL exata em `FRONTEND_URL` no serviço da API. No frontend, `VITE_API_URL` deve apontar para a URL pública do backend.

Para reconhecer o IP do usuário atrás do Railway, configure `TRUSTED_PROXY_CIDRS` somente com a rede interna confirmada para o proxy. O código lê `X-Real-IP` apenas nesse caso.

## Checklist antes do deploy

1. Executar `python -m unittest discover -s backend -v` na raiz.
2. Executar `npm run build` em `frontend`.
3. Confirmar que `.env`, `.env.local` e chaves não aparecem no `git diff`.
4. Confirmar migrations aplicadas no Supabase.
5. Configurar `RATE_LIMIT_PEPPER`, OpenAI, SMTP e segredo semanal no Railway.
6. Testar login correto, quatro senhas erradas e retorno `429`.
7. Testar uma conta de cada cargo.
8. Conferir logs do backend sem credenciais ou tokens.

## Estado atual

O código e as migrations do limite de login estão implementados. O deploy da nova versão ainda depende de commit/push e da atualização das variáveis no Railway; este documento não trata mudanças locais como publicação concluída.
