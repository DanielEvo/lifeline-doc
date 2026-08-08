CREATE TABLE IF NOT EXISTS public.kv_collections (
  name text PRIMARY KEY,
  rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.kv_collections TO service_role;

ALTER TABLE public.kv_collections ENABLE ROW LEVEL SECURITY;