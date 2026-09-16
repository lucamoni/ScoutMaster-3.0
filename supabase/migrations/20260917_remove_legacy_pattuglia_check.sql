-- La pattuglia è gestita dalla tabella public.pattuglie e può essere
-- modificata dall'interfaccia. Il vecchio CHECK con valori hard-coded
-- impediva di assegnare nuove pattuglie o rinominare quelle esistenti.
ALTER TABLE public.ragazzi
  DROP CONSTRAINT IF EXISTS ragazzi_pattuglia_check;
