-- Chiude le policy storiche che consentivano accesso anonimo ai dati del reparto.
-- Idempotente: può essere eseguita più volte e ignora le tabelle opzionali assenti.
DO $$
DECLARE
  table_name text;
  open_policy_name text;
  authenticated_policy_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'impostazioni',
    'eventi',
    'categorie_spesa',
    'pattuglie',
    'ragazzi',
    'quote_mensili',
    'partecipazioni_eventi',
    'registro_spese',
    'eventi_buonacaccia',
    'candidature_buonacaccia',
    'scontrini'
  ] LOOP
    IF to_regclass(format('public.%I', table_name)) IS NULL THEN
      CONTINUE;
    END IF;

    open_policy_name := 'Allow all on ' || table_name;
    authenticated_policy_name := 'Authenticated access on ' || table_name;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', open_policy_name, table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', authenticated_policy_name, table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      authenticated_policy_name,
      table_name
    );
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon', table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', table_name);
  END LOOP;
END
$$;

-- Le colonne identity/serial devono rimanere utilizzabili dagli utenti autenticati.
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
