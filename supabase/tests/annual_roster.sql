-- Run after both annual-roster migrations and production cutover. Entire proof rolls back, including
-- identity rows, annual snapshots, synthetic receipts and negative numbering.
BEGIN;
CREATE TEMP SEQUENCE annual_roster_test_numbers START -1800000000 INCREMENT -1;
ALTER TABLE public.registro_spese ALTER COLUMN numero_operazione
  SET DEFAULT pg_catalog.nextval('pg_temp.annual_roster_test_numbers');
GRANT USAGE, SELECT ON SEQUENCE pg_temp.annual_roster_test_numbers TO service_role;
SET LOCAL ROLE service_role;
DO $test$
DECLARE
  result jsonb;
  boy_id uuid;
  before_snapshot jsonb;
  movement public.registro_spese;
  receipt_id uuid;
  count_before integer;
  receipt_snapshot jsonb;
BEGIN
  ASSERT NOT pg_catalog.has_table_privilege('authenticated','public.ragazzi_anni','SELECT'), 'Annual snapshots are exposed to clients';
  ASSERT NOT pg_catalog.has_table_privilege('authenticated','public.ragazzi','UPDATE'), 'Identity remains mutable from the browser';
  ASSERT NOT pg_catalog.has_function_privilege('authenticated','public.write_annual_boy(text,uuid,jsonb,text,date)','EXECUTE'), 'Anonymous/client execution allowed';
  ASSERT NOT pg_catalog.has_function_privilege('authenticated','public.ensure_roster_year(text)','EXECUTE'), 'Client clone execution allowed';
  ASSERT NOT pg_catalog.has_function_privilege('authenticated','public.import_roster_year(text,jsonb,text)','EXECUTE'), 'Client import execution allowed';

  result := public.write_annual_boy('1998-1999',NULL,'{"nome":"Test","cognome":"AnnualRoster","attivo":true,"codice_fiscale":"ZZZZZZ99Z99Z999Z","note_sanitarie":"Dato di prova","pattuglia":"Aquile","genitore_1_nome":"Maria Test","genitore_1_codice_fiscale":"PPPPPP99P99P999P","quota_censimento":false,"ricevuta_censimento":true,"foglio_privacy_firmato":true,"partecipazione_ci":true,"partecipazione_ce":true,"scheda_medica_ci":true,"scheda_medica_ce":true,"stati_documenti":{"extra":true}}');
  boy_id := (result ->> 'id')::uuid;
  ASSERT (SELECT quota_censimento FROM public.ragazzi WHERE id=boy_id) IS FALSE, 'Global census has been changed';
  ASSERT NOT EXISTS(SELECT 1 FROM public.registro_spese WHERE ragazzo_id=boy_id), 'Creation generated a global-year payment';
  UPDATE public.ragazzi_anni SET snapshot=snapshot || '{"progressione":{"tappa":"Competenza"}}'::jsonb WHERE ragazzo_id=boy_id AND anno_scout='1998-1999';
  result := public.write_annual_boy('1998-1999',boy_id,'{"quota_censimento":true,"importo_censimento":38}','Bonifico',DATE '1999-09-15');
  SELECT * INTO STRICT movement FROM public.registro_spese WHERE ragazzo_id=boy_id AND riferimento_censimento_anno='1998-1999';
  ASSERT movement.importo=38 AND movement.metodo='Bonifico' AND movement.data::date=DATE '1999-09-15', 'Census uses the wrong year/date/method';

  PERFORM public.ensure_roster_year('1999-2000');
  SELECT snapshot INTO STRICT result FROM public.ragazzi_anni WHERE ragazzo_id=boy_id AND anno_scout='1999-2000';
  ASSERT result ->> 'nome' = 'Test' AND result ->> 'note_sanitarie' = 'Dato di prova' AND result ->> 'pattuglia' = 'Aquile', 'Personal/health data lost while cloning';
  ASSERT result -> 'progressione' = '{"tappa":"Competenza"}'::jsonb, 'Progression lost while cloning';
  ASSERT result -> 'quota_censimento' = 'false'::jsonb AND result -> 'ricevuta_censimento' = 'false'::jsonb AND result -> 'foglio_privacy_firmato' = 'false'::jsonb
    AND result -> 'partecipazione_ci' = 'false'::jsonb AND result -> 'partecipazione_ce' = 'false'::jsonb
    AND result -> 'scheda_medica_ci' = 'false'::jsonb AND result -> 'scheda_medica_ce' = 'false'::jsonb AND result -> 'stati_documenti' = '{}'::jsonb, 'Annual payment/document states carried over';
  ASSERT NOT EXISTS(SELECT 1 FROM public.registro_spese WHERE ragazzo_id=boy_id AND riferimento_censimento_anno='1999-2000'), 'Clone copied a payment';
  ASSERT NOT EXISTS(SELECT 1 FROM public.quote_mensili WHERE ragazzo_id=boy_id), 'Clone copied monthly payments';
  ASSERT public.ensure_roster_year('1900-1901')=0 AND NOT EXISTS(SELECT 1 FROM public.ragazzi_anni WHERE anno_scout='1900-1901'), 'Future data copied into an older year';

  SELECT snapshot INTO STRICT before_snapshot FROM public.ragazzi_anni WHERE ragazzo_id=boy_id AND anno_scout='1998-1999';
  PERFORM public.write_annual_boy('1999-2000',boy_id,'{"nome":"Nome nuovo","attivo":false}');
  ASSERT (SELECT snapshot FROM public.ragazzi_anni WHERE ragazzo_id=boy_id AND anno_scout='1998-1999')=before_snapshot, 'Another year changed during edit/archive';
  ASSERT (SELECT attivo FROM public.ragazzi_anni WHERE ragazzo_id=boy_id AND anno_scout='1998-1999') IS TRUE, 'Archive applied globally';
  ASSERT (SELECT nome FROM public.ragazzi WHERE id=boy_id)='Test', 'Identity row was overwritten';
  PERFORM public.write_annual_boy('1999-2000',boy_id,'{"quota_censimento":true,"importo_censimento":40}','Carta',DATE '2000-09-20');
  UPDATE public.registro_spese SET data=DATE '2000-02-05' WHERE ragazzo_id=boy_id AND riferimento_censimento_anno='1999-2000';
  PERFORM public.write_annual_boy('1999-2000',boy_id,'{"importo_censimento":41}');
  SELECT * INTO STRICT movement FROM public.registro_spese WHERE ragazzo_id=boy_id AND riferimento_censimento_anno='1999-2000';
  ASSERT movement.importo=41 AND movement.metodo='Carta' AND movement.data::date=DATE '2000-02-05', 'Edited accounting date/method was erased';
  PERFORM public.write_annual_boy('1998-1999',boy_id,'{"quota_censimento":false}');
  ASSERT NOT EXISTS(SELECT 1 FROM public.registro_spese WHERE ragazzo_id=boy_id AND riferimento_censimento_anno='1998-1999'), 'Cancellation did not remove its own-year census';
  ASSERT EXISTS(SELECT 1 FROM public.registro_spese WHERE ragazzo_id=boy_id AND riferimento_censimento_anno='1999-2000'), 'Cancellation affected a different-year payment';

  BEGIN
    DELETE FROM public.ragazzi WHERE id=boy_id;
    RAISE EXCEPTION 'Global identity deletion unexpectedly permitted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  ASSERT EXISTS(SELECT 1 FROM public.ragazzi_anni WHERE ragazzo_id=boy_id AND anno_scout='1998-1999'), 'Identity deletion erased history';
  receipt_snapshot := pg_catalog.jsonb_build_object('year','1999-2000','date','2000-09-30','parent',1,
    'boy',pg_catalog.jsonb_build_object('id',boy_id,'name','Nome nuovo AnnualRoster','cf','ZZZZZZ99Z99Z999Z'),
    'payer',pg_catalog.jsonb_build_object('name','Maria Test','cf','PPPPPP99P99P999P'),
    'total',movement.importo,'lines',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id',movement.id,'date',movement.data,'amount',movement.importo,'sourceMethod',movement.metodo,'category',movement.voce_spesa,'note',movement.note,'period',movement.momento_anno)));
  BEGIN
    PERFORM public.issue_payment_receipt(pg_catalog.jsonb_set(receipt_snapshot,'{boy,name}','"Test AnnualRoster"'),ARRAY[movement.id],boy_id);
    RAISE EXCEPTION 'Stale global-name receipt unexpectedly accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Anagrafica o pagatore cambiati: aggiorna la ricevuta' THEN RAISE; END IF;
  END;
  result := public.issue_payment_receipt(receipt_snapshot,ARRAY[movement.id],boy_id);
  receipt_id := (result->>'id')::uuid;
  ASSERT receipt_id IS NOT NULL, 'Annual name/CF receipt rejected';
  BEGIN
    PERFORM public.write_annual_boy('1999-2000',boy_id,'{"quota_censimento":false}');
    RAISE EXCEPTION 'Issued payment deletion unexpectedly permitted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Movimento censimento con documento collegato:%' THEN RAISE; END IF;
  END;
  ASSERT (SELECT (snapshot ->> 'quota_censimento')::boolean FROM public.ragazzi_anni WHERE ragazzo_id=boy_id AND anno_scout='1999-2000'), 'Rejected deletion changed the annual payment flag';

  ASSERT public.import_roster_year('1998-1999',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id',boy_id,'nome','Test','cognome','AnnualRoster')),'create')=0, 'Create overwrote an existing same-year member';
  ASSERT public.import_roster_year('2001-2002','[{"nome":"Test","cognome":"AnnualRoster","codice_fiscale":"ZZZZZZ99Z99Z999Z","attivo":true}]','create')=1, 'Known identity could not be enrolled in another year';
  ASSERT (SELECT count(*) FROM public.ragazzi WHERE id=boy_id)=1, 'Import duplicated identity';
  ASSERT (SELECT snapshot FROM public.ragazzi_anni WHERE ragazzo_id=boy_id AND anno_scout='1998-1999') ->> 'nome'='Test', 'Import changed an older year';
  SELECT count(*) INTO count_before FROM public.ragazzi;
  BEGIN
    PERFORM public.import_roster_year('2002-2003','[{"nome":"New","cognome":"BatchRollback","attivo":true},{"nome":null,"cognome":"BadRow"}]','update');
    RAISE EXCEPTION 'Invalid import unexpectedly accepted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Nome e cognome obbligatori' THEN RAISE; END IF;
  END;
  ASSERT (SELECT count(*) FROM public.ragazzi)=count_before, 'Batch import left a partial identity';
  BEGIN
    PERFORM public.reset_year_data('1999-2000','registro_spese');
    RAISE EXCEPTION 'Protected-year reset unexpectedly permitted';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'Anno con ricevute emesse o documenti collegati: reset annullato per conservarli' THEN RAISE; END IF;
  END;
  ASSERT EXISTS(SELECT 1 FROM public.registro_spese WHERE id=movement.id), 'Reset removed an issued movement';
  PERFORM public.reset_year_data('2001-2002','ragazzi');
  ASSERT (SELECT attivo FROM public.ragazzi_anni WHERE ragazzo_id=boy_id AND anno_scout='2001-2002') IS FALSE, 'Roster reset did not archive selected-year membership';
  ASSERT EXISTS(SELECT 1 FROM public.ragazzi WHERE id=boy_id) AND EXISTS(SELECT 1 FROM public.registro_spese WHERE id=movement.id), 'Roster reset deleted identity/other-year payments';
  ASSERT EXISTS(SELECT 1 FROM public.roster_anni WHERE anno_scout='2001-2002'), 'Reset lost initialized-year marker';
  PERFORM public.ensure_roster_year('2001-2002');
  ASSERT (SELECT attivo FROM public.ragazzi_anni WHERE ragazzo_id=boy_id AND anno_scout='2001-2002') IS FALSE, 'Opening reset year copied members again';
  PERFORM public.reset_year_data('1902-1903','ragazzi');
  PERFORM public.write_annual_boy('1901-1902',boy_id,pg_catalog.jsonb_build_object('nome','Earlier','cognome','AnnualRoster','attivo',true));
  PERFORM public.ensure_roster_year('1902-1903');
  ASSERT NOT EXISTS(SELECT 1 FROM public.ragazzi_anni WHERE anno_scout='1902-1903'), 'Empty reset-year marker failed to prevent a later recopy';
END;
$test$;
RESET ROLE;
ROLLBACK;
