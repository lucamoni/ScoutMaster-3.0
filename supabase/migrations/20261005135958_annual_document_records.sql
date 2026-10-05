-- Store one document at a time: an update cannot replace other scout years or
-- overwrite the entire archive saved by another staff member.
CREATE TABLE public.documenti_annuali (
 anno_scout text NOT NULL,
 kind text NOT NULL CHECK (kind IN ('custom', 'file')),
 id text NOT NULL,
 dati jsonb NOT NULL,
 file_url text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (anno_scout, kind, id),
 CONSTRAINT documenti_annuali_year CHECK (CASE
  WHEN anno_scout = 'legacy' THEN true
  WHEN anno_scout ~ '^[0-9]{4}-[0-9]{4}$' THEN
   substring(anno_scout, 6, 4)::integer = substring(anno_scout, 1, 4)::integer + 1
  ELSE false END)
);
ALTER TABLE public.documenti_annuali ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.documenti_annuali FROM anon, authenticated;
GRANT ALL ON public.documenti_annuali TO service_role;

-- Keep the original settings untouched. Existing documents without an explicit
-- year stay in an "unknown year" archive, never counted as delivered this year.
DO $$
DECLARE
 source record;
 entries jsonb;
 item jsonb;
 entry_position bigint;
 scope text;
BEGIN
 FOR source IN SELECT chiave, valore FROM public.impostazioni
  WHERE chiave IN ('custom_docs_ragazzi', 'archivio_documenti_digitale')
 LOOP
  BEGIN
   entries := source.valore::jsonb;
  EXCEPTION WHEN invalid_text_representation THEN
   -- Preserve unreadable legacy source data for manual review.
   CONTINUE;
  END;
  IF jsonb_typeof(entries) <> 'array' THEN CONTINUE; END IF;
  FOR item, entry_position IN SELECT value, ordinality FROM jsonb_array_elements(entries) WITH ORDINALITY
  LOOP
   scope := 'legacy';
   IF coalesce(item->>'anno_scout', '') ~ '^[0-9]{4}-[0-9]{4}$' THEN
    IF substring(item->>'anno_scout', 6, 4)::integer = substring(item->>'anno_scout', 1, 4)::integer + 1 THEN
     scope := item->>'anno_scout';
    END IF;
   END IF;
   INSERT INTO public.documenti_annuali (anno_scout, kind, id, dati, file_url)
   VALUES (
    scope,
    CASE source.chiave WHEN 'custom_docs_ragazzi' THEN 'custom' ELSE 'file' END,
    'legacy_' || source.chiave || '_' || entry_position,
    CASE WHEN jsonb_typeof(item) = 'object' THEN item - 'file_url' ELSE item END,
    item->>'file_url'
   );
  END LOOP;
 END LOOP;
END;
$$;
