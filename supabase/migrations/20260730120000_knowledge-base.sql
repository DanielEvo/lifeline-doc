-- Knowledge Base do assistente de IA (Meus Critérios, Documentos, Publicações).
-- Mesma convenção de measurements/loinc_pt_br: doctor_id é TEXT (médicos vivem em
-- doctors.json, não em auth.users), acesso só via service_role, RLS deny-all
-- explícito para anon/authenticated documentando a intenção.

-- ---------------------------------------------------------------------------
-- criterios — plano "Verdade": regra / métrica / estilo, classificado por IA
-- a partir do texto livre do médico.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- publications — descoberta de artigos (PubMed/JAMA/NEJM), ciclo de vida
-- novo -> adicionado -> vira Doc | descartado. linked_doc_id ganha a FK para
-- docs logo abaixo, depois que a tabela docs existir (referência circular).
-- ---------------------------------------------------------------------------
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
-- Dedup: mesmo DOI para o mesmo médico nunca duplica; sem DOI (RSS), dedup por título+fonte.
CREATE UNIQUE INDEX publications_doctor_doi_uidx ON public.publications (doctor_id, doi) WHERE doi IS NOT NULL;
CREATE UNIQUE INDEX publications_doctor_title_source_uidx ON public.publications (doctor_id, title, source) WHERE doi IS NULL;

-- ---------------------------------------------------------------------------
-- docs — biblioteca unificada: anexo (upload manual) ou publicacao (curada).
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- RLS: mesmo padrão de measurements — server-only via service_role.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Storage: bucket privado para os anexos de Documentos. Upload via signed
-- upload URL (browser -> storage direto, sem passar o arquivo pelo server fn).
-- Nenhuma policy é criada em storage.objects de propósito: RLS já vem
-- habilitada por padrão nessa tabela e, sem nenhuma policy para
-- anon/authenticated, o acesso já é negado por padrão. Uma policy aqui
-- (mesmo tentando restringir só ao bucket doctor-docs) teria efeito
-- permissivo sobre QUALQUER OUTRO bucket do projeto, já que policies do
-- Postgres são somadas (OR), não substituem o padrão — só o service_role
-- (usado pelo servidor via supabaseAdmin, que ignora RLS) acessa este bucket.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('doctor-docs', 'doctor-docs', false)
ON CONFLICT (id) DO NOTHING;
