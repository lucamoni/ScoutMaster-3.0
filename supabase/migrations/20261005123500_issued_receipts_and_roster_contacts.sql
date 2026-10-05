ALTER TABLE public.ragazzi
 ADD COLUMN IF NOT EXISTS genitore_1_email text,
 ADD COLUMN IF NOT EXISTS genitore_2_email text,
 ADD COLUMN IF NOT EXISTS genitore_1_codice_fiscale text,
 ADD COLUMN IF NOT EXISTS genitore_2_codice_fiscale text;

CREATE OR REPLACE FUNCTION private.current_staff_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT CASE lower(raw_app_meta_data->>'role')
 WHEN 'admin' THEN 'admin' WHEN 'capo_unita' THEN 'capo_unita'
 WHEN 'aiuto_capo_unita' THEN 'aiuto_capo_unita' WHEN 'tesoriere_unita' THEN 'tesoriere_unita'
 WHEN 'capo' THEN 'capo_unita' WHEN 'tesoriere' THEN 'aiuto_capo_unita' ELSE NULL END
 FROM auth.users WHERE id = auth.uid()
 AND coalesce(raw_app_meta_data->>'disabled', 'false') <> 'true'
 AND (banned_until IS NULL OR banned_until <= now());
$$;
REVOKE ALL ON FUNCTION private.current_staff_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.current_staff_role() TO authenticated;

-- These records and signature/OAuth credentials are accessed only by authorized
-- server routes. No client grants or permissive RLS policies are added.
CREATE TABLE public.ricevute_emesse (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), numero integer NOT NULL,
 anno text NOT NULL, snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid NOT NULL, pdf_path text, UNIQUE(anno, numero)
);
CREATE TABLE public.ricevute_movimenti (
 movimento_id uuid PRIMARY KEY, ricevuta_id uuid NOT NULL REFERENCES public.ricevute_emesse(id)
);
CREATE INDEX ricevute_movimenti_receipt_idx ON public.ricevute_movimenti(ricevuta_id);
CREATE TABLE public.ricevute_config (id text PRIMARY KEY, valore jsonb NOT NULL);
CREATE TABLE public.gmail_connection (id text PRIMARY KEY, token text NOT NULL, email text NOT NULL);
CREATE TABLE public.ricevute_invio (
 ricevuta_id uuid PRIMARY KEY REFERENCES public.ricevute_emesse(id),
 stato text NOT NULL CHECK(stato IN ('sending','sent','failed','uncertain')),
 email text NOT NULL, message_id text, updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ricevute_emesse ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ricevute_movimenti ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ricevute_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gmail_connection ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ricevute_invio ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ricevute_emesse, public.ricevute_movimenti, public.ricevute_config, public.gmail_connection, public.ricevute_invio FROM anon, authenticated;
GRANT ALL ON public.ricevute_emesse, public.ricevute_movimenti, public.ricevute_config, public.gmail_connection, public.ricevute_invio TO service_role;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('ricevute-pagamenti','ricevute-pagamenti',false,5242880,ARRAY['application/pdf']) ON CONFLICT(id) DO NOTHING;

CREATE TABLE public.prove_bonifico (
 movimento_id uuid PRIMARY KEY, ragazzo_id uuid NOT NULL, movement_amount numeric NOT NULL, movement_date date NOT NULL, path text NOT NULL, filename text NOT NULL,
 parent integer NOT NULL CHECK(parent IN (1,2)), payer text NOT NULL,
 amount numeric NOT NULL CHECK(amount>0), date date, confirmed boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.prove_bonifico ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.prove_bonifico FROM anon,authenticated;
GRANT ALL ON public.prove_bonifico TO service_role;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('prove-bonifico','prove-bonifico',false,4194304,ARRAY['application/pdf','image/png','image/jpeg']) ON CONFLICT(id) DO NOTHING;

-- A single transaction locks source movements, verifies the preview is still
-- current, assigns a progressive number and prevents concurrent double issuance.
CREATE FUNCTION public.issue_payment_receipt(p_snapshot jsonb, p_ids uuid[], p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE receipt public.ricevute_emesse; movement public.registro_spese; item jsonb; n integer; total numeric := 0;
BEGIN
 IF cardinality(p_ids) < 1 OR cardinality(p_ids) > 500 OR cardinality(p_ids) <> (SELECT count(DISTINCT x) FROM unnest(p_ids) x)
 THEN RAISE EXCEPTION 'Selezione movimenti non valida'; END IF;
 IF jsonb_array_length(p_snapshot->'lines') <> cardinality(p_ids) THEN RAISE EXCEPTION 'Dettaglio non valido'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('scoutmaster-receipts',0));
 FOR movement IN SELECT * FROM public.registro_spese WHERE id = ANY(p_ids) ORDER BY id FOR UPDATE LOOP
  SELECT value INTO item FROM jsonb_array_elements(p_snapshot->'lines') WHERE value->>'id' = movement.id::text;
  IF item IS NULL OR movement.tipo_movimento IS DISTINCT FROM 'ENTRATA' OR movement.importo <= 0
   OR movement.ragazzo_id::text IS DISTINCT FROM p_snapshot->'boy'->>'id'
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
 IF (SELECT count(*) FROM public.registro_spese WHERE id=ANY(p_ids)) <> cardinality(p_ids) OR total <> (p_snapshot->>'total')::numeric THEN RAISE EXCEPTION 'Totale o movimenti non validi'; END IF;
 SELECT coalesce(max(numero),0)+1 INTO n FROM public.ricevute_emesse WHERE anno=p_snapshot->>'year';
 INSERT INTO public.ricevute_emesse(numero,anno,snapshot,created_by) VALUES(n,p_snapshot->>'year',p_snapshot,p_actor) RETURNING * INTO receipt;
 INSERT INTO public.ricevute_movimenti(movimento_id,ricevuta_id) SELECT x,receipt.id FROM unnest(p_ids) x;
 RETURN to_jsonb(receipt);
END; $$;
REVOKE ALL ON FUNCTION public.issue_payment_receipt(jsonb,uuid[],uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.issue_payment_receipt(jsonb,uuid[],uuid) TO service_role;

CREATE FUNCTION public.import_roster(p_rows jsonb,p_mode text)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE item jsonb; cols text; assignments text; k text; count_rows integer:=0;
 allowed text[]:=ARRAY['id','nome','cognome','codice_fiscale','codice_censimento','data_nascita','residenza','sesso','pattuglia','telefono_ragazzo','genitore_1_nome','genitore_1_telefono','genitore_1_email','genitore_1_codice_fiscale','genitore_2_nome','genitore_2_telefono','genitore_2_email','genitore_2_codice_fiscale','note_sanitarie','attivo','foglio_privacy_firmato','partecipazione_ci','scheda_medica_ci','partecipazione_ce','scheda_medica_ce','quota_censimento','ricevuta_censimento','importo_censimento','stati_documenti'];
BEGIN
 IF p_mode NOT IN ('create','update') OR jsonb_array_length(p_rows)>2000 THEN RAISE EXCEPTION 'Importazione non valida'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('scoutmaster-roster-import',0));
 FOR item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
  IF NOT(item ? 'nome') OR NOT(item ? 'cognome') THEN RAISE EXCEPTION 'Nome e cognome obbligatori'; END IF;
  FOR k IN SELECT jsonb_object_keys(item) LOOP IF NOT(k=ANY(allowed)) THEN RAISE EXCEPTION 'Colonna non consentita'; END IF; END LOOP;
  IF EXISTS(SELECT 1 FROM public.ragazzi r WHERE (coalesce(nullif(item->>'codice_fiscale',''),'!') = upper(r.codice_fiscale) OR coalesce(nullif(item->>'codice_censimento',''),'!')=r.codice_censimento OR (lower(trim(r.nome))=lower(trim(item->>'nome')) AND lower(trim(r.cognome))=lower(trim(item->>'cognome')))) AND r.id::text IS DISTINCT FROM item->>'id') THEN RAISE EXCEPTION 'Codice fiscale o censimento già presente: aggiorna anteprima'; END IF;
  SELECT string_agg(quote_ident(key),','),string_agg(format('%I=EXCLUDED.%I',key,key),',') INTO cols,assignments FROM jsonb_object_keys(item) key;
  IF item ? 'id' THEN
   IF p_mode='create' OR NOT EXISTS(SELECT 1 FROM public.ragazzi WHERE id=(item->>'id')::uuid) THEN RAISE EXCEPTION 'Aggiornamento non consentito'; END IF;
   EXECUTE format('INSERT INTO public.ragazzi (%s) SELECT %s FROM jsonb_populate_record(NULL::public.ragazzi,$1) ON CONFLICT(id) DO UPDATE SET %s',cols,cols,assignments) USING item;
  ELSE
   EXECUTE format('INSERT INTO public.ragazzi (%s) SELECT %s FROM jsonb_populate_record(NULL::public.ragazzi,$1)',cols,cols) USING item;
  END IF;
  count_rows:=count_rows+1;
 END LOOP;
 RETURN count_rows;
END; $$;
REVOKE ALL ON FUNCTION public.import_roster(jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.import_roster(jsonb,text) TO service_role;

CREATE FUNCTION public.attach_payment_proof(p_ids uuid[], p_proof jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE total numeric; boys integer; n integer;
BEGIN
 IF cardinality(p_ids)<1 OR cardinality(p_ids)>500 OR cardinality(p_ids)<>(SELECT count(DISTINCT x) FROM unnest(p_ids) x) THEN RAISE EXCEPTION 'Selezione non valida'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('scoutmaster-receipts',0));
 PERFORM id FROM public.registro_spese WHERE id=ANY(p_ids) ORDER BY id FOR UPDATE;
 SELECT sum(importo),count(DISTINCT ragazzo_id),count(*) INTO total,boys,n FROM public.registro_spese
 WHERE id=ANY(p_ids) AND tipo_movimento='ENTRATA' AND importo>0 AND ragazzo_id IS NOT NULL
 AND lower(metodo) IN ('bonifico','banca','bonifici');
 IF n<>cardinality(p_ids) OR boys<>1 OR total<>(p_proof->>'amount')::numeric THEN RAISE EXCEPTION 'Importo o movimenti non corrispondenti'; END IF;
 IF EXISTS(SELECT 1 FROM public.ricevute_movimenti rm JOIN public.ricevute_emesse re ON re.id=rm.ricevuta_id WHERE rm.movimento_id=ANY(p_ids) AND (re.snapshot->>'parent')::integer<>(p_proof->>'parent')::integer) THEN RAISE EXCEPTION 'Pagatore diverso dalla ricevuta già emessa'; END IF;
 INSERT INTO public.prove_bonifico(movimento_id,ragazzo_id,movement_amount,movement_date,path,filename,parent,payer,amount,date,confirmed)
 SELECT r.id,r.ragazzo_id,r.importo,r.data,p_proof->>'path',p_proof->>'filename',(p_proof->>'parent')::integer,p_proof->>'payer',total,(p_proof->>'date')::date,true FROM public.registro_spese r WHERE r.id=ANY(p_ids)
 ON CONFLICT(movimento_id) DO UPDATE SET ragazzo_id=EXCLUDED.ragazzo_id,movement_amount=EXCLUDED.movement_amount,movement_date=EXCLUDED.movement_date,path=EXCLUDED.path,filename=EXCLUDED.filename,parent=EXCLUDED.parent,payer=EXCLUDED.payer,amount=EXCLUDED.amount,date=EXCLUDED.date,confirmed=true,created_at=now();
 RETURN n;
END; $$;
REVOKE ALL ON FUNCTION public.attach_payment_proof(uuid[],jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.attach_payment_proof(uuid[],jsonb) TO service_role;
