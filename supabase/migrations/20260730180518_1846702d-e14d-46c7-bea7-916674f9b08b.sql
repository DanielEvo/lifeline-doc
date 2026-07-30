CREATE TABLE public.criterios (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  doctor_id TEXT NOT NULL,
  label TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('regra', 'metrica', 'estilo')),
  raw_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX criterios_doctor_idx ON public.criterios (doctor_id);

CREATE TABLE public.publications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  doctor_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('pubmed', 'jama', 'nejm')),
  doi TEXT,
  title TEXT NOT NULL,
  journal TEXT NOT NULL,
  published_at DATE,
  abstract TEXT,
  url TEXT NOT NULL,
  matched_topics TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'novo' CHECK (status IN ('novo', 'adicionado', 'descartado')),
  status_changed_at TIMESTAMPTZ,
  linked_doc_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX publications_doctor_status_idx ON public.publications (doctor_id, status);
CREATE UNIQUE INDEX publications_doctor_doi_uidx ON public.publications (doctor_id, doi) WHERE doi IS NOT NULL;
CREATE UNIQUE INDEX publications_doctor_title_source_uidx ON public.publications (doctor_id, title, source) WHERE doi IS NULL;

CREATE TABLE public.docs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  doctor_id TEXT NOT NULL,
  name TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('anexo', 'publicacao')),
  format TEXT CHECK (format IN ('pdf', 'book', 'paper')),
  storage_path TEXT,
  size_bytes BIGINT,
  source_publication_id UUID REFERENCES public.publications (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX docs_doctor_idx ON public.docs (doctor_id);

ALTER TABLE public.publications
  ADD CONSTRAINT publications_linked_doc_id_fkey
  FOREIGN KEY (linked_doc_id) REFERENCES public.docs (id) ON DELETE SET NULL;

REVOKE ALL ON public.criterios FROM anon, authenticated;
REVOKE ALL ON public.docs FROM anon, authenticated;
REVOKE ALL ON public.publications FROM anon, authenticated;

GRANT ALL ON public.criterios TO service_role;
GRANT ALL ON public.docs TO service_role;
GRANT ALL ON public.publications TO service_role;

ALTER TABLE public.criterios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct client access to criterios"
  ON public.criterios FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "No direct client access to docs"
  ON public.docs FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);
CREATE POLICY "No direct client access to publications"
  ON public.publications FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

COMMENT ON TABLE public.criterios IS 'Meus Critérios (regra/métrica/estilo) do médico. Server-only (service_role) access; RLS denies all client roles.';
COMMENT ON TABLE public.docs IS 'Biblioteca unificada de documentos (anexo manual ou publicação curada). Server-only (service_role) access; RLS denies all client roles.';
COMMENT ON TABLE public.publications IS 'Descoberta de publicações científicas (PubMed/JAMA/NEJM). Server-only (service_role) access; RLS denies all client roles.';