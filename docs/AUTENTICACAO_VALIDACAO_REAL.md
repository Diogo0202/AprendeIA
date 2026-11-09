# Autenticação, CAPTCHA e validação externa

## Estado observado neste checkout

`backend/main.py` chama `verify_turnstile` no endpoint `POST /auth/login`, com a ação fixa `login`. Em modo `backend`, o servidor valida o token no Cloudflare e não o encaminha ao Auth. Em modo `supabase`, `authenticate_with_password` cria um cliente público e encaminha `captcha_token` a `sign_in_with_password`; o token não passa por Siteverify no backend.

O frontend chama Supabase Auth diretamente para cadastro (`signUp`) e recuperação (`resetPasswordForEmail`), enviando `captchaToken`. O CAPTCHA precisa estar ativo na configuração do Supabase Auth para impedir chamadas diretas sem token. Com esse fluxo atual, escolha `TURNSTILE_VERIFICATION_MODE=supabase` em produção. O modo `backend` cobre apenas o login atual; cadastro e recuperação não passam por rotas que validem CAPTCHA no backend.

O widget define ações `login`, `signup` e `recovery`, impede envio sem token em produção, limpa o valor após cada envio e reinicia o desafio. `clearAuthCallbackUrl` remove parâmetros e fragmento do retorno, mas `App.tsx` chama essa função apenas ao receber `PASSWORD_RECOVERY`.

## Integração necessária para o coordenador

Manter `TURNSTILE_VERIFICATION_MODE=supabase` como consumidor único do token nos três fluxos e confirmar no painel do Supabase que o CAPTCHA do Auth está habilitado para login, cadastro e recuperação. Verificar que o projeto Auth usa a site key correspondente e rejeita chamadas sem `captcha_token`/`captchaToken`.

Se for necessário suportar modo `backend`, criar rotas de backend para cadastro e recuperação antes de selecionar esse modo; elas devem validar `signup` ou `recovery` no servidor e consumir cada token uma única vez. O `App.tsx` atual envia esses pedidos diretamente ao Supabase, então uma alteração apenas no frontend não configura essa validação.

No callback de Auth, chamar `clearAuthCallbackUrl` somente depois que o cliente Supabase processar o retorno. A chamada atual cobre `PASSWORD_RECOVERY`. Validar também callbacks de confirmação de cadastro e outros retornos que contenham credenciais antes de removê-los. O frontend lê `access_token` do fragmento durante a inicialização; limpar o fragmento antes desse processamento pode interromper a sessão.

## Validação real ainda pendente

Os testes deste checkout simulam respostas do Cloudflare e do Supabase Auth. Eles não comprovam hostname/action configurados no Cloudflare, CAPTCHA ativo no projeto Supabase, entrega de e-mail, callback hospedado, expiração real nem bloqueio remoto de token reutilizado.

Para fechar a validação externa, registrar o hostname de produção na lista `TURNSTILE_ALLOWED_HOSTNAMES`, conferir a site key/secret sem expor os valores, confirmar o modo `supabase` e o CAPTCHA do Auth, e executar fluxos reais de login, cadastro e recuperação. Para recuperação, usar um link real uma vez, repetir o mesmo link após o consumo e testar outro após expirar; confirmar que o Auth recusa os dois últimos, que a interface mantém a mensagem segura e que nenhum token permanece na barra de endereço após o cliente processar o callback.

Não há evidência neste documento de validação contra o ambiente hospedado.
