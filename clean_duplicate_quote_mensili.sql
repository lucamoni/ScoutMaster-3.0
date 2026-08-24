-- ==============================================================================
-- SCRIPT DI UNIFORMAZIONE E RIMOZIONE DUPLICATI QUOTE MENSILE (NO TEMP TABLES)
-- Esegui questo script nel SQL Editor di Supabase
-- ==============================================================================

-- 1. Uniforma le barre '/' in trattini '-' dove non crea conflitti immediati
UPDATE public.quote_mensili
SET anno_scout = REPLACE(anno_scout, '/', '-')
WHERE REPLACE(anno_scout, '/', '-') NOT IN (
  SELECT q2.anno_scout 
  FROM public.quote_mensili q2 
  WHERE q2.ragazzo_id = quote_mensili.ragazzo_id AND q2.id != quote_mensili.id
);

-- 2. Unisci tutti i mesi saldati dalla riga duplicata (q2) nella riga principale (q1)
UPDATE public.quote_mensili q1
SET 
  novembre = (q1.novembre OR q2.novembre),
  dicembre = (q1.dicembre OR q2.dicembre),
  gennaio = (q1.gennaio OR q2.gennaio),
  febbraio = (q1.febbraio OR q2.febbraio),
  marzo = (q1.marzo OR q2.marzo),
  aprile = (q1.aprile OR q2.aprile),
  maggio = (q1.maggio OR q2.maggio),
  giugno = (q1.giugno OR q2.giugno)
FROM public.quote_mensili q2
WHERE q1.ragazzo_id = q2.ragazzo_id 
  AND REPLACE(q1.anno_scout, '/', '-') = REPLACE(q2.anno_scout, '/', '-')
  AND q1.id < q2.id;

-- 3. Elimina le righe duplicate
DELETE FROM public.quote_mensili q1
USING public.quote_mensili q2
WHERE q1.ragazzo_id = q2.ragazzo_id 
  AND REPLACE(q1.anno_scout, '/', '-') = REPLACE(q2.anno_scout, '/', '-')
  AND q1.id > q2.id;

-- 4. Ora che i duplicati sono stati eliminati, assicura che tutte le righe abbiano il trattino '-'
UPDATE public.quote_mensili
SET anno_scout = REPLACE(anno_scout, '/', '-');

-- 5. Aggiungi la colonna importo_censimento alla tabella ragazzi (se non ancora presente)
ALTER TABLE public.ragazzi ADD COLUMN IF NOT EXISTS importo_censimento numeric;
