BEGIN;
DO $$
DECLARE
 legacy_before jsonb;
 legacy_after jsonb;
 source record;
 entries jsonb;
 item jsonb;
 entry_position bigint;
 scope text;
 migrated public.documenti_annuali%ROWTYPE;
BEGIN
 SELECT jsonb_object_agg(chiave, valore) INTO legacy_before FROM public.impostazioni
 WHERE chiave IN ('custom_docs_ragazzi', 'archivio_documenti_digitale');
 INSERT INTO public.documenti_annuali(anno_scout, kind, id, dati, file_url) VALUES
 ('2025-2026','custom','__test_annual_document', '{"consegnato":true}', NULL),
 ('2026-2027','custom','__test_annual_document', '{"consegnato":false}', NULL),
 ('legacy','file','__test_annual_document', '{"file_name":"prova.pdf"}', 'data:application/pdf;base64,JVBERi0=');
 UPDATE public.documenti_annuali SET dati = '{"consegnato":true}'
 WHERE anno_scout='2026-2027' AND kind='custom' AND id='__test_annual_document';
 DELETE FROM public.documenti_annuali
 WHERE anno_scout='2026-2027' AND kind='custom' AND id='__test_annual_document';
 IF NOT EXISTS (SELECT 1 FROM public.documenti_annuali WHERE anno_scout='2025-2026' AND kind='custom' AND id='__test_annual_document' AND dati->>'consegnato'='true') THEN
  RAISE EXCEPTION 'L’anno precedente è stato modificato';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.documenti_annuali WHERE anno_scout='legacy' AND kind='file' AND id='__test_annual_document' AND file_url='data:application/pdf;base64,JVBERi0=') THEN
  RAISE EXCEPTION 'Il file precedente è stato perso';
 END IF;
 SELECT jsonb_object_agg(chiave, valore) INTO legacy_after FROM public.impostazioni
 WHERE chiave IN ('custom_docs_ragazzi', 'archivio_documenti_digitale');
 IF legacy_before IS DISTINCT FROM legacy_after THEN RAISE EXCEPTION 'Le fonti precedenti sono state modificate'; END IF;
 IF has_table_privilege('authenticated', 'public.documenti_annuali', 'SELECT') OR has_table_privilege('authenticated', 'public.documenti_annuali', 'UPDATE') THEN
  RAISE EXCEPTION 'I documenti devono essere accessibili soltanto dalle API autenticate';
 END IF;
 -- Check every readable legacy entry, including duplicate original identifiers:
 -- migration must retain the full metadata and exact original file content.
 FOR source IN SELECT chiave, valore FROM public.impostazioni
 WHERE chiave IN ('custom_docs_ragazzi', 'archivio_documenti_digitale')
 LOOP
  BEGIN entries := source.valore::jsonb;
  EXCEPTION WHEN invalid_text_representation THEN CONTINUE;
  END;
  IF jsonb_typeof(entries) <> 'array' THEN CONTINUE; END IF;
  FOR item, entry_position IN SELECT value, ordinality FROM jsonb_array_elements(entries) WITH ORDINALITY
  LOOP
   scope := 'legacy';
   IF coalesce(item->>'anno_scout', '') ~ '^[0-9]{4}-[0-9]{4}$' THEN
    IF substring(item->>'anno_scout', 6, 4)::integer = substring(item->>'anno_scout', 1, 4)::integer + 1 THEN scope := item->>'anno_scout'; END IF;
   END IF;
   SELECT * INTO migrated FROM public.documenti_annuali
   WHERE anno_scout=scope
    AND kind=CASE source.chiave WHEN 'custom_docs_ragazzi' THEN 'custom' ELSE 'file' END
    AND id='legacy_' || source.chiave || '_' || entry_position;
   IF NOT FOUND OR migrated.dati IS DISTINCT FROM (CASE WHEN jsonb_typeof(item)='object' THEN item-'file_url' ELSE item END)
    OR migrated.file_url IS DISTINCT FROM item->>'file_url' THEN
    RAISE EXCEPTION 'Un documento precedente non è stato preservato integralmente';
   END IF;
  END LOOP;
 END LOOP;
END;
$$;
ROLLBACK;
