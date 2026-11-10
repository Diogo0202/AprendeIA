# Autenticação e acesso

## Cadastro

O formulário público oferece aluno e professor, mas não permite criar uma conta administrativa.

- Aluno: entra com `role = student`.
- Professor: começa como aluno com `registration_status = pending_teacher`.
- Administração: aprova a solicitação e atribui uma disciplina disponível.

A função `private.handle_new_user()` ignora tentativas de escolher um cargo privilegiado diretamente pelos metadados do navegador.

## Login

O React envia e-mail e senha para `POST /auth/login`. O backend verifica o limite, autentica no Supabase e devolve apenas os tokens necessários para `supabase.auth.setSession()`.

## Confirmação de e-mail e política de senha

- O cadastro pede confirmação por e-mail e direciona o retorno à origem atual do frontend (`emailRedirectTo`). Essa origem precisa estar na lista de Redirect URLs do projeto Supabase; em produção, mantenha somente domínios exatos e necessários.
- A senha deve ter de 6 a 128 caracteres e incluir pelo menos uma letra maiúscula, uma letra minúscula e um número. A interface explica a regra no cadastro e na redefinição, e a rota administrativa aplica a mesma validação.
- O cadastro público, a solicitação docente e a redefinição chamam o Supabase Auth direto do navegador (`signUp` e `updateUser`), sem passar pela API. Nesses fluxos, só o Supabase aplica a regra no servidor. Em Authentication > Sign In / Providers > Email, defina **Minimum password length = 6** e **Password requirements = Lowercase, uppercase letters and digits**. Sem essa configuração, uma chamada direta à API do Supabase aceita senha que a interface recusaria.

### Limite de tentativas

- Até 5 tentativas por e-mail normalizado em uma janela de 15 minutos.
- A 5ª falha responde `429 Too Many Requests` e inicia um bloqueio de 5 minutos.
- Se ocorrer uma nova rodada de cinco falhas depois do desbloqueio, a espera dobra para 10, 20, 40 minutos e assim por diante, limitada a 24 horas. Um login correto apaga o histórico de reincidência.
- Cada tentativa da conta é reservada no banco antes de conferir a senha; uma rajada paralela também fica limitada a cinco chamadas.
- Existe uma barreira secundária de 100 falhas por rede em 15 minutos.
- Um login correto limpa o contador da conta, mas não o contador coletivo da rede. Isso evita que uma senha válida zere a proteção contra tentativa em massa.
- E-mail e IP viram hashes HMAC-SHA256 antes de chegar ao banco.

Os contadores ficam em `private.login_rate_limits`. As funções públicas de apoio podem ser executadas apenas por `service_role`; `anon` e `authenticated` não recebem acesso.

O bloqueio customizado aplica-se ao endpoint da aplicação. O Supabase Auth mantém limites próprios para chamadas diretas pela chave publicável. Configure e monitore também Authentication > Rate Limits, sobretudo signup, recovery, verify e token.

## Recuperação de senha

O frontend solicita o link por `resetPasswordForEmail` e apresenta resposta neutra, exista ou não conta para aquele e-mail. A senha só é atualizada na sessão aberta pelo link e deve seguir a mesma política do cadastro; ao concluir, a sessão é encerrada e o usuário entra novamente. A configuração de Redirect URLs no painel do Supabase foi completada para os domínios do AprendeIA. A política de senha de 6 a 128 caracteres com pelo menos uma letra maiúscula, uma minúscula e um número está ativa e aplicada tanto no cadastro quanto na redefinição.

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
- `supabase/migrations/20260921150000_progressive_login_lockout.sql` — quinta tentativa, bloqueio inicial de cinco minutos e duplicação por reincidência.

## Pontos de atenção

- `RATE_LIMIT_PEPPER` deve ser longo, aleatório e existir apenas no backend. Se não for informado, o sistema usa a chave secreta do Supabase como chave HMAC.
- O frontend ainda precisa da chave **publicável** do Supabase; ela não é uma chave administrativa.
- O limite do backend não substitui os limites nativos do Supabase. Para reduzir abuso do cadastro e recuperação de senha, o CAPTCHA (Turnstile) já está configurado e as opções de Auth do projeto estão ativas.
- Antes de produção, confirme no painel Supabase: confirmação de e-mail ativa, política de senha compatível, proteção contra senhas vazadas se disponível e Redirect URLs restritos aos domínios do AprendeIA. Essas configurações foram validadas após a conclusão de RF-04.
