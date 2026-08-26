-- ==============================================================================
-- SCRIPT PER ELIMINARE LE VOCI STORICHE DI CENSIMENTO DALLA CASSA (REGISTRO SPESE)
-- Esegui questo script nel SQL Editor di Supabase
-- ==============================================================================

DELETE FROM public.registro_spese
WHERE LOWER(voce_spesa) LIKE '%censimento%'
   OR LOWER(note) LIKE '%censimento%';
