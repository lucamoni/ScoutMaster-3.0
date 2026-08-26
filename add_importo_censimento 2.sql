-- ==============================================================================
-- MIGRAZIONE: Aggiunta colonna importo_censimento alla tabella ragazzi
-- Esegui questo script nel SQL Editor di Supabase
-- ==============================================================================

ALTER TABLE public.ragazzi ADD COLUMN IF NOT EXISTS importo_censimento numeric;
