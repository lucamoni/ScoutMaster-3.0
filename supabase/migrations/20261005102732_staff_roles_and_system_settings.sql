-- Preserve the existing primary administrator; never assign roles from user_metadata.
UPDATE auth.users
SET raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin","protected_admin":true}'::jsonb
WHERE lower(email) = 'admin@scoutmaster.it'
  AND coalesce(raw_app_meta_data->>'role', 'admin') = 'admin';

CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated;
-- Auth records are not readable by clients. This narrow lookup reads only the
-- caller's trusted role and current account status, avoiding stale JWT permissions.
CREATE OR REPLACE FUNCTION private.current_staff_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT CASE lower(raw_app_meta_data->>'role')
    WHEN 'admin' THEN 'admin' WHEN 'capo_unita' THEN 'capo_unita'
    WHEN 'aiuto_capo_unita' THEN 'aiuto_capo_unita'
    WHEN 'capo' THEN 'capo_unita' WHEN 'tesoriere' THEN 'aiuto_capo_unita'
    ELSE NULL END
  FROM auth.users WHERE id = auth.uid()
    AND coalesce(raw_app_meta_data->>'disabled', 'false') <> 'true'
    AND (banned_until IS NULL OR banned_until <= now());
$$;
REVOKE ALL ON FUNCTION private.current_staff_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.current_staff_role() TO authenticated;

CREATE POLICY "Active staff settings" ON public.impostazioni AS RESTRICTIVE FOR ALL TO authenticated
USING ((SELECT private.current_staff_role()) IS NOT NULL)
WITH CHECK ((SELECT private.current_staff_role()) IS NOT NULL);

-- Reminders are operational. All other settings require ADMIN / CAPO UNITÀ.
CREATE POLICY "Staff settings insert" ON public.impostazioni AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK ((SELECT private.current_staff_role()) IN ('admin','capo_unita') OR chiave = 'reminder_link_gruppo');
CREATE POLICY "Staff settings update" ON public.impostazioni AS RESTRICTIVE FOR UPDATE TO authenticated
USING ((SELECT private.current_staff_role()) IN ('admin','capo_unita') OR chiave = 'reminder_link_gruppo')
WITH CHECK ((SELECT private.current_staff_role()) IN ('admin','capo_unita') OR chiave = 'reminder_link_gruppo');
CREATE POLICY "Staff settings delete" ON public.impostazioni AS RESTRICTIVE FOR DELETE TO authenticated
USING ((SELECT private.current_staff_role()) IN ('admin','capo_unita') OR chiave = 'reminder_link_gruppo');

