-- Direitos assistidos: registrar a decisão não altera consentimentos ou tratamento.
begin;

-- Excluir uma conta também remove os dados do responsável vinculados a ela.
-- Registros legados já órfãos exigem inventário e atendimento institucional.
alter table public.account_admissions drop constraint account_admissions_user_id_fkey;
alter table public.account_admissions add constraint account_admissions_user_id_fkey
  foreign key(user_id) references public.profiles(id) on delete cascade;

alter table public.privacy_requests drop constraint privacy_requests_kind_check;
alter table public.privacy_requests add constraint privacy_requests_kind_check check (
  kind in ('access', 'correction', 'anonymization', 'deletion',
    'confirmation', 'sharing', 'opposition', 'revocation', 'portability', 'automated_review')
);
-- privacy_request_corrections_shape já exige {} para todo tipo diferente de correction.

-- Mantém o corpo e a assinatura existentes, inclusive os locks, as verificações de
-- administrador/conta/expiração, os grants e o fluxo destrutivo anterior.
-- Os novos tipos chegam somente ao UPDATE final, sem exportação ou efeitos na conta.
do $migration$
declare
  definition text := pg_get_functiondef(
    'public.resolve_privacy_request(uuid,uuid,text,text,text,text)'::regprocedure);
  marker text := '  if item.kind = ''correction'' then';
begin
  if strpos(definition, marker) = 0 then
    raise exception 'Corpo da RPC incompatível com a extensão de direitos';
  end if;
  execute replace(definition, marker, $guard$
  if item.kind in ('opposition', 'revocation')
     and p_confirmation is distinct from 'MEDIDA CONFIRMADA' then
    raise exception using errcode = 'PT400',
      message = 'Confirme a medida adotada e descreva sua referência na resposta ao titular';
  end if;

  if item.kind = 'correction' then$guard$);
end;
$migration$;

commit;
