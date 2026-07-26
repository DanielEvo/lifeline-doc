CREATE TABLE public.measurements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  doctor_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  name TEXT NOT NULL,
  loinc_code TEXT,
  loinc_confidence TEXT NOT NULL DEFAULT 'unmapped' CHECK (loinc_confidence IN ('exact','fuzzy','unmapped')),
  unit TEXT NOT NULL,
  value NUMERIC NOT NULL,
  ref_min NUMERIC NOT NULL,
  ref_max NUMERIC NOT NULL,
  date DATE NOT NULL,
  label TEXT NOT NULL,
  motivo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX measurements_doctor_patient_idx ON public.measurements (doctor_id, patient_id);
CREATE INDEX measurements_loinc_idx ON public.measurements (loinc_code);
GRANT ALL ON public.measurements TO service_role;
ALTER TABLE public.measurements ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.patient_pending_measurements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  global_id TEXT NOT NULL,
  raw_name TEXT NOT NULL,
  matched_name TEXT,
  loinc_code TEXT,
  loinc_confidence TEXT NOT NULL DEFAULT 'unmapped' CHECK (loinc_confidence IN ('exact','fuzzy','unmapped')),
  value NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  ref_min NUMERIC,
  ref_max NUMERIC,
  collection_date DATE,
  confirmed_by_doctor BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX patient_pending_measurements_global_id_idx ON public.patient_pending_measurements (global_id);
GRANT ALL ON public.patient_pending_measurements TO service_role;
ALTER TABLE public.patient_pending_measurements ENABLE ROW LEVEL SECURITY;