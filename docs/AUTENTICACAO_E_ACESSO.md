# Autenticação e acesso

## Cadastro

O formulário público oferece aluno e professor, mas não permite criar uma conta administrativa.

- Aluno: entra com `role = student`.
- Professor: começa como aluno com `registration_status = pending_teacher`.
- Administração: aprova a solicitação e atribui uma disciplina disponível.

A função `private.handle_new_user()` ignora tentativas de escolher um cargo privilegiado diretamente pelos metadados do navegador.

## Login

O React envia e-mail e senha para `POST /auth/login`. O backend verifica o limite, autentica no Supabase e devolve apenas os tokens necessários para `supabase.auth.setSession()`.

### Limite de tentativas

- Até 4 falhas por e-mail normalizado em uma janela de 15 minutos.
- A 4ª falha responde `429 Too Many Requests` e inicia o bloqueio.
- Cada tentativa da conta é reservada no banco antes de conferir a senha; uma rajada paralela também fica limitada a quatro chamadas.
- Existe uma barreira secundária de 100 falhas por rede em 15 minutos.
- Um login correto limpa o contador da conta, mas não o contador coletivo da rede. Isso evita que uma senha válida zere a proteção contra tentativa em massa.
- E-mail e IP viram hashes HMAC-SHA256 antes de chegar ao banco.

Os contadores ficam em `private.login_rate_limits`. As funções públicas de apoio podem ser executadas apenas por `service_role`; `anon` e `authenticated` não recebem acesso.

## Proxy e IP real

O backend ignora `X-Real-IP` por padrão. Esse cabeçalho só é aceito quando o IP do socket pertence a uma rede listada em `TRUSTED_PROXY_CIDRS`.

Exemplo de formato:

```env
TRUSTED_PROXY_CIDRS=100.0.0.0/8
```

O valor precisa corresponder à infraestrutura usada. Uma rede inválida faz o login falhar com `503`, em vez de cair para uma configuração insegura.

## Arquivos principais

- `frontend/src/App.tsx` — formulários, mensagens e criação da sessão.
- `frontend/src/lib/supabase.ts` — cliente público e leitura do token atual.
- `backend/auth_security.py` — normalização, HMAC e identificação segura da rede.
- `backend/main.py` — endpoint `/auth/login`, leitura da sessão e verificação do cargo.
- `supabase/migrations/20260911120000_teacher_registration_workflow.sql` — cadastro docente em duas etapas.
- `supabase/migrations/20260913143000_login_rate_limit.sql` — contadores e funções atômicas.
- `supabase/migrations/20260913150000_login_rate_limit_policy.sql` — política explícita da tabela privada.
- `supabase/migrations/20260913153000_login_attempt_reservation.sql` — reserva atômica que fecha tentativas simultâneas.

## Pontos de atenção

- `RATE_LIMIT_PEPPER` deve ser longo, aleatório e existir apenas no backend. Se não for informado, o sistema usa a chave secreta do Supabase como chave HMAC.
- O frontend ainda precisa da chave **publicável** do Supabase; ela não é uma chave administrativa.
- O limite do backend não substitui os limites nativos do Supabase. Para reduzir abuso do cadastro e recuperação de senha, ainda é recomendado configurar CAPTCHA e as opções de Auth do projeto.
- A proteção contra senhas conhecidas em vazamentos está desligada no projeto Supabase e precisa ser ativada no painel quando disponível.
