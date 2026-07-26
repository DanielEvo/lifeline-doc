CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;
DROP INDEX IF EXISTS public.loinc_pt_br_component_trgm_idx;
ALTER EXTENSION pg_trgm SET SCHEMA extensions;
CREATE INDEX loinc_pt_br_component_trgm_idx ON public.loinc_pt_br USING gin (component_pt extensions.gin_trgm_ops);