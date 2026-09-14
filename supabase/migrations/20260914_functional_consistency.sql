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

-- Canonicalize accounting-year suffixes stored in settings keys.
UPDATE public.impostazioni
SET chiave = regexp_replace(chiave, '(\\d{4})/(\\d{4})
  ON public.quote_mensili (ragazzo_id, anno_scout);

ALTER TABLE public.registro_spese
  ADD COLUMN IF NOT EXISTS riferimento_censimento_anno text;

WITH ranked_movements AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY quota_mensile_id, riferimento_quota
      ORDER BY data NULLS LAST, numero_operazione NULLS LAST, id
    ) AS row_number
  FROM public.registro_spese
  WHERE quota_mensile_id IS NOT NULL AND riferimento_quota IS NOT NULL
)
DELETE FROM public.registro_spese
WHERE id IN (
  SELECT id FROM ranked_movements WHERE row_number > 1
);

CREATE UNIQUE INDEX IF NOT EXISTS registro_spese_quota_mese_uidx
  ON public.registro_spese (quota_mensile_id, riferimento_quota)
  WHERE quota_mensile_id IS NOT NULL AND riferimento_quota IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS registro_spese_censimento_anno_uidx
  ON public.registro_spese (ragazzo_id, riferimento_censimento_anno)
  WHERE ragazzo_id IS NOT NULL AND riferimento_censimento_anno IS NOT NULL;

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

CREATE OR REPLACE FUNCTION public.prevent_closed_period_changes()
RETURNS trigger AS $
DECLARE
  movement_date date := COALESCE(NEW.data, OLD.data, CURRENT_DATE);
  start_year int;
  accounting_year text;
  closed_value text;
BEGIN
  start_year := CASE
    WHEN EXTRACT(MONTH FROM movement_date) >= 10 THEN EXTRACT(YEAR FROM movement_date)::int
    ELSE EXTRACT(YEAR FROM movement_date)::int - 1
  END;
  accounting_year := start_year || '-' || (start_year + 1);

  SELECT valore INTO closed_value
  FROM public.impostazioni
  WHERE chiave = 'anno_chiuso_' || accounting_year;

  IF closed_value = 'true' THEN
    RAISE EXCEPTION 'Anno contabile % chiuso: movimento non modificabile', accounting_year
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS protect_closed_registro_spese ON public.registro_spese;
CREATE TRIGGER protect_closed_registro_spese
  BEFORE INSERT OR UPDATE OR DELETE ON public.registro_spese
  FOR EACH ROW EXECUTE FUNCTION public.prevent_closed_period_changes();

COMMIT;
, '\\1-\\2')
WHERE chiave ~ '(saldo_iniziale_cassa_|saldo_iniziale_banca_|anno_chiuso_)\\d{4}/\\d{4}
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

  AND NOT EXISTS (
    SELECT 1
    FROM public.impostazioni AS canonical
    WHERE canonical.chiave = regexp_replace(impostazioni.chiave, '(\\d{4})/(\\d{4})
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
, '\\1-\\2')
  );

DELETE FROM public.impostazioni
WHERE chiave ~ '(saldo_iniziale_cassa_|saldo_iniziale_banca_|anno_chiuso_)\\d{4}/\\d{4}
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
;

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
