-- Keep payment status tables and the cash ledger consistent.
-- Apply after the existing functional-consistency migration.

BEGIN;

-- A participation can produce at most one ledger income movement.
WITH ranked_event_movements AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY partecipazione_evento_id
      ORDER BY data NULLS LAST, numero_operazione NULLS LAST, id
    ) AS duplicate_rank
  FROM public.registro_spese
  WHERE partecipazione_evento_id IS NOT NULL
)
DELETE FROM public.registro_spese AS movement
USING ranked_event_movements AS ranked
WHERE movement.id = ranked.id
  AND ranked.duplicate_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS registro_spese_partecipazione_evento_uidx
  ON public.registro_spese (partecipazione_evento_id)
  WHERE partecipazione_evento_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_event_payment_ledger()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  event_name text;
  event_amount numeric;
  event_method text;
  event_date date;
  existing_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.registro_spese
    WHERE partecipazione_evento_id = OLD.id;
    RETURN OLD;
  END IF;

  IF NEW.riscosso IS TRUE AND NEW.evento_id IS NOT NULL THEN
    SELECT
      e.nome_evento,
      COALESCE(NEW.quota_dovuta, e.quota_standard, 0),
      COALESCE(NULLIF(NEW.metodo_pagamento, ''), NULLIF(e.metodo_pagamento, ''), 'Contanti'),
      COALESCE(NULLIF(e.data_inizio::text, '')::date, current_date)
    INTO event_name, event_amount, event_method, event_date
    FROM public.eventi AS e
    WHERE e.id = NEW.evento_id;

    SELECT id
    INTO existing_id
    FROM public.registro_spese
    WHERE partecipazione_evento_id = NEW.id
    LIMIT 1;

    IF existing_id IS NULL THEN
      INSERT INTO public.registro_spese (
        importo,
        metodo,
        voce_spesa,
        tipo_movimento,
        data,
        ragazzo_id,
        partecipazione_evento_id,
        note
      )
      VALUES (
        event_amount,
        event_method,
        'Evento: ' || COALESCE(event_name, 'Evento Reparto'),
        'ENTRATA',
        event_date,
        NEW.ragazzo_id,
        NEW.id,
        'Pagamento ' || COALESCE(event_name, 'Evento Reparto')
      );
    ELSE
      UPDATE public.registro_spese
      SET
        importo = event_amount,
        metodo = event_method,
        voce_spesa = 'Evento: ' || COALESCE(event_name, 'Evento Reparto'),
        tipo_movimento = 'ENTRATA',
        data = event_date,
        ragazzo_id = NEW.ragazzo_id
      WHERE id = existing_id;
    END IF;
  ELSE
    DELETE FROM public.registro_spese
    WHERE partecipazione_evento_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS sync_event_payment_ledger_trigger
  ON public.partecipazioni_eventi;

CREATE TRIGGER sync_event_payment_ledger_trigger
AFTER INSERT OR UPDATE OF riscosso, metodo_pagamento, quota_dovuta, evento_id OR DELETE
ON public.partecipazioni_eventi
FOR EACH ROW
EXECUTE FUNCTION public.sync_event_payment_ledger();

CREATE OR REPLACE FUNCTION public.sync_monthly_payment_ledger()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  month_name text;
  month_paid boolean;
  quote_amount numeric;
  accounting_year text;
  existing_id uuid;
  existing_method text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.registro_spese
    WHERE quota_mensile_id = OLD.id;
    RETURN OLD;
  END IF;

  accounting_year := replace(
    coalesce(
      nullif((SELECT valore FROM public.impostazioni WHERE chiave = 'anno_scout_corrente'), ''),
      public.get_current_anno_scout()
    ),
    '/',
    '-'
  );

  quote_amount := coalesce(
    nullif((SELECT valore FROM public.impostazioni WHERE chiave = 'quota_mensile_standard'), '')::numeric,
    10
  );

  FOREACH month_name IN ARRAY ARRAY[
    'novembre', 'dicembre', 'gennaio', 'febbraio',
    'marzo', 'aprile', 'maggio', 'giugno'
  ] LOOP
    month_paid := coalesce((to_jsonb(NEW) ->> month_name)::boolean, false);

    SELECT id, metodo
    INTO existing_id, existing_method
    FROM public.registro_spese
    WHERE quota_mensile_id = NEW.id
      AND riferimento_quota = month_name
    LIMIT 1;

    IF month_paid THEN
      IF existing_id IS NULL THEN
        INSERT INTO public.registro_spese (
          importo,
          metodo,
          voce_spesa,
          tipo_movimento,
          data,
          ragazzo_id,
          quota_mensile_id,
          riferimento_quota,
          note
        )
        VALUES (
          quote_amount,
          'Contanti',
          'Quota Mensile',
          'ENTRATA',
          current_date,
          NEW.ragazzo_id,
          NEW.id,
          month_name,
          'Quota ' || initcap(month_name)
        );
      ELSE
        UPDATE public.registro_spese
        SET
          importo = quote_amount,
          metodo = coalesce(existing_method, 'Contanti'),
          voce_spesa = 'Quota Mensile',
          tipo_movimento = 'ENTRATA',
          data = coalesce(data, current_date),
          ragazzo_id = NEW.ragazzo_id
        WHERE id = existing_id;
      END IF;
    ELSE
      DELETE FROM public.registro_spese
      WHERE id = existing_id;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS sync_monthly_payment_ledger_trigger
  ON public.quote_mensili;

CREATE TRIGGER sync_monthly_payment_ledger_trigger
AFTER INSERT OR UPDATE OF novembre, dicembre, gennaio, febbraio, marzo, aprile, maggio, giugno, ragazzo_id OR DELETE
ON public.quote_mensili
FOR EACH ROW
EXECUTE FUNCTION public.sync_monthly_payment_ledger();

CREATE OR REPLACE FUNCTION public.sync_census_payment_ledger()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  accounting_year text;
  census_amount numeric;
  existing_id uuid;
  existing_method text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.registro_spese
    WHERE ragazzo_id = OLD.id
      AND riferimento_censimento_anno IS NOT NULL;
    RETURN OLD;
  END IF;

  accounting_year := replace(
    coalesce(
      nullif((SELECT valore FROM public.impostazioni WHERE chiave = 'anno_scout_corrente'), ''),
      public.get_current_anno_scout()
    ),
    '/',
    '-'
  );

  census_amount := coalesce(NEW.importo_censimento, 45);

  SELECT id, metodo
  INTO existing_id, existing_method
  FROM public.registro_spese
  WHERE ragazzo_id = NEW.id
    AND riferimento_censimento_anno = accounting_year
  LIMIT 1;

  IF NEW.quota_censimento IS TRUE THEN
    IF existing_id IS NULL THEN
      INSERT INTO public.registro_spese (
        importo,
        metodo,
        voce_spesa,
        tipo_movimento,
        data,
        ragazzo_id,
        riferimento_censimento_anno,
        note
      )
      VALUES (
        census_amount,
        'Contanti',
        'Quota Censimento',
        'ENTRATA',
        current_date,
        NEW.id,
        accounting_year,
        'Censimento ' || accounting_year
      );
    ELSE
      UPDATE public.registro_spese
      SET
        importo = census_amount,
        metodo = coalesce(existing_method, 'Contanti'),
        voce_spesa = 'Quota Censimento',
        tipo_movimento = 'ENTRATA',
        data = coalesce(data, current_date)
      WHERE id = existing_id;
    END IF;
  ELSE
    DELETE FROM public.registro_spese
    WHERE ragazzo_id = NEW.id
      AND riferimento_censimento_anno = accounting_year;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS sync_census_payment_ledger_trigger
  ON public.ragazzi;

CREATE TRIGGER sync_census_payment_ledger_trigger
AFTER INSERT OR UPDATE OF quota_censimento, importo_censimento OR DELETE
ON public.ragazzi
FOR EACH ROW
EXECUTE FUNCTION public.sync_census_payment_ledger();

COMMIT;
