-- Fonte central de versões. Novas publicações exigem INSERT, sem reescrever RPCs.
begin;

create table public.legal_document_versions (
  document_type text not null check (document_type in ('privacy', 'terms')),
  version text not null check (
    version ~ '^(0|[1-9][0-9]{0,8})[.](0|[1-9][0-9]{0,8})$'
  ),
  effective_at timestamptz not null default statement_timestamp()
    check (isfinite(effective_at)),
  primary key (document_type, version),
  unique (document_type, effective_at)
);

alter table public.legal_document_versions enable row level security;
alter table public.legal_document_versions force row level security;
revoke all on public.legal_document_versions from public, anon, authenticated, service_role;
grant select, insert on public.legal_document_versions to service_role;
create policy legal_document_versions_server_read on public.legal_document_versions
  for select to service_role using (true);
create policy legal_document_versions_server_insert on public.legal_document_versions
  for insert to service_role with check (true);
-- Conserva a barreira de ciclo de conta para todas as tabelas públicas com RLS.
create policy rf07_select on public.legal_document_versions as restrictive for select to authenticated using (private.lifecycle_access());
create policy rf07_insert on public.legal_document_versions as restrictive for insert to authenticated with check (private.lifecycle_access());
create policy rf07_update on public.legal_document_versions as restrictive for update to authenticated using (private.lifecycle_access()) with check (private.lifecycle_access());
create policy rf07_delete on public.legal_document_versions as restrictive for delete to authenticated using (private.lifecycle_access());

insert into public.legal_document_versions (document_type, version, effective_at)
values ('privacy', '1.7', '2026-11-09T00:00:00Z'), ('terms', '1.0', '2026-11-04T00:00:00Z');

-- Falta de configuração falha fechada. Uma publicação futura não antecipa o aceite.
create function private.current_legal_document(p_document_type text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  document jsonb;
begin
  if p_document_type is null or p_document_type not in ('privacy', 'terms') then
    raise exception using errcode = 'PT400', message = 'Tipo de documento legal inválido.';
  end if;
  select jsonb_build_object('version', versions.version, 'effective_at', versions.effective_at)
    into document
  from public.legal_document_versions as versions
  where versions.document_type = p_document_type
    and versions.effective_at <= statement_timestamp()
  order by versions.effective_at desc
  limit 1;
  if document is null then
    raise exception using errcode = 'PT503', message = 'Versão legal vigente indisponível.';
  end if;
  return document;
end;
$$;
revoke all on function private.current_legal_document(text) from public, anon, authenticated;
grant execute on function private.current_legal_document(text) to service_role;

-- Contrato servidor: {privacy: {version, effective_at}, terms: {version, effective_at}}.
create function public.get_current_legal_document_versions()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'privacy', private.current_legal_document('privacy'),
    'terms', private.current_legal_document('terms')
  );
$$;
revoke all on function public.get_current_legal_document_versions() from public, anon, authenticated;
grant execute on function public.get_current_legal_document_versions() to service_role;

-- Preserva o corpo instalado, as assinaturas e os grants. Cada trecho deve ocorrer
-- exatamente uma vez; divergência aborta toda a migration, inclusive a nova tabela.
do $patch$
declare
  target record;
  function_oid regprocedure;
  definition text;
  marker text;
  marker_index integer;
begin
  for target in
    select * from (values
      ('private.handle_new_user()',
       array[
         $old$policy_version_value = '1.7'$old$,
         $old$terms_version_value = '1.0'$old$,
         $old$'O aceite dos Termos de Uso v1.0 e da Política de Privacidade v1.7 é necessário para criar a conta.'$old$
       ],
       array[
         $new$policy_version_value = (private.current_legal_document('privacy')->>'version')$new$,
         $new$terms_version_value = (private.current_legal_document('terms')->>'version')$new$,
         $new$'O aceite das versões vigentes dos Termos de Uso e da Política de Privacidade é necessário para criar a conta.'$new$
       ]),
      ('public.record_privacy_policy_acceptance(uuid,text,text)',
       array[
         $old$target_policy_version is distinct from '1.7'$old$,
         $old$target_terms_version is distinct from '1.0'$old$
       ],
       array[
         $new$target_policy_version is distinct from (private.current_legal_document('privacy')->>'version')$new$,
         $new$target_terms_version is distinct from (private.current_legal_document('terms')->>'version')$new$
       ]),
      ('private.gamification_visible(uuid)',
       array[$old$p.privacy_policy_version='1.7'$old$, $old$p.terms_of_use_version='1.0'$old$],
       array[
         $new$p.privacy_policy_version=(private.current_legal_document('privacy')->>'version')$new$,
         $new$p.terms_of_use_version=(private.current_legal_document('terms')->>'version')$new$
       ])
    ) as patches(signature, old_fragments, new_fragments)
  loop
    function_oid := to_regprocedure(target.signature);
    if function_oid is null then
      raise exception 'Legal versions: função ausente: %', target.signature;
    end if;
    definition := pg_get_functiondef(function_oid);
    for marker_index in 1..array_length(target.old_fragments, 1) loop
      marker := target.old_fragments[marker_index];
      if (length(definition) - length(replace(definition, marker, ''))) <> length(marker) then
        raise exception 'Legal versions: marcador ausente ou repetido em %: %', target.signature, marker;
      end if;
      definition := replace(definition, marker, target.new_fragments[marker_index]);
    end loop;
    if position($literal$'1.7'$literal$ in definition) > 0
       or position($literal$'1.0'$literal$ in definition) > 0 then
      raise exception 'Legal versions: literal de versão remanescente em %', target.signature;
    end if;
    execute definition;
  end loop;
end;
$patch$;

commit;
