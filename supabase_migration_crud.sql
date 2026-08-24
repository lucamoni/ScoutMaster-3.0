-- ==============================================================================
-- MIGRAZIONE SCOUTMASTER 3.0: CRUD Dinamico e Automazioni
-- Esegui questo script nel SQL Editor di Supabase
-- ==============================================================================

-- 1. CREAZIONE TABELLE DINAMICHE PER PATTUGLIE E CATEGORIE SPESA
CREATE TABLE IF NOT EXISTS public.pattuglie (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nome text NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS public.categorie_spesa (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nome text NOT NULL UNIQUE
);

-- Inserimento valori di default iniziali
INSERT INTO public.pattuglie (nome) VALUES 
('Pantere'), ('Aquile'), ('Leoni'), ('Cormorani'), ('Gabbiani'), ('Pernici')
ON CONFLICT (nome) DO NOTHING;

INSERT INTO public.categorie_spesa (nome) VALUES 
('Materiale da Lavoro'), ('KAMBU'), ('Materiale vario attività'), ('Altro')
ON CONFLICT (nome) DO NOTHING;

-- ==============================================================================

-- 2. SOFT DELETE PER I RAGAZZI E MODIFICHE STRUTTURALI
-- Aggiunta della colonna "attivo"
ALTER TABLE public.ragazzi ADD COLUMN IF NOT EXISTS attivo boolean DEFAULT true;

-- Aggiornamento della Foreign Key per cancellazione a cascata degli eventi
ALTER TABLE public.partecipazioni_eventi
  DROP CONSTRAINT IF EXISTS partecipazioni_eventi_evento_id_fkey;
  
ALTER TABLE public.partecipazioni_eventi
  ADD CONSTRAINT partecipazioni_eventi_evento_id_fkey 
  FOREIGN KEY (evento_id) REFERENCES public.eventi(id) ON DELETE CASCADE;

-- (Opzionale) Elimina a cascata anche le registrazioni di cassa se viene eliminato l'evento? Non specificato, ma non abbiamo un FK diretto da spesa a evento (momento_anno è text per ora).

-- ==============================================================================

-- 3. FUNZIONE DI SUPPORTO PER CALCOLARE L'ANNO SCOUT CORRENTE
-- Ritorna ad esempio '2025/2026' oppure '2026/2027' in base al mese attuale (l'anno inizia a Settembre)
CREATE OR REPLACE FUNCTION public.get_current_anno_scout() RETURNS text AS $$
DECLARE
  current_month int := EXTRACT(MONTH FROM CURRENT_DATE);
  current_year int := EXTRACT(YEAR FROM CURRENT_DATE);
BEGIN
  IF current_month >= 9 THEN
    RETURN current_year || '/' || (current_year + 1);
  ELSE
    RETURN (current_year - 1) || '/' || current_year;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ==============================================================================

-- 4. TRIGGER A: INSERIMENTO NUOVO RAGAZZO -> Crea Partecipazioni e Quote
CREATE OR REPLACE FUNCTION public.handle_new_ragazzo()
RETURNS TRIGGER AS $$
BEGIN
  -- 1. Crea la riga in quote_mensili per l'anno in corso
  INSERT INTO public.quote_mensili (ragazzo_id, anno_scout)
  VALUES (NEW.id, public.get_current_anno_scout());
  
  -- 2. Crea la partecipazione per tutti gli eventi già esistenti a sistema
  INSERT INTO public.partecipazioni_eventi (ragazzo_id, evento_id, quota_dovuta)
  SELECT NEW.id, id, quota_standard
  FROM public.eventi;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_ragazzo_created ON public.ragazzi;
CREATE TRIGGER on_ragazzo_created
  AFTER INSERT ON public.ragazzi
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_ragazzo();

-- ==============================================================================

-- 5. TRIGGER B: INSERIMENTO NUOVO EVENTO -> Crea Partecipazioni per Ragazzi ATTIVI
CREATE OR REPLACE FUNCTION public.handle_new_evento()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.partecipazioni_eventi (ragazzo_id, evento_id, quota_dovuta)
  SELECT id, NEW.id, NEW.quota_standard
  FROM public.ragazzi
  WHERE attivo = true;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_evento_created ON public.eventi;
CREATE TRIGGER on_evento_created
  AFTER INSERT ON public.eventi
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_evento();

-- ==============================================================================
-- FINE SCRIPT
