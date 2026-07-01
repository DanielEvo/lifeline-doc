
CREATE TABLE public.leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  whatsapp TEXT NOT NULL DEFAULT '',
  especialidade TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT INSERT ON public.leads TO anon, authenticated;
GRANT ALL ON public.leads TO service_role;

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit a lead"
  ON public.leads FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    length(nome) BETWEEN 1 AND 120
    AND length(email) BETWEEN 3 AND 160
    AND length(whatsapp) <= 40
    AND length(especialidade) <= 60
  );
