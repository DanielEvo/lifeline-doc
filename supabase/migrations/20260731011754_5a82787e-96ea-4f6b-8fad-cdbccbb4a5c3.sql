-- Explicit, ownership-safe access rules for the private doctor-docs bucket.
-- All app access happens server-side via signed URLs (service role); browser
-- clients must never read/write objects directly.

DROP POLICY IF EXISTS "doctor_docs_service_all" ON storage.objects;
DROP POLICY IF EXISTS "doctor_docs_no_client_select" ON storage.objects;
DROP POLICY IF EXISTS "doctor_docs_no_client_write" ON storage.objects;

CREATE POLICY "doctor_docs_service_all"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'doctor-docs')
WITH CHECK (bucket_id = 'doctor-docs');

-- Restrictive guard: even if a permissive policy is added later, anon and
-- authenticated clients can never touch objects in this private bucket.
CREATE POLICY "doctor_docs_no_client_access"
ON storage.objects
AS RESTRICTIVE
FOR ALL
TO anon, authenticated
USING (bucket_id <> 'doctor-docs')
WITH CHECK (bucket_id <> 'doctor-docs');