-- 1. Rimuoviamo il vincolo (check constraint) sul tipo di evento che bloccava l'inserimento
ALTER TABLE public.eventi DROP CONSTRAINT IF EXISTS eventi_tipo_evento_check;

-- 2. Creiamo policy RLS esplicite per permettere tutte le operazioni (Lettura, Inserimento, Modifica, Cancellazione)
-- Abilitiamo l'RLS per sicurezza, ma aggiungiamo una regola che fa passare tutto (dato che l'app non ha un login stretto per ora)

-- Tabella Impostazioni
ALTER TABLE public.impostazioni ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on impostazioni" ON public.impostazioni;
CREATE POLICY "Allow all on impostazioni" ON public.impostazioni FOR ALL USING (true) WITH CHECK (true);

-- Tabella Eventi
ALTER TABLE public.eventi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on eventi" ON public.eventi;
CREATE POLICY "Allow all on eventi" ON public.eventi FOR ALL USING (true) WITH CHECK (true);

-- Tabella Categorie Spesa
ALTER TABLE public.categorie_spesa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on categorie_spesa" ON public.categorie_spesa;
CREATE POLICY "Allow all on categorie_spesa" ON public.categorie_spesa FOR ALL USING (true) WITH CHECK (true);

-- Tabella Pattuglie
ALTER TABLE public.pattuglie ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on pattuglie" ON public.pattuglie;
CREATE POLICY "Allow all on pattuglie" ON public.pattuglie FOR ALL USING (true) WITH CHECK (true);

-- Tabella Ragazzi
ALTER TABLE public.ragazzi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on ragazzi" ON public.ragazzi;
CREATE POLICY "Allow all on ragazzi" ON public.ragazzi FOR ALL USING (true) WITH CHECK (true);

-- Tabella Quote Mensili
ALTER TABLE public.quote_mensili ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on quote_mensili" ON public.quote_mensili;
CREATE POLICY "Allow all on quote_mensili" ON public.quote_mensili FOR ALL USING (true) WITH CHECK (true);

-- Tabella Partecipazioni Eventi
ALTER TABLE public.partecipazioni_eventi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on partecipazioni_eventi" ON public.partecipazioni_eventi;
CREATE POLICY "Allow all on partecipazioni_eventi" ON public.partecipazioni_eventi FOR ALL USING (true) WITH CHECK (true);

-- Tabella Registro Spese
ALTER TABLE public.registro_spese ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all on registro_spese" ON public.registro_spese;
CREATE POLICY "Allow all on registro_spese" ON public.registro_spese FOR ALL USING (true) WITH CHECK (true);

-- Concediamo i permessi di utilizzo generici
GRANT ALL ON TABLE public.impostazioni TO anon, authenticated;
GRANT ALL ON TABLE public.eventi TO anon, authenticated;
