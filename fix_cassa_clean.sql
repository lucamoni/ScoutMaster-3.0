-- 1. Rimuovi eventuali vincoli CHECK restrittivi sul metodo di pagamento che potrebbero bloccare 'Bonifico' o 'Carta'
ALTER TABLE public.registro_spese DROP CONSTRAINT IF EXISTS registro_spese_metodo_check;
ALTER TABLE public.partecipazioni_eventi DROP CONSTRAINT IF EXISTS partecipazioni_eventi_metodo_pagamento_check;
ALTER TABLE public.eventi DROP CONSTRAINT IF EXISTS eventi_metodo_pagamento_check;

-- 2. Garantisci i vincoli UNIQUE necessari per evitare duplicati
ALTER TABLE public.partecipazioni_eventi DROP CONSTRAINT IF EXISTS partecipazioni_eventi_ragazzo_id_evento_id_key;
ALTER TABLE public.partecipazioni_eventi ADD CONSTRAINT partecipazioni_eventi_ragazzo_id_evento_id_key UNIQUE (ragazzo_id, evento_id);

-- 3. Pulisci eventuali record storici in registro_spese dove metodo è NULL o non formattato
UPDATE public.registro_spese 
SET metodo = 'Bonifico' 
WHERE (metodo IS NULL OR metodo = '') 
  AND (UPPER(note) LIKE '%BONIFICO%' OR UPPER(note) LIKE '%BB%' OR UPPER(voce_spesa) LIKE '%BONIFICO%');

UPDATE public.registro_spese 
SET metodo = 'Contanti' 
WHERE metodo IS NULL OR metodo = '';

-- 4. Assicurati che tutte le categorie spesa per gli eventi esistano
INSERT INTO public.categorie_spesa (nome, tipo_movimento)
SELECT 'Evento: ' || e.nome_evento, 'ENTRATA'
FROM public.eventi e
WHERE NOT EXISTS (
    SELECT 1 FROM public.categorie_spesa WHERE nome = 'Evento: ' || e.nome_evento
)
ON CONFLICT (nome) DO NOTHING;
