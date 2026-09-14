-- Functional consistency: canonical scout years and duplicate prevention
-- Run through the Supabase migration pipeline before deploying the matching app version.

BEGIN;

-- Merge legacy slash-form rows into an existing canonical dash-form row.
UPDATE public.quote_mensili AS canonical
SET
  novembre = COALESCE(canonical.novembre, false) OR COALESCE(legacy.novembre, false),
  dicembre = COALESCE(canonical.dicembre, false) OR COALESCE(legacy.dicembre, false),
  gennaio = COALESCE(canonical.gennaio, false) OR COALESCE(legacy.gennaio, false),
  febbraio = COALESCE(canonical.febbraio, false) OR COALESCE(legacy.febbraio, false),
  marzo = COALESCE(canonical.marzo, false) OR COALESCE(legacy.marzo, false),
  aprile = COALESCE(canonical.aprile, false) OR COALESCE(legacy.aprile, false),
  maggio = COALESCE(canonical.maggio, false) OR COALESCE(legacy.maggio, false),
  giugno = COALESCE(canonical.giugno, false) OR COALESCE(legacy.giugno, false)
FROM public.quote_mensili AS legacy
WHERE legacy.ragazzo_id = canonical.ragazzo_id
  AND legacy.anno_scout LIKE '%/%'
  AND canonical.anno_scout = replace(legacy.anno_scout, '/', '-');

DELETE FROM public.quote_mensili AS legacy
USING public.quote_mensili AS canonical
WHERE legacy.id <> canonical.id
  AND legacy.ragazzo_id = canonical.ragazzo_id
  AND legacy.anno_scout LIKE '%/%'
  AND canonical.anno_scout = replace(legacy.anno_scout, '/', '-');

UPDATE public.quote_mensili
SET anno_scout = replace(anno_scout, '/', '-')
WHERE anno_scout LIKE '%/%';

CREATE UNIQUE INDEX IF NOT EXISTS quote_mensili_ragazzo_anno_uidx
  ON public.quote_mensili (ragazzo_id, anno_scout);

CREATE UNIQUE INDEX IF NOT EXISTS registro_spese_quota_mese_uidx
  ON public.registro_spese (quota_mensile_id, riferimento_quota)
  WHERE quota_mensile_id IS NOT NULL AND riferimento_quota IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_current_anno_scout() RETURNS text AS $$
DECLARE
  current_month int := EXTRACT(MONTH FROM CURRENT_DATE);
  current_year int := EXTRACT(YEAR FROM CURRENT_DATE);
BEGIN
  IF current_month >= 10 THEN
    RETURN current_year || '-' || (current_year + 1);
  END IF;

  RETURN (current_year - 1) || '-' || current_year;
END;
$$ LANGUAGE plpgsql STABLE;

COMMIT;
