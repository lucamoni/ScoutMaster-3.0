-- Mantiene privato il bucket degli scontrini anche in presenza di vecchie
-- policy permissive. Le policy RESTRICTIVE vengono combinate con tutte le altre.
UPDATE storage.buckets
SET public = false
WHERE id = 'scontrini';

DROP POLICY IF EXISTS "Block anonymous receipt access" ON storage.objects;
CREATE POLICY "Block anonymous receipt access"
ON storage.objects
AS RESTRICTIVE
FOR ALL
TO anon
USING (bucket_id <> 'scontrini')
WITH CHECK (bucket_id <> 'scontrini');

DROP POLICY IF EXISTS "Authenticated receipt access" ON storage.objects;
CREATE POLICY "Authenticated receipt access"
ON storage.objects
FOR ALL
TO authenticated
USING (bucket_id = 'scontrini')
WITH CHECK (bucket_id = 'scontrini');