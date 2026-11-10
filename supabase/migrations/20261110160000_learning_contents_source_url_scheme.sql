-- O backend valida o esquema da URL, mas o professor também grava direto pelo
-- PostgREST. O banco passa a recusar qualquer coisa que não seja http(s).
-- NOT VALID evita falhar por linhas antigas; novas escritas já são checadas.
alter table public.learning_contents
  drop constraint if exists learning_contents_source_url_scheme;
alter table public.learning_contents
  add constraint learning_contents_source_url_scheme
  check (source_url = '' or source_url ~ '^https?://') not valid;
