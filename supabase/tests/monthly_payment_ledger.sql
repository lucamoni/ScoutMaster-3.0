-- Regression proof after the historical-monthly migration. All changes roll back.
-- The temporary negative numbering default avoids consuming production sequences.
BEGIN;
CREATE TEMP SEQUENCE monthly_ledger_test_numbers START -1900000000 INCREMENT -1;
ALTER TABLE public.registro_spese ALTER COLUMN numero_operazione
  SET DEFAULT pg_catalog.nextval('pg_temp.monthly_ledger_test_numbers');

DO $test$
DECLARE
  boy_id uuid;
  quote_id uuid;
  event_id uuid;
  participation_id uuid;
  movement public.registro_spese;
BEGIN
  INSERT INTO public.impostazioni (chiave, valore) VALUES
    ('quota_mensile_standard', '10'),
    ('quota_mensile_standard_1998-1999', '8'),
    ('anno_chiuso_1998-1999', 'false'),
    ('anno_chiuso_1999-2000', 'false')
  ON CONFLICT (chiave) DO UPDATE SET valore = EXCLUDED.valore;

  INSERT INTO public.ragazzi (nome, cognome, attivo) VALUES ('Test', 'MonthlyLedger', false) RETURNING id INTO boy_id;
  INSERT INTO public.quote_mensili (ragazzo_id, anno_scout, novembre)
    VALUES (boy_id, '1998/1999', true) RETURNING id INTO quote_id;
  SELECT * INTO STRICT movement FROM public.registro_spese WHERE quota_mensile_id = quote_id AND riferimento_quota = 'novembre';
  ASSERT movement.importo = 8 AND movement.data = DATE '1999-09-30' AND movement.momento_anno = 'ANNO', 'Historical year/tariff not applied';

  UPDATE public.registro_spese SET importo = 11, data = DATE '1999-03-15', metodo = 'Bonifico' WHERE id = movement.id;
  UPDATE public.impostazioni SET valore = '9' WHERE chiave = 'quota_mensile_standard_1998-1999';
  UPDATE public.quote_mensili SET dicembre = true WHERE id = quote_id;
  SELECT * INTO STRICT movement FROM public.registro_spese WHERE quota_mensile_id = quote_id AND riferimento_quota = 'novembre';
  ASSERT movement.importo = 11 AND movement.data = DATE '1999-03-15' AND movement.metodo = 'Bonifico', 'Another-month toggle erased manual correction';
  SELECT * INTO STRICT movement FROM public.registro_spese WHERE quota_mensile_id = quote_id AND riferimento_quota = 'dicembre';
  ASSERT movement.importo = 9 AND movement.data = DATE '1999-09-30', 'New payment did not use historical tariff';
  UPDATE public.quote_mensili SET dicembre = true WHERE id = quote_id;
  ASSERT (SELECT count(*) FROM public.registro_spese WHERE quota_mensile_id = quote_id) = 2, 'Repeated toggle duplicated payments';

  UPDATE public.quote_mensili SET importo_mensile = 0, gennaio = true WHERE id = quote_id;
  ASSERT NOT EXISTS (SELECT 1 FROM public.registro_spese WHERE quota_mensile_id = quote_id AND importo <> 0), 'Explicit zero tariff not preserved';
  ASSERT (SELECT data FROM public.registro_spese WHERE quota_mensile_id = quote_id AND riferimento_quota = 'novembre') = DATE '1999-03-15', 'Tariff change moved manual date';
  UPDATE public.quote_mensili SET anno_scout = '1999-2000' WHERE id = quote_id;
  ASSERT NOT EXISTS (SELECT 1 FROM public.registro_spese WHERE quota_mensile_id = quote_id AND (importo <> 0 OR data <> DATE '2000-09-30')), 'Explicit year correction not propagated';
  UPDATE public.quote_mensili SET data_contabile = DATE '2000-03-01' WHERE id = quote_id;
  ASSERT NOT EXISTS (SELECT 1 FROM public.registro_spese WHERE quota_mensile_id = quote_id AND data <> DATE '2000-03-01'), 'Source accounting date not applied';
  UPDATE public.quote_mensili SET importo_mensile = 8 WHERE id = quote_id;
  ASSERT NOT EXISTS (SELECT 1 FROM public.registro_spese WHERE quota_mensile_id = quote_id AND (importo <> 8 OR data <> DATE '2000-03-01')), 'Explicit import tariff not applied independently of date';
  UPDATE public.quote_mensili SET data_contabile = DATE '2001-03-01' WHERE id = quote_id;
  ASSERT NOT EXISTS (SELECT 1 FROM public.registro_spese WHERE quota_mensile_id = quote_id AND data <> DATE '2000-09-30'), 'Out-of-year source date escaped its scout year';
  UPDATE public.quote_mensili SET gennaio = false WHERE id = quote_id;
  ASSERT (SELECT count(*) FROM public.registro_spese WHERE quota_mensile_id = quote_id) = 2, 'Unpaid toggle did not remove its payment';

  INSERT INTO public.eventi (nome_evento, tipo_evento, quota_standard, data_inizio, metodo_pagamento)
    VALUES ('Test winter ledger', 'CI', 100, DATE '2000-02-01', 'Bonifico') RETURNING id INTO event_id;
  INSERT INTO public.partecipazioni_eventi (ragazzo_id, evento_id, riscosso, quota_dovuta, metodo_pagamento, stato_presenza)
    VALUES (boy_id, event_id, true, 0, 'Bonifico', 'Presente') RETURNING id INTO participation_id;
  SELECT * INTO STRICT movement FROM public.registro_spese WHERE partecipazione_evento_id = participation_id;
  ASSERT movement.momento_anno = 'CI' AND movement.importo = 0, 'Winter filter/exemption not applied';
  UPDATE public.eventi SET tipo_evento = 'CE' WHERE id = event_id;
  UPDATE public.partecipazioni_eventi SET quota_dovuta = 190 WHERE id = participation_id;
  SELECT * INTO STRICT movement FROM public.registro_spese WHERE partecipazione_evento_id = participation_id;
  ASSERT movement.momento_anno = 'CE' AND movement.importo = 190, 'Summer filter not applied';
  UPDATE public.eventi SET tipo_evento = 'USCITA' WHERE id = event_id;
  UPDATE public.partecipazioni_eventi SET quota_dovuta = 10 WHERE id = participation_id;
  ASSERT (SELECT momento_anno FROM public.registro_spese WHERE partecipazione_evento_id = participation_id) = 'ANNO', 'Ordinary activity filter not applied';

  ASSERT NOT EXISTS (SELECT 1 FROM pg_catalog.pg_proc WHERE oid IN ('public.sync_monthly_payment_ledger()'::regprocedure, 'public.sync_event_payment_ledger()'::regprocedure) AND prosecdef), 'Ledger trigger must preserve caller authorization';
END;
$test$;
ROLLBACK;
