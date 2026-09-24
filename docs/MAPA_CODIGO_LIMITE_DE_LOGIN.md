# Mapa do código: limite de tentativas no login

## Visão geral
O login passa pelo backend e bloqueia uma conta na quinta falha. A espera começa em cinco minutos e dobra a cada nova rodada de cinco erros, até 24 horas. Os contadores são atômicos e guardam somente hashes HMAC no Supabase.

## Estrutura
- `frontend/src/App.tsx` — envia o formulário ao endpoint protegido e mostra o tempo de espera.
- `backend/main.py` — coordena limite, autenticação e retorno da sessão.
- `backend/auth_security.py` — normaliza identidade, cria hashes e valida proxy/IP.
- `backend/test_auth_rate_limit.py` — cobre bloqueio, segredo, proxy e login correto.
- `supabase/migrations/20260913143000_login_rate_limit.sql` — guarda e atualiza os contadores com trava de linha.
- `supabase/migrations/20260913150000_login_rate_limit_policy.sql` — explicita que somente `service_role` usa a tabela.
- `supabase/migrations/20260913153000_login_attempt_reservation.sql` — reserva tentativas antes de consultar a senha.
- `supabase/migrations/20260921150000_progressive_login_lockout.sql` — registra reincidência e calcula a espera progressiva.

## Fluxo principal
1. `App.tsx` envia e-mail e senha para `POST /auth/login`.
2. `auth_security.py` normaliza e anonimiza conta e rede.
3. `main.py` consulta a rede, reserva uma tentativa da conta e só então autentica no Supabase.
4. Uma falha incrementa os contadores; a quarta retorna `429`.
5. Um login correto limpa o contador da conta e abre a sessão no React.

## Pontos de atenção
- `RATE_LIMIT_PEPPER` deve permanecer fora do Git.
- `X-Real-IP` só é aceito de redes listadas em `TRUSTED_PROXY_CIDRS`.
- O limite personalizado cobre o endpoint do backend; o Supabase mantém limites próprios na API pública de autenticação.
