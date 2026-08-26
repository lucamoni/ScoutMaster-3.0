-- ==============================================================================
-- AGGIORNAMENTO SCHEMA TABELLA RAGAZZI: AGGIUNTA CAMPI ANAGRAFICI COMPLETI
-- Esegui questo script nel SQL Editor della dashboard di Supabase
-- ==============================================================================

ALTER TABLE public.ragazzi ADD COLUMN IF NOT EXISTS sesso text;
ALTER TABLE public.ragazzi ADD COLUMN IF NOT EXISTS codice_censimento text;
ALTER TABLE public.ragazzi ADD COLUMN IF NOT EXISTS data_nascita text;
ALTER TABLE public.ragazzi ADD COLUMN IF NOT EXISTS residenza text;
ALTER TABLE public.ragazzi ADD COLUMN IF NOT EXISTS codice_fiscale text;
ALTER TABLE public.ragazzi ADD COLUMN IF NOT EXISTS telefono_ragazzo text;
ALTER TABLE public.ragazzi ADD COLUMN IF NOT EXISTS genitore_1_nome text;
ALTER TABLE public.ragazzi ADD COLUMN IF NOT EXISTS genitore_1_telefono text;
ALTER TABLE public.ragazzi ADD COLUMN IF NOT EXISTS genitore_2_nome text;
ALTER TABLE public.ragazzi ADD COLUMN IF NOT EXISTS genitore_2_telefono text;
ALTER TABLE public.ragazzi ADD COLUMN IF NOT EXISTS note_sanitarie text;

-- Notifica ricaricamento dello schema cache di PostgREST
NOTIFY pgrst, 'reload schema';
