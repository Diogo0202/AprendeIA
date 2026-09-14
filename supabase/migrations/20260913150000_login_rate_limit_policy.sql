-- Mesmo com todas as permissões públicas revogadas, a política deixa explícito
-- para pessoas e analisadores que só o backend privilegiado usa os contadores.
create policy "login_rate_limits_service_only"
on private.login_rate_limits
for all
to service_role
using (true)
with check (true);

-- A primeira versão preparava uma limpeza geral por data. Como ela saiu do
-- caminho de login, manter esse índice só aumentaria o custo das gravações.
drop index if exists private.login_rate_limits_updated_at_idx;
