-- RF22: a expiração e a admissão também valem entre claim e envio.
begin;
do $migration$
declare definition text; marker text;
begin
  definition := pg_get_functiondef('public.claim_email_delivery(uuid,uuid,text,date,date)'::regprocedure);
  marker := 'p.role = ''teacher'' and p.registration_status = ''active''';
  if strpos(definition, marker) = 0 then raise exception 'Contrato de claim incompatível'; end if;
  execute replace(definition, marker, marker || $guard$
    and p.auth_created_at <= now() and p.auth_created_at + interval '168 hours' > now()
    and (p.age_band = 'adult' or (p.age_band = 'minor' and p.admission_status = 'approved' and p.admission_version = '1'))
  $guard$);
  definition := pg_get_functiondef('public.begin_email_delivery(uuid,uuid)'::regprocedure);
  marker := 'and p.registration_status = ''active''';
  if strpos(definition, marker) = 0 then raise exception 'Contrato de envio incompatível'; end if;
  execute replace(definition, marker, marker || $guard$
    and p.auth_created_at <= now() and p.auth_created_at + interval '168 hours' > now()
    and (p.age_band = 'adult' or (p.age_band = 'minor' and p.admission_status = 'approved' and p.admission_version = '1'))
  $guard$);
end;
$migration$;
commit;
