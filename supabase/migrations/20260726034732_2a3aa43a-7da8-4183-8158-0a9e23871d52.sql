CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE public.loinc_pt_br (
  loinc_code TEXT PRIMARY KEY,
  component_pt TEXT NOT NULL,
  short_name TEXT,
  class TEXT NOT NULL,
  system TEXT,
  scale_typ TEXT
);

CREATE INDEX loinc_pt_br_component_trgm_idx ON public.loinc_pt_br USING gin (component_pt gin_trgm_ops);
CREATE INDEX loinc_pt_br_class_idx ON public.loinc_pt_br (class);

ALTER TABLE public.loinc_pt_br ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loinc_pt_br TO service_role;