-- Aggiunta colonne a registro_spese
ALTER TABLE public.registro_spese ADD COLUMN IF NOT EXISTS tipo_movimento text DEFAULT 'USCITA';
ALTER TABLE public.registro_spese ADD COLUMN IF NOT EXISTS ragazzo_id uuid REFERENCES public.ragazzi(id) ON DELETE SET NULL;
ALTER TABLE public.registro_spese ADD COLUMN IF NOT EXISTS riferimento_quota text;
ALTER TABLE public.registro_spese ADD COLUMN IF NOT EXISTS quota_mensile_id uuid REFERENCES public.quote_mensili(id) ON DELETE SET NULL;
ALTER TABLE public.registro_spese ADD COLUMN IF NOT EXISTS partecipazione_evento_id uuid REFERENCES public.partecipazioni_eventi(id) ON DELETE SET NULL;

-- Aggiunta colonna a eventi per il metodo di riscossione di default
ALTER TABLE public.eventi ADD COLUMN IF NOT EXISTS metodo_pagamento text DEFAULT 'Contanti';
