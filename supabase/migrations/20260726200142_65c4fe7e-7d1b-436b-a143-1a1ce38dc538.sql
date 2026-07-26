-- Explicitly revoke any Data API access for anon/authenticated on server-only clinical tables
REVOKE ALL ON public.measurements FROM anon, authenticated;
REVOKE ALL ON public.patient_pending_measurements FROM anon, authenticated;
REVOKE ALL ON public.loinc_pt_br FROM anon, authenticated;

GRANT ALL ON public.measurements TO service_role;
GRANT ALL ON public.patient_pending_measurements TO service_role;
GRANT ALL ON public.loinc_pt_br TO service_role;

ALTER TABLE public.measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_pending_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loinc_pt_br ENABLE ROW LEVEL SECURITY;

-- Explicit default-deny policies (documented intent, not implicit absence)
DROP POLICY IF EXISTS "No direct client access to measurements" ON public.measurements;
CREATE POLICY "No direct client access to measurements"
  ON public.measurements
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "No direct client access to pending measurements" ON public.patient_pending_measurements;
CREATE POLICY "No direct client access to pending measurements"
  ON public.patient_pending_measurements
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "No direct client access to loinc reference" ON public.loinc_pt_br;
CREATE POLICY "No direct client access to loinc reference"
  ON public.loinc_pt_br
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE public.measurements IS 'Sensitive patient biomarker history. Server-only (service_role) access; RLS denies all client roles.';
COMMENT ON TABLE public.patient_pending_measurements IS 'Unconfirmed patient-submitted lab data. Server-only (service_role) access; RLS denies all client roles.';
COMMENT ON TABLE public.loinc_pt_br IS 'LOINC pt-BR reference data, seeded externally. Server-only (service_role) access; RLS denies all client roles.';