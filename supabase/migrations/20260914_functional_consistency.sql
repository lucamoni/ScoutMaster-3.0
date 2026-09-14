-- Functional consistency: canonical scout years and duplicate prevention
-- Run this migration before deploying the matching application version.

BEGIN;

-- Group monthly-fee rows by member and canonical scout year. This preserves
-- payments when both the legacy YYYY/YYYY and canonical YYYY-YYYY rows exist.
CREATE TEMP TABLE quote_merge_groups ON COMMIT DROP AS
SELECT
  ragazzo_id,
  replace(anno_scout, '/', '-') AS canonical_year,
  (array_agg(id ORDER BY id))[1] AS keep_id,
  bool_or(coalesce(novembre, false)) AS novembre,
  bool_or(coalesce(dicembre, false)) AS dicembre,
  bool_or(coalesce(gennaio, false)) AS gennaio,
  bool_or(coalesce(febbraio, false)) AS febbraio,
  bool_or(coalesce(marzo, false)) AS marzo,
  bool_or(coalesce(aprile, false)) AS aprile,
  bool_or(coalesce(maggio, false)) AS maggio,
  bool_or(coalesce(giugno, false)) AS giugno
FROM public.quote_mensili
GROUP BY ragazzo_id, replace(anno_scout, '/', '-');

CREATE TEMP TABLE quote_merge_map ON COMMIT DROP AS
SELECT
  quote.id AS duplicate_id,
  grouped.keep_id
FROM public.quote_mensili AS quote
JOIN quote_merge_groups AS grouped
  ON quote.ragazzo_id IS NOT DISTINCT FROM grouped.ragazzo_id
 AND replace(quote.anno_scout, '/', '-') = grouped.canonical_year
WHERE quote.id <> grouped.keep_id;

UPDATE public.quote_mensili AS quote
SET
  anno_scout = grouped.canonical_year,
  novembre = grouped.novembre,
  dicembre = grouped.dicembre,
  gennaio = grouped.gennaio,
  febbraio = grouped.febbraio,
  marzo = grouped.marzo,
  aprile = grouped.aprile,
  maggio = grouped.maggio,
  giugno = grouped.giugno
FROM quote_merge_groups AS grouped
WHERE quote.id = grouped.keep_id;

-- Keep existing ledger links valid when duplicate monthly-fee rows are merged.
UPDATE public.registro_spese AS movement
SET quota_mensile_id = mapping.keep_id
FROM quote_merge_map AS mapping
WHERE movement.quota_mensile_id = mapping.duplicate_id;

DELETE FROM public.quote_mensili AS quote
USING quote_merge_map AS mapping
WHERE quote.id = mapping.duplicate_id;

CREATE UNIQUE INDEX IF NOT EXISTS quote_mensili_ragazzo_anno_uidx
  ON public.quote_mensili (ragazzo_id, anno_scout);

-- Canonicalize accounting-year suffixes stored in settings. Existing canonical
-- values take precedence over their legacy slash-form equivalents.
INSERT INTO public.impostazioni (chiave, valore)
SELECT
  left(chiave, length(chiave) - 9) || replace(right(chiave, 9), '/', '-'),
  valore
FROM public.impostazioni
WHERE right(chiave, 9) ~ '^[0-9]{4}/[0-9]{4}$'
  AND (
    chiave LIKE 'saldo_iniziale_cassa_%'
    OR chiave LIKE 'saldo_iniziale_banca_%'
    OR chiave LIKE 'anno_chiuso_%'
  )
ON CONFLICT (chiave) DO NOTHING;

DELETE FROM public.impostazioni
WHERE right(chiave, 9) ~ '^[0-9]{4}/[0-9]{4}$'
  AND (
    chiave LIKE 'saldo_iniziale_cassa_%'
    OR chiave LIKE 'saldo_iniziale_banca_%'
    OR chiave LIKE 'anno_chiuso_%'
  );

ALTER TABLE public.registro_spese
  ADD COLUMN IF NOT EXISTS riferimento_censimento_anno text;

-- Updating monthly-fee links can expose duplicate ledger movements. Keep the
-- oldest operation deterministically before adding database-level safeguards.
WITH ranked_movements AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY quota_mensile_id, riferimento_quota
      ORDER BY data NULLS LAST, numero_operazione NULLS LAST, id
    ) AS duplicate_rank
  FROM public.registro_spese
  WHERE quota_mensile_id IS NOT NULL
    AND riferimento_quota IS NOT NULL
)
DELETE FROM public.registro_spese AS movement
USING ranked_movements AS ranked
WHERE movement.id = ranked.id
  AND ranked.duplicate_rank > 1;

WITH ranked_census_movements AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY ragazzo_id, riferimento_censimento_anno
      ORDER BY data NULLS LAST, numero_operazione NULLS LAST, id
    ) AS duplicate_rank
  FROM public.registro_spese
  WHERE ragazzo_id IS NOT NULL
    AND riferimento_censimento_anno IS NOT NULL
)
DELETE FROM public.registro_spese AS movement
USING ranked_census_movements AS ranked
WHERE movement.id = ranked.id
  AND ranked.duplicate_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS registro_spese_quota_mese_uidx
  ON public.registro_spese (quota_mensile_id, riferimento_quota)
  WHERE quota_mensile_id IS NOT NULL
    AND riferimento_quota IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS registro_spese_censimento_anno_uidx
  ON public.registro_spese (ragazzo_id, riferimento_censimento_anno)
  WHERE ragazzo_id IS NOT NULL
    AND riferimento_censimento_anno IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_current_anno_scout()
RETURNS text
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
  current_month integer := extract(month FROM current_date)::integer;
  current_year integer := extract(year FROM current_date)::integer;
BEGIN
  IF current_month >= 10 THEN
    RETURN current_year || '-' || (current_year + 1);
  END IF;

  RETURN (current_year - 1) || '-' || current_year;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_closed_period_changes()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  movement_date date;
  start_year integer;
  accounting_year text;
  closed_value text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    movement_date := old.data;
  ELSE
    movement_date := new.data;
  END IF;

  movement_date := coalesce(movement_date, current_date);

  IF extract(month FROM movement_date) >= 10 THEN
    start_year := extract(year FROM movement_date)::integer;
  ELSE
    start_year := extract(year FROM movement_date)::integer - 1;
  END IF;

  accounting_year := start_year || '-' || (start_year + 1);

  SELECT valore
  INTO closed_value
  FROM public.impostazioni
  WHERE chiave = 'anno_chiuso_' || accounting_year;

  IF coalesce(closed_value, 'false') = 'true' THEN
    RAISE EXCEPTION
      'Anno contabile % chiuso: movimento non modificabile',
      accounting_year
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN old;
  END IF;

  RETURN new;
END;
$function$;

DROP TRIGGER IF EXISTS protect_closed_registro_spese
  ON public.registro_spese;

CREATE TRIGGER protect_closed_registro_spese
  BEFORE INSERT OR UPDATE OR DELETE
  ON public.registro_spese
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_closed_period_changes();

COMMIT;
