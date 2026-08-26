-- Script SQL per eliminare definitivamente i ragazzi archiviati (attivo = false) o di prova (Esploratore Esploratore)
DELETE FROM public.ragazzi 
WHERE attivo = false 
   OR (nome ILIKE '%esploratore%' AND cognome ILIKE '%esploratore%');
