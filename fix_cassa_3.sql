-- 1. Aggiungi vincolo UNIQUE se mancante a quote_mensili
ALTER TABLE public.quote_mensili DROP CONSTRAINT IF EXISTS quote_mensili_ragazzo_id_anno_scout_key;
ALTER TABLE public.quote_mensili ADD CONSTRAINT quote_mensili_ragazzo_id_anno_scout_key UNIQUE (ragazzo_id, anno_scout);

-- 2. Aggiungi vincolo UNIQUE se mancante a partecipazioni_eventi
ALTER TABLE public.partecipazioni_eventi DROP CONSTRAINT IF EXISTS partecipazioni_eventi_ragazzo_id_evento_id_key;
ALTER TABLE public.partecipazioni_eventi ADD CONSTRAINT partecipazioni_eventi_ragazzo_id_evento_id_key UNIQUE (ragazzo_id, evento_id);

-- 3. Inserisci la categoria di default per le quote mensili (solo se non esiste)
INSERT INTO public.categorie_spesa (nome, tipo_movimento)
SELECT 'Quota Mensile', 'ENTRATA'
WHERE NOT EXISTS (
    SELECT 1 FROM public.categorie_spesa WHERE nome = 'Quota Mensile'
);

-- 4. Inserisci le categorie di default per gli eventi esistenti (solo se non esistono)
INSERT INTO public.categorie_spesa (nome, tipo_movimento)
SELECT 'Evento: ' || e.nome_evento, 'ENTRATA'
FROM public.eventi e
WHERE NOT EXISTS (
    SELECT 1 FROM public.categorie_spesa WHERE nome = 'Evento: ' || e.nome_evento
);
