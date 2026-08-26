-- ==============================================================================
-- SCRIPT DI RIPULISTI E SINCRONIZZAZIONE GENERALE EVENTI E CASSA
-- Esegui questo script nel SQL Editor di Supabase per allineare tutto il DB
-- ==============================================================================

-- 1. Assicura che le partecipazioni per tutti i ragazzi attivi esistano per ogni evento
INSERT INTO public.partecipazioni_eventi (ragazzo_id, evento_id, quota_dovuta, metodo_pagamento, stato_presenza, riscosso)
SELECT r.id, e.id, e.quota_standard, COALESCE(e.metodo_pagamento, 'Bonifico'), 'Presente', false
FROM public.ragazzi r
CROSS JOIN public.eventi e
WHERE r.attivo = true
ON CONFLICT (ragazzo_id, evento_id) 
DO UPDATE SET metodo_pagamento = EXCLUDED.metodo_pagamento
WHERE partecipazioni_eventi.metodo_pagamento IS NULL;

-- 2. Sincronizza il metodo_pagamento delle partecipazioni con quello dell'evento corrispondente
UPDATE public.partecipazioni_eventi pe
SET metodo_pagamento = e.metodo_pagamento
FROM public.eventi e
WHERE pe.evento_id = e.id
  AND e.metodo_pagamento IS NOT NULL
  AND (pe.metodo_pagamento IS NULL OR pe.metodo_pagamento <> e.metodo_pagamento);

-- 3. Sincronizza il metodo delle voci di cassa (registro_spese) con quello delle partecipazioni/eventi collegati
UPDATE public.registro_spese rs
SET metodo = pe.metodo_pagamento
FROM public.partecipazioni_eventi pe
WHERE rs.partecipazione_evento_id = pe.id
  AND pe.metodo_pagamento IS NOT NULL
  AND (rs.metodo IS NULL OR rs.metodo <> pe.metodo_pagamento);

UPDATE public.registro_spese rs
SET metodo = e.metodo_pagamento
FROM public.eventi e
WHERE rs.voce_spesa = 'Evento: ' || e.nome_evento
  AND e.metodo_pagamento IS NOT NULL
  AND (rs.metodo IS NULL OR rs.metodo <> e.metodo_pagamento);

-- 4. Ripulisci eventuali doppioni o record privi di metodo in registro_spese
UPDATE public.registro_spese
SET metodo = 'Bonifico'
WHERE (metodo IS NULL OR metodo = '')
  AND (UPPER(note) LIKE '%BONIFICO%' OR UPPER(note) LIKE '%BB%' OR UPPER(voce_spesa) LIKE '%BONIFICO%');

UPDATE public.registro_spese
SET metodo = 'Contanti'
WHERE metodo IS NULL OR metodo = '';

-- ==============================================================================
-- FINE SCRIPT
