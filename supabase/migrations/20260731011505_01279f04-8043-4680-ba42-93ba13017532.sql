CREATE TABLE public.appointments (
  id TEXT PRIMARY KEY,
  doctor_id TEXT NOT NULL,
  patient_id TEXT,
  date_time TIMESTAMPTZ NOT NULL,
  duration_min INTEGER,
  all_day BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'agendada'
    CHECK (status IN ('agendada', 'confirmada', 'realizada', 'faltou')),
  note TEXT,
  kind TEXT NOT NULL DEFAULT 'consulta' CHECK (kind IN ('consulta', 'bloqueio')),
  label TEXT,
  categoria_id TEXT,
  cor TEXT,
  descricao TEXT,
  local TEXT,
  recurrence_id TEXT,
  lembretes_min INTEGER[] NOT NULL DEFAULT '{}',
  request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX appointments_doctor_datetime_idx ON public.appointments (doctor_id, date_time);
CREATE INDEX appointments_doctor_recurrence_idx ON public.appointments (doctor_id, recurrence_id);
CREATE UNIQUE INDEX appointments_doctor_request_id_uidx
  ON public.appointments (doctor_id, request_id)
  WHERE request_id IS NOT NULL;

REVOKE ALL ON public.appointments FROM anon, authenticated;
GRANT ALL ON public.appointments TO service_role;

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No direct client access to appointments"
  ON public.appointments FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

COMMENT ON TABLE public.appointments IS 'Agenda de consultas/eventos por médico. Server-only (service_role) access; RLS denies all client roles.';