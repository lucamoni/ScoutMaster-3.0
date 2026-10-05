-- Expand without seeding guessed history. Seed the verified source year explicitly
-- before opening newer years. Rollback requires restoring the legacy census
-- trigger and exporting annual snapshots first; never discard this history.
BEGIN;

CREATE TABLE public.roster_anni (
  anno_scout text PRIMARY KEY CHECK (anno_scout ~ '^[0-9]{4}-[0-9]{4}$'
    AND pg_catalog.split_part(anno_scout, '-', 2)::integer = pg_catalog.split_part(anno_scout, '-', 1)::integer + 1),
  copied_from text,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now()
);
ALTER TABLE public.roster_anni ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.roster_anni FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.roster_anni TO service_role;

CREATE TABLE public.ragazzi_anni (
  ragazzo_id uuid NOT NULL REFERENCES public.ragazzi(id) ON DELETE RESTRICT,
  anno_scout text NOT NULL CHECK (anno_scout ~ '^[0-9]{4}-[0-9]{4}$'
    AND pg_catalog.split_part(anno_scout, '-', 2)::integer = pg_catalog.split_part(anno_scout, '-', 1)::integer + 1),
  snapshot jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(snapshot) = 'object'),
  attivo boolean NOT NULL DEFAULT true,
  copied_from text,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY (ragazzo_id, anno_scout),
  CHECK (snapshot ? 'id' AND snapshot ->> 'id' = ragazzo_id::text),
  CHECK (snapshot ? 'attivo' AND (snapshot ->> 'attivo')::boolean = attivo)
);
CREATE INDEX ragazzi_anni_year_active ON public.ragazzi_anni(anno_scout, attivo, ragazzo_id);
ALTER TABLE public.ragazzi_anni ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ragazzi_anni FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ragazzi_anni TO service_role;
-- Client write revocation and the legacy trigger removal occur at production
-- cutover in annual_roster_cutover, after the new application is ready.

CREATE FUNCTION public.ensure_roster_year(p_year text)
RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $function$
DECLARE
  target_year text := pg_catalog.replace(pg_catalog.btrim(p_year), '/', '-');
  source_year text;
  copied_count integer;
BEGIN
  IF target_year IS NULL OR target_year !~ '^[0-9]{4}-[0-9]{4}$'
    OR pg_catalog.split_part(target_year, '-', 2)::integer <> pg_catalog.split_part(target_year, '-', 1)::integer + 1
    OR pg_catalog.split_part(target_year, '-', 1)::integer NOT BETWEEN 1900 AND 2200 THEN
    RAISE EXCEPTION 'Anno scout non valido';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('annual-roster', 0));
  IF EXISTS(SELECT 1 FROM public.roster_anni WHERE anno_scout = target_year) THEN RETURN 0; END IF;
  IF EXISTS(SELECT 1 FROM public.ragazzi_anni WHERE anno_scout = target_year) THEN
    INSERT INTO public.roster_anni(anno_scout) VALUES(target_year) ON CONFLICT DO NOTHING;
    RETURN 0;
  END IF;
  SELECT pg_catalog.max(anno_scout) INTO source_year FROM (
    SELECT anno_scout FROM public.roster_anni UNION SELECT anno_scout FROM public.ragazzi_anni
  ) existing_years WHERE anno_scout < target_year;
  INSERT INTO public.roster_anni(anno_scout,copied_from) VALUES(target_year,source_year) ON CONFLICT DO NOTHING;
  IF source_year IS NULL THEN RETURN 0; END IF;
  INSERT INTO public.ragazzi_anni (ragazzo_id, anno_scout, snapshot, attivo, copied_from)
  SELECT ragazzo_id, target_year, snapshot || pg_catalog.jsonb_build_object(
    'attivo', true, 'quota_censimento', false, 'ricevuta_censimento', false,
    'importo_censimento', NULL, 'foglio_privacy_firmato', false,
    'partecipazione_ci', false, 'partecipazione_ce', false,
    'scheda_medica_ci', false, 'scheda_medica_ce', false, 'stati_documenti', '{}'::jsonb), true, source_year
  FROM public.ragazzi_anni WHERE anno_scout = source_year AND attivo IS TRUE
  ON CONFLICT (ragazzo_id, anno_scout) DO NOTHING;
  GET DIAGNOSTICS copied_count = ROW_COUNT;
  RETURN copied_count;
END;
$function$;
REVOKE ALL ON FUNCTION public.ensure_roster_year(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_roster_year(text) TO service_role;

CREATE FUNCTION public.write_annual_boy(p_year text, p_id uuid, p_changes jsonb,
  p_census_method text DEFAULT NULL, p_census_date date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $function$
DECLARE
  target_year text := pg_catalog.replace(pg_catalog.btrim(p_year), '/', '-');
  boy_id uuid := p_id;
  old_snapshot jsonb;
  next_snapshot jsonb;
  base public.ragazzi;
  field text;
  flag_fields text[] := ARRAY['attivo','quota_censimento','ricevuta_censimento','foglio_privacy_firmato','partecipazione_ci','scheda_medica_ci','partecipazione_ce','scheda_medica_ce'];
  allowed_fields text[] := ARRAY['nome','cognome','codice_fiscale','codice_censimento','data_nascita','residenza','sesso','pattuglia','telefono_ragazzo','genitore_1_nome','genitore_1_telefono','genitore_1_email','genitore_1_codice_fiscale','genitore_2_nome','genitore_2_telefono','genitore_2_email','genitore_2_codice_fiscale','note_sanitarie','attivo','foglio_privacy_firmato','partecipazione_ci','scheda_medica_ci','partecipazione_ce','scheda_medica_ce','quota_censimento','ricevuta_censimento','importo_censimento','stati_documenti'];
  start_date date;
  end_date date;
  existing public.registro_spese;
  movement_count integer;
  paid boolean;
  census_amount numeric;
  census_method text;
  census_date date;
  changes_payment boolean;
BEGIN
  -- Share the issuance lock so a receipt cannot be certified between the
  -- protection check and its census movement change.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('scoutmaster-receipts', 0));
  PERFORM public.ensure_roster_year(target_year);
  IF p_changes IS NULL OR pg_catalog.jsonb_typeof(p_changes) <> 'object' OR p_changes = '{}'::jsonb THEN
    RAISE EXCEPTION 'Modifiche anagrafica non valide';
  END IF;
  FOR field IN SELECT pg_catalog.jsonb_object_keys(p_changes) LOOP
    IF NOT field = ANY(allowed_fields) THEN RAISE EXCEPTION 'Campo anagrafica non consentito: %', field; END IF;
    IF p_changes -> field = 'null'::jsonb THEN
      IF field = 'attivo' THEN RAISE EXCEPTION 'Stato attivo non valido'; END IF;
      CONTINUE;
    END IF;
    IF field = ANY(flag_fields) AND pg_catalog.jsonb_typeof(p_changes -> field) <> 'boolean' THEN
      RAISE EXCEPTION 'Stato anagrafica non valido: %', field;
    ELSIF field = 'importo_censimento' THEN
      IF pg_catalog.jsonb_typeof(p_changes -> field) <> 'number' OR (p_changes ->> field)::numeric < 0
        OR (p_changes ->> field)::numeric >= 'Infinity'::numeric THEN RAISE EXCEPTION 'Importo censimento non valido'; END IF;
    ELSIF field = 'stati_documenti' THEN
      IF pg_catalog.jsonb_typeof(p_changes -> field) <> 'object' THEN RAISE EXCEPTION 'Stati documenti non validi'; END IF;
    ELSIF NOT field = ANY(flag_fields) THEN
      IF pg_catalog.jsonb_typeof(p_changes -> field) <> 'string' OR pg_catalog.length(p_changes ->> field) > 5000 THEN
        RAISE EXCEPTION 'Campo anagrafica non valido: %', field;
      END IF;
      IF field LIKE '%codice_fiscale' AND p_changes ->> field !~ '^[A-Z0-9]{16}$|^[0-9]{11}$' THEN RAISE EXCEPTION 'Codice fiscale non valido'; END IF;
      IF field LIKE '%_email' AND p_changes ->> field !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN RAISE EXCEPTION 'Email non valida'; END IF;
      IF field = 'data_nascita' THEN
        IF p_changes ->> field !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'Data nascita non valida'; END IF;
        PERFORM (p_changes ->> field)::date;
      END IF;
    END IF;
  END LOOP;
  IF p_census_method IS NOT NULL AND p_census_method NOT IN ('Contanti','Bonifico','Carta') THEN RAISE EXCEPTION 'Metodo censimento non valido'; END IF;
  start_date := pg_catalog.make_date(pg_catalog.split_part(target_year, '-', 1)::integer, 10, 1);
  end_date := pg_catalog.make_date(pg_catalog.split_part(target_year, '-', 2)::integer, 9, 30);
  IF p_census_date IS NOT NULL AND p_census_date NOT BETWEEN start_date AND end_date THEN RAISE EXCEPTION 'Data censimento fuori anno'; END IF;

  IF boy_id IS NOT NULL THEN
    SELECT snapshot INTO old_snapshot FROM public.ragazzi_anni WHERE ragazzo_id = boy_id AND anno_scout = target_year FOR UPDATE;
    IF old_snapshot IS NULL THEN
      IF NOT EXISTS(SELECT 1 FROM public.ragazzi WHERE id = boy_id) OR NOT (p_changes ? 'nome' AND p_changes ? 'cognome') THEN
        RAISE EXCEPTION 'Ragazzo non presente nell’anno selezionato';
      END IF;
      -- An explicit import may enrol a known identity in an older year. Start
      -- from supplied source data only, never copy its future-year snapshot.
      SELECT * INTO base FROM pg_catalog.jsonb_populate_record(NULL::public.ragazzi, p_changes);
      old_snapshot := pg_catalog.to_jsonb(base) || pg_catalog.jsonb_build_object('id', boy_id, 'attivo', true);
    END IF;
  ELSE
    IF pg_catalog.btrim(COALESCE(p_changes ->> 'nome', '')) = '' OR pg_catalog.btrim(COALESCE(p_changes ->> 'cognome', '')) = '' THEN
      RAISE EXCEPTION 'Nome e cognome obbligatori';
    END IF;
    IF NULLIF(p_changes ->> 'codice_fiscale','') IS NOT NULL AND EXISTS(SELECT 1 FROM public.ragazzi WHERE pg_catalog.upper(codice_fiscale) = p_changes ->> 'codice_fiscale') THEN
      RAISE EXCEPTION 'Codice fiscale già presente: utilizza il ragazzo esistente';
    END IF;
    INSERT INTO public.ragazzi (nome, cognome, codice_fiscale, codice_censimento, data_nascita, sesso, attivo, quota_censimento, ricevuta_censimento)
    VALUES (p_changes ->> 'nome', p_changes ->> 'cognome', p_changes ->> 'codice_fiscale', p_changes ->> 'codice_censimento',
      (p_changes ->> 'data_nascita')::date, p_changes ->> 'sesso', false, false, false)
    RETURNING * INTO base;
    boy_id := base.id;
    old_snapshot := pg_catalog.to_jsonb(base) || pg_catalog.jsonb_build_object('attivo', true);
  END IF;
  next_snapshot := old_snapshot || p_changes || pg_catalog.jsonb_build_object('id', boy_id);
  IF NULLIF(next_snapshot ->> 'codice_fiscale', '') IS NOT NULL AND EXISTS(
    SELECT 1 FROM public.ragazzi_anni WHERE ragazzo_id <> boy_id AND pg_catalog.upper(snapshot ->> 'codice_fiscale') = pg_catalog.upper(next_snapshot ->> 'codice_fiscale')
  ) THEN RAISE EXCEPTION 'Codice fiscale già associato a un altro ragazzo'; END IF;
  IF pg_catalog.btrim(COALESCE(next_snapshot ->> 'nome','')) = '' OR pg_catalog.btrim(COALESCE(next_snapshot ->> 'cognome','')) = '' THEN RAISE EXCEPTION 'Nome e cognome obbligatori'; END IF;
  INSERT INTO public.ragazzi_anni (ragazzo_id, anno_scout, snapshot, attivo)
  VALUES (boy_id, target_year, next_snapshot, COALESCE((next_snapshot ->> 'attivo')::boolean, true))
  ON CONFLICT (ragazzo_id, anno_scout) DO UPDATE SET snapshot = EXCLUDED.snapshot, attivo = EXCLUDED.attivo, updated_at = pg_catalog.now();

  changes_payment := p_changes ? 'quota_censimento' OR p_changes ? 'importo_censimento' OR p_census_method IS NOT NULL OR p_census_date IS NOT NULL;
  IF changes_payment THEN
    SELECT pg_catalog.count(*) INTO movement_count FROM public.registro_spese WHERE ragazzo_id = boy_id AND riferimento_censimento_anno = target_year;
    IF movement_count > 1 THEN RAISE EXCEPTION 'Più movimenti censimento: verifica la cassa prima di modificare'; END IF;
    SELECT * INTO existing FROM public.registro_spese WHERE ragazzo_id = boy_id AND riferimento_censimento_anno = target_year FOR UPDATE;
    paid := COALESCE((next_snapshot ->> 'quota_censimento')::boolean, false);
    census_amount := COALESCE((next_snapshot ->> 'importo_censimento')::numeric,
      (SELECT CASE WHEN pg_catalog.btrim(valore) ~ '^[0-9]+([.,][0-9]+)?$' THEN pg_catalog.replace(valore, ',', '.')::numeric END FROM public.impostazioni WHERE chiave = 'quota_censimento_standard_' || target_year),
      (SELECT CASE WHEN pg_catalog.btrim(valore) ~ '^[0-9]+([.,][0-9]+)?$' THEN pg_catalog.replace(valore, ',', '.')::numeric END FROM public.impostazioni WHERE chiave = 'quota_censimento_standard'), 45);
    census_method := COALESCE(p_census_method, existing.metodo, 'Contanti');
    census_date := COALESCE(p_census_date, existing.data::date, CASE WHEN current_date BETWEEN start_date AND end_date THEN current_date ELSE end_date END);
    IF existing.id IS NOT NULL AND (NOT paid OR existing.importo IS DISTINCT FROM census_amount OR existing.metodo IS DISTINCT FROM census_method OR existing.data::date IS DISTINCT FROM census_date) THEN
      IF EXISTS(SELECT 1 FROM public.ricevute_movimenti WHERE movimento_id = existing.id)
        OR (NOT paid AND (existing.foto_scontrino_url IS NOT NULL OR EXISTS(SELECT 1 FROM public.prove_bonifico WHERE movimento_id = existing.id))) THEN
        RAISE EXCEPTION 'Movimento censimento con documento collegato: gestiscilo dalla cassa prima di modificarlo';
      END IF;
    END IF;
    IF paid THEN
      IF existing.id IS NULL THEN
        INSERT INTO public.registro_spese (importo, metodo, voce_spesa, tipo_movimento, data, ragazzo_id, riferimento_censimento_anno, momento_anno, note)
        VALUES (census_amount, census_method, 'Quota Censimento', 'ENTRATA', census_date, boy_id, target_year, 'ANNO', 'Censimento ' || target_year);
      ELSIF existing.importo IS DISTINCT FROM census_amount OR existing.metodo IS DISTINCT FROM census_method OR existing.data::date IS DISTINCT FROM census_date THEN
        UPDATE public.registro_spese SET importo = census_amount, metodo = census_method, data = census_date WHERE id = existing.id;
      END IF;
    ELSIF existing.id IS NOT NULL THEN
      DELETE FROM public.registro_spese WHERE id = existing.id;
    END IF;
  END IF;
  RETURN next_snapshot;
END;
$function$;
REVOKE ALL ON FUNCTION public.write_annual_boy(text, uuid, jsonb, text, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.write_annual_boy(text, uuid, jsonb, text, date) TO service_role;
CREATE FUNCTION public.import_roster_year(p_year text, p_rows jsonb, p_mode text)
RETURNS integer
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $function$
DECLARE
  target_year text := pg_catalog.replace(pg_catalog.btrim(p_year), '/', '-');
  item jsonb;
  boy_id uuid;
  matches uuid[];
  seen uuid[] := ARRAY[]::uuid[];
  result jsonb;
  changed integer := 0;
BEGIN
  IF p_mode NOT IN ('create','update') OR p_mode IS NULL OR p_rows IS NULL OR pg_catalog.jsonb_typeof(p_rows) <> 'array'
    OR pg_catalog.jsonb_array_length(p_rows) > 2000 THEN RAISE EXCEPTION 'Importazione anagrafica non valida'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('scoutmaster-receipts', 0));
  PERFORM public.ensure_roster_year(target_year);
  FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_rows) LOOP
    IF pg_catalog.jsonb_typeof(item) <> 'object' THEN RAISE EXCEPTION 'Riga anagrafica non valida'; END IF;
    boy_id := NULLIF(item ->> 'id', '')::uuid;
    IF boy_id IS NOT NULL THEN
      IF NOT EXISTS(SELECT 1 FROM public.ragazzi WHERE id=boy_id) THEN RAISE EXCEPTION 'Identità ragazzo non trovata'; END IF;
    ELSE
      SELECT pg_catalog.array_agg(DISTINCT person.id) INTO matches FROM (
        SELECT id, nome, cognome, codice_fiscale, codice_censimento FROM public.ragazzi
        UNION ALL
        SELECT ragazzo_id, snapshot ->> 'nome', snapshot ->> 'cognome', snapshot ->> 'codice_fiscale', snapshot ->> 'codice_censimento' FROM public.ragazzi_anni
      ) person WHERE
        (NULLIF(item ->> 'codice_fiscale','') IS NOT NULL AND pg_catalog.upper(person.codice_fiscale)=pg_catalog.upper(item ->> 'codice_fiscale'))
        OR (NULLIF(item ->> 'codice_censimento','') IS NOT NULL AND person.codice_censimento=item ->> 'codice_censimento')
        OR (pg_catalog.lower(pg_catalog.btrim(person.nome))=pg_catalog.lower(pg_catalog.btrim(item ->> 'nome'))
          AND pg_catalog.lower(pg_catalog.btrim(person.cognome))=pg_catalog.lower(pg_catalog.btrim(item ->> 'cognome')));
      IF pg_catalog.array_length(matches,1)>1 THEN RAISE EXCEPTION 'Più identità corrispondenti: verifica codice fiscale e censimento'; END IF;
      boy_id := matches[1];
    END IF;
    IF boy_id = ANY(seen) THEN RAISE EXCEPTION 'Ragazzo duplicato nel file'; END IF;
    IF boy_id IS NOT NULL AND p_mode='create' AND EXISTS(SELECT 1 FROM public.ragazzi_anni WHERE ragazzo_id=boy_id AND anno_scout=target_year) THEN
      seen := pg_catalog.array_append(seen,boy_id);
      CONTINUE;
    END IF;
    result := public.write_annual_boy(target_year,boy_id,item - 'id');
    seen := pg_catalog.array_append(seen,(result ->> 'id')::uuid);
    changed := changed + 1;
  END LOOP;
  RETURN changed;
END;
$function$;
REVOKE ALL ON FUNCTION public.import_roster_year(text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_roster_year(text, jsonb, text) TO service_role;
CREATE OR REPLACE FUNCTION public.issue_payment_receipt(p_snapshot jsonb, p_ids uuid[], p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE receipt public.ricevute_emesse; movement public.registro_spese; item jsonb; n integer; total numeric := 0; annual_boy jsonb; receipt_year text; parent_index integer; start_date date; end_date date;
BEGIN
 IF p_ids IS NULL OR pg_catalog.cardinality(p_ids) < 1 OR pg_catalog.cardinality(p_ids) > 500 OR pg_catalog.cardinality(p_ids) <> (SELECT count(DISTINCT x) FROM pg_catalog.unnest(p_ids) x)
 THEN RAISE EXCEPTION 'Selezione movimenti non valida'; END IF;
 IF pg_catalog.jsonb_array_length(p_snapshot->'lines') <> pg_catalog.cardinality(p_ids) THEN RAISE EXCEPTION 'Dettaglio non valido'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('scoutmaster-receipts',0));
 receipt_year := p_snapshot->>'year';
 IF receipt_year IS NULL OR receipt_year !~ '^[0-9]{4}-[0-9]{4}$'
  OR pg_catalog.split_part(receipt_year,'-',2)::integer <> pg_catalog.split_part(receipt_year,'-',1)::integer + 1 THEN
  RAISE EXCEPTION 'Anno ricevuta non valido';
 END IF;
 start_date := pg_catalog.make_date(pg_catalog.split_part(receipt_year,'-',1)::integer,10,1);
 end_date := pg_catalog.make_date(pg_catalog.split_part(receipt_year,'-',2)::integer,9,30);
 parent_index := (p_snapshot->>'parent')::integer;
 IF parent_index IS NULL OR parent_index NOT IN (1,2) THEN RAISE EXCEPTION 'Pagatore ricevuta non valido'; END IF;
 SELECT snapshot INTO annual_boy FROM public.ragazzi_anni WHERE ragazzo_id=(p_snapshot->'boy'->>'id')::uuid AND anno_scout=receipt_year FOR SHARE;
 IF annual_boy IS NULL
  OR pg_catalog.upper(pg_catalog.btrim(annual_boy->>'codice_fiscale')) IS DISTINCT FROM p_snapshot->'boy'->>'cf'
  OR pg_catalog.btrim((annual_boy->>'nome') || ' ' || (annual_boy->>'cognome')) IS DISTINCT FROM p_snapshot->'boy'->>'name'
  OR pg_catalog.btrim(annual_boy->>('genitore_' || parent_index || '_nome')) IS DISTINCT FROM p_snapshot->'payer'->>'name'
  OR pg_catalog.upper(pg_catalog.btrim(annual_boy->>('genitore_' || parent_index || '_codice_fiscale'))) IS DISTINCT FROM p_snapshot->'payer'->>'cf'
 THEN RAISE EXCEPTION 'Anagrafica o pagatore cambiati: aggiorna la ricevuta'; END IF;
 FOR movement IN SELECT * FROM public.registro_spese WHERE id = ANY(p_ids) ORDER BY id FOR UPDATE LOOP
  SELECT value INTO item FROM pg_catalog.jsonb_array_elements(p_snapshot->'lines') WHERE value->>'id' = movement.id::text;
  IF item IS NULL OR movement.tipo_movimento IS DISTINCT FROM 'ENTRATA' OR movement.importo <= 0
   OR movement.ragazzo_id::text IS DISTINCT FROM p_snapshot->'boy'->>'id'
   OR movement.data IS NULL OR movement.data NOT BETWEEN start_date AND end_date
   OR movement.data::text IS DISTINCT FROM item->>'date'
   OR movement.importo IS DISTINCT FROM (item->>'amount')::numeric
   OR coalesce(movement.metodo,'') IS DISTINCT FROM item->>'sourceMethod'
   OR coalesce(movement.voce_spesa,'') IS DISTINCT FROM item->>'category'
   OR coalesce(movement.note,'') IS DISTINCT FROM item->>'note'
   OR coalesce(movement.momento_anno,'') IS DISTINCT FROM item->>'period'
  THEN RAISE EXCEPTION 'Un movimento è cambiato: aggiorna la selezione'; END IF;
  IF EXISTS(SELECT 1 FROM public.ricevute_movimenti WHERE movimento_id=movement.id) THEN RAISE EXCEPTION 'Movimento già incluso in una ricevuta'; END IF;
  IF EXISTS(SELECT 1 FROM public.prove_bonifico WHERE movimento_id=movement.id AND confirmed AND ragazzo_id=movement.ragazzo_id AND movement_amount=movement.importo AND movement_date=movement.data AND parent<>(p_snapshot->>'parent')::integer) THEN RAISE EXCEPTION 'Pagatore diverso dalla prova di bonifico confermata'; END IF;
  total := total + movement.importo;
 END LOOP;
 IF (SELECT count(*) FROM public.registro_spese WHERE id=ANY(p_ids)) <> pg_catalog.cardinality(p_ids) OR total <> (p_snapshot->>'total')::numeric THEN RAISE EXCEPTION 'Totale o movimenti non validi'; END IF;
 SELECT coalesce(pg_catalog.max(numero),0)+1 INTO n FROM public.ricevute_emesse WHERE anno=p_snapshot->>'year';
 INSERT INTO public.ricevute_emesse(numero,anno,snapshot,created_by) VALUES(n,p_snapshot->>'year',p_snapshot,p_actor) RETURNING * INTO receipt;
 INSERT INTO public.ricevute_movimenti(movimento_id,ricevuta_id) SELECT x,receipt.id FROM pg_catalog.unnest(p_ids) x;
 RETURN pg_catalog.to_jsonb(receipt);
END; $$;
REVOKE ALL ON FUNCTION public.issue_payment_receipt(jsonb,uuid[],uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.issue_payment_receipt(jsonb,uuid[],uuid) TO service_role;

CREATE FUNCTION public.reset_year_data(p_year text,p_target text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $function$
DECLARE
  target_year text := pg_catalog.replace(pg_catalog.btrim(p_year), '/', '-');
  start_date date;
  end_date date;
  event_ids uuid[];
  quote_ids uuid[];
  bc_ids uuid[];
  remove_events boolean;
  remove_quotes boolean;
  remove_cash boolean;
  affects_finance boolean;
  changed integer;
  summary jsonb := '{}'::jsonb;
BEGIN
  IF p_target IS NULL OR p_target NOT IN ('ragazzi','eventi','registro_spese','quote_mensili','buonacaccia','all') THEN RAISE EXCEPTION 'Target reset non valido'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('scoutmaster-receipts',0));
  PERFORM public.ensure_roster_year(target_year);
  start_date := pg_catalog.make_date(pg_catalog.split_part(target_year,'-',1)::integer,10,1);
  end_date := pg_catalog.make_date(pg_catalog.split_part(target_year,'-',2)::integer,9,30);
  remove_events := p_target IN ('eventi','all');
  remove_quotes := p_target IN ('quote_mensili','all');
  remove_cash := p_target IN ('registro_spese','all');
  affects_finance := remove_events OR remove_quotes OR remove_cash;
  SELECT COALESCE(pg_catalog.array_agg(id),ARRAY[]::uuid[]) INTO event_ids FROM public.eventi WHERE data_inizio BETWEEN start_date AND end_date;
  SELECT COALESCE(pg_catalog.array_agg(id),ARRAY[]::uuid[]) INTO quote_ids FROM public.quote_mensili WHERE anno_scout IN (target_year,pg_catalog.replace(target_year,'-','/'));
  IF affects_finance THEN
    -- Triggers on payments delete their own linked entries. Refuse a reset if
    -- one is dated in a different year, rather than silently touching it.
    IF EXISTS(SELECT 1 FROM public.registro_spese m WHERE (m.quota_mensile_id=ANY(quote_ids) AND (remove_quotes OR remove_cash)
      OR m.partecipazione_evento_id IN (SELECT id FROM public.partecipazioni_eventi WHERE evento_id=ANY(event_ids)) AND (remove_events OR remove_cash))
      AND (m.data IS NULL OR m.data NOT BETWEEN start_date AND end_date)) THEN
      RAISE EXCEPTION 'Movimenti collegati fuori anno: correggi le date prima del reset';
    END IF;
    IF EXISTS(SELECT 1 FROM public.registro_spese m WHERE (
      remove_cash AND m.data BETWEEN start_date AND end_date
      OR remove_quotes AND m.quota_mensile_id=ANY(quote_ids)
      OR remove_events AND m.partecipazione_evento_id IN (SELECT id FROM public.partecipazioni_eventi WHERE evento_id=ANY(event_ids)))
      AND (EXISTS(SELECT 1 FROM public.ricevute_movimenti WHERE movimento_id=m.id)
        OR EXISTS(SELECT 1 FROM public.prove_bonifico WHERE movimento_id=m.id) OR m.foto_scontrino_url IS NOT NULL)) THEN
      RAISE EXCEPTION 'Anno con ricevute emesse o documenti collegati: reset annullato per conservarli';
    END IF;
  END IF;
  IF remove_cash THEN
    SELECT pg_catalog.count(*) INTO changed FROM public.registro_spese WHERE data BETWEEN start_date AND end_date;
    summary := summary || pg_catalog.jsonb_build_object('movimenti_rimossi',changed);
    UPDATE public.quote_mensili SET novembre=false,dicembre=false,gennaio=false,febbraio=false,marzo=false,aprile=false,maggio=false,giugno=false WHERE id=ANY(quote_ids);
    UPDATE public.partecipazioni_eventi SET riscosso=false WHERE evento_id=ANY(event_ids);
    UPDATE public.ragazzi_anni SET snapshot=snapshot || '{"quota_censimento":false}'::jsonb,updated_at=pg_catalog.now() WHERE anno_scout=target_year;
    DELETE FROM public.registro_spese WHERE data BETWEEN start_date AND end_date;
  END IF;
  IF remove_events THEN
    DELETE FROM public.partecipazioni_eventi WHERE evento_id=ANY(event_ids);
    DELETE FROM public.eventi WHERE id=ANY(event_ids);
    GET DIAGNOSTICS changed=ROW_COUNT;
    summary := summary || pg_catalog.jsonb_build_object('eventi_rimossi',changed);
  END IF;
  IF remove_quotes THEN
    DELETE FROM public.quote_mensili WHERE id=ANY(quote_ids);
    GET DIAGNOSTICS changed=ROW_COUNT;
    summary := summary || pg_catalog.jsonb_build_object('quote_rimosse',changed);
  END IF;
  IF p_target IN ('buonacaccia','all') THEN
    SELECT COALESCE(pg_catalog.array_agg(id),ARRAY[]::uuid[]) INTO bc_ids FROM public.eventi_buonacaccia WHERE data_inizio BETWEEN start_date AND end_date;
    DELETE FROM public.candidature_buonacaccia WHERE evento_id=ANY(bc_ids);
    DELETE FROM public.eventi_buonacaccia WHERE id=ANY(bc_ids);
    GET DIAGNOSTICS changed=ROW_COUNT;
    summary := summary || pg_catalog.jsonb_build_object('eventi_buonacaccia_rimossi',changed);
  END IF;
  IF p_target IN ('ragazzi','all') THEN
    UPDATE public.ragazzi_anni SET attivo=false,snapshot=snapshot || '{"attivo":false}'::jsonb,updated_at=pg_catalog.now() WHERE anno_scout=target_year AND attivo;
    GET DIAGNOSTICS changed=ROW_COUNT;
    summary := summary || pg_catalog.jsonb_build_object('ragazzi_archiviati',changed);
  END IF;
  RETURN summary || pg_catalog.jsonb_build_object('anno_scout',target_year);
END;
$function$;
REVOKE ALL ON FUNCTION public.reset_year_data(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reset_year_data(text,text) TO service_role;

COMMIT;
