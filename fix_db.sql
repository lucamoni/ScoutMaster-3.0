-- 1. Assicuriamo i permessi di base
GRANT ALL ON TABLE public.pattuglie TO anon, authenticated;
GRANT ALL ON TABLE public.categorie_spesa TO anon, authenticated;

-- Disabilitiamo RLS per essere sicuri che non blocchi le operazioni (visto che non c'è autenticazione stretta)
ALTER TABLE public.pattuglie DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorie_spesa DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.eventi DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ragazzi DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_mensili DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.partecipazioni_eventi DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.registro_spese DISABLE ROW LEVEL SECURITY;

-- 2. Creiamo una tabella per le impostazioni globali (es. costo quota mensile)
CREATE TABLE IF NOT EXISTS public.impostazioni (
  chiave text PRIMARY KEY,
  valore text NOT NULL
);
GRANT ALL ON TABLE public.impostazioni TO anon, authenticated;
ALTER TABLE public.impostazioni DISABLE ROW LEVEL SECURITY;

-- Inseriamo il valore di default per la quota mensile (es. 15 euro)
INSERT INTO public.impostazioni (chiave, valore) VALUES ('quota_mensile_standard', '15')
ON CONFLICT (chiave) DO NOTHING;
