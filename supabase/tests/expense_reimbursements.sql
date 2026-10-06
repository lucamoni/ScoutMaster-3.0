BEGIN;
CREATE TEMP SEQUENCE reimbursement_test_numbers START -1700000000 INCREMENT -1;
ALTER TABLE public.registro_spese ALTER COLUMN numero_operazione SET DEFAULT pg_catalog.nextval('pg_temp.reimbursement_test_numbers');
GRANT USAGE,SELECT ON SEQUENCE pg_temp.reimbursement_test_numbers TO service_role;
SET LOCAL ROLE service_role;
DO $$
DECLARE actor uuid:=pg_catalog.gen_random_uuid(); req uuid:=pg_catalog.gen_random_uuid(); cancel_req uuid:=pg_catalog.gen_random_uuid(); closed_req uuid:=pg_catalog.gen_random_uuid(); movement uuid; retry uuid; before_count integer;
BEGIN
 ASSERT NOT pg_catalog.has_table_privilege('authenticated','public.rimborsi','SELECT'), 'Client reads exposed';
 ASSERT NOT pg_catalog.has_table_privilege('authenticated','public.rimborsi','UPDATE'), 'Client can fake settled status';
 ASSERT NOT pg_catalog.has_function_privilege('authenticated','public.confirm_reimbursement(uuid,uuid,text,date,text)','EXECUTE'), 'Client can confirm reimbursements';
 SELECT count(*) INTO before_count FROM public.registro_spese;
 INSERT INTO public.rimborsi(id,created_by,created_by_name,beneficiary_id,beneficiary_name,anno_scout,data_spesa,importo,categoria,momento_anno,note,file_path,file_name,fingerprint)
 VALUES(req,actor,'Creator Test',actor,'Recipient Test','1998-1999',DATE '1999-09-30',12.34,'Materiale','CI','Note test','test/foto.jpg','foto.jpg','test-fingerprint');
 ASSERT (SELECT count(*) FROM public.registro_spese)=before_count, 'Pending request changed accounting';
 movement:=public.confirm_reimbursement(req,actor,'Validator Test',DATE '1999-10-01','Carta');
 ASSERT (SELECT count(*) FROM public.registro_spese)=before_count+1, 'Confirmation not exactly one movement';
 ASSERT (SELECT data=DATE '1999-10-01' AND importo=12.34 AND metodo='Carta' AND tipo_movimento='USCITA' AND momento_anno='CI' AND rimborso_id=req AND foto_scontrino_url='rimborso:'||req::text||'/foto.jpg' FROM public.registro_spese WHERE id=movement), 'Cross-year/date/method/file/amount not conserved';
 ASSERT (SELECT stato='RIMBORSATO' AND movimento_id=movement AND validated_by=actor AND validated_by_name='Validator Test' AND data_spesa=DATE '1999-09-30' AND anno_scout='1998-1999' FROM public.rimborsi WHERE id=req), 'Audit/original expense lost';
 retry:=public.confirm_reimbursement(req,actor,'Validator Test',DATE '1999-10-01','Carta');
 ASSERT retry=movement AND (SELECT count(*) FROM public.registro_spese)=before_count+1, 'Retry duplicated expense';
 BEGIN PERFORM public.confirm_reimbursement(req,actor,'Validator Test',DATE '1999-10-02','Bonifico'); RAISE EXCEPTION 'Different retry accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Rimborso già confermato con data o metodo diversi' THEN RAISE;END IF;END;
 BEGIN UPDATE public.registro_spese SET importo=99 WHERE id=movement;RAISE EXCEPTION 'Movement mutable';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Movimento di rimborso validato: dati e scontrino devono restare conservati' THEN RAISE;END IF;END;
 BEGIN DELETE FROM public.registro_spese WHERE id=movement;RAISE EXCEPTION 'Movement removable';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Movimento di rimborso validato: dati e scontrino devono restare conservati' THEN RAISE;END IF;END;
 INSERT INTO public.rimborsi(id,created_by,created_by_name,beneficiary_id,beneficiary_name,anno_scout,data_spesa,importo,categoria,momento_anno,fingerprint,stato)
 VALUES(cancel_req,actor,'Creator',actor,'Recipient','1998-1999','1999-09-01',25,'Altro','ANNO','cancel','ANNULLATO');
 BEGIN PERFORM public.confirm_reimbursement(cancel_req,actor,'Validator','1999-10-01','Contanti');RAISE EXCEPTION 'Cancelled request paid';EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'Richiesta annullata: nessuna uscita registrata' THEN RAISE;END IF;END;
 INSERT INTO public.rimborsi(id,created_by,created_by_name,beneficiary_id,beneficiary_name,anno_scout,data_spesa,importo,categoria,momento_anno,fingerprint)
 VALUES(closed_req,actor,'Creator',actor,'Recipient','1998-1999','1999-09-01',35,'Altro','ANNO','closed');
 INSERT INTO public.impostazioni(chiave,valore)VALUES('anno_chiuso_1999-2000','true') ON CONFLICT(chiave) DO UPDATE SET valore='true';
 BEGIN PERFORM public.confirm_reimbursement(closed_req,actor,'Validator','1999-10-02','Contanti');RAISE EXCEPTION 'Closed-year payment accepted';EXCEPTION WHEN check_violation THEN NULL;END;
 ASSERT (SELECT stato='DA_RIMBORSARE' AND movimento_id IS NULL FROM public.rimborsi WHERE id=closed_req), 'Failed confirmation changed pending state';
 ASSERT (SELECT count(*) FROM public.registro_spese)=before_count+1, 'Failed confirmation left partial ledger';
END $$;
RESET ROLE;
ROLLBACK;
