ALTER TABLE public.categorie_spesa ADD COLUMN IF NOT EXISTS tipo_movimento text DEFAULT 'USCITA';
