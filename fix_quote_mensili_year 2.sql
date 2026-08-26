-- ==============================================================================
-- SCRIPT DI RISOLUZIONE E SINCRONIZZAZIONE ANNO SCOUT QUOTE MENSILE
-- Esegui questo script nel SQL Editor di Supabase per allineare l'anno scout
-- ==============================================================================

-- Assicura che tutte le quote mensili siano associate all'anno scout corrente
UPDATE public.quote_mensili
SET anno_scout = '2025-2026'
WHERE anno_scout IS NULL OR anno_scout = '';
