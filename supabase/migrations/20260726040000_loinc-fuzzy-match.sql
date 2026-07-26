-- Extensão unaccent para normalização de acentos no matching fuzzy do LOINC.
-- pg_trgm já mora em `extensions` (ver migração 20260726034755_...) — segue a
-- mesma convenção aqui em vez de instalar em `public` (linter do Supabase
-- reclama de extensão em public). Caminho preferido do handover LOINC v3: se
-- a instalação falhar neste projeto, cair para comparação sem unaccent no SQL
-- (normalize() do lado JS já remove acentos antes de chamar a RPC — vira
-- assimétrico e perde qualidade de match, mas não quebra).
create extension if not exists unaccent with schema extensions;

create or replace function public.loinc_fuzzy_match(search_term text, min_similarity float)
returns table (
  loinc_code text,
  component_pt text,
  short_name text,
  similarity float
)
language sql
stable
set search_path = extensions, public
as $$
  select
    loinc_code,
    component_pt,
    short_name,
    similarity(lower(unaccent(component_pt)), search_term) as similarity
  from loinc_pt_br
  where similarity(lower(unaccent(component_pt)), search_term) >= min_similarity
  order by similarity desc
  limit 5;
$$;

grant execute on function public.loinc_fuzzy_match(text, float) to service_role;
