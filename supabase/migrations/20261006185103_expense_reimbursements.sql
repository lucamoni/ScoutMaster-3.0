BEGIN;
CREATE TABLE public.rimborsi (
 id uuid PRIMARY KEY,
 created_by uuid NOT NULL,
 created_by_name text NOT NULL,
 beneficiary_id uuid NOT NULL,
 beneficiary_name text NOT NULL,
 anno_scout text NOT NULL,
 data_spesa date NOT NULL,
 importo numeric(12,2) NOT NULL CHECK(importo>0 AND importo<=1000000),
 categoria text NOT NULL CHECK(length(btrim(categoria)) BETWEEN 1 AND 150),
 momento_anno text NOT NULL CHECK(momento_anno IN('ANNO','CI','CE')),
 note text NOT NULL DEFAULT '' CHECK(length(note)<=2000),
 file_path text,
 file_name text,
 fingerprint text NOT NULL,
 stato text NOT NULL DEFAULT 'DA_RIMBORSARE' CHECK(stato IN('DA_RIMBORSARE','RIMBORSATO','ANNULLATO')),
 movimento_id uuid UNIQUE REFERENCES public.registro_spese(id) ON DELETE RESTRICT,
 data_rimborso date,
 metodo_rimborso text CHECK(metodo_rimborso IN('Contanti','Bonifico','Carta')),
 validated_by uuid,
 validated_by_name text,
 validated_at timestamptz,
 cancelled_by uuid,
 cancelled_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(anno_scout=CASE WHEN extract(month FROM data_spesa)>=10 THEN extract(year FROM data_spesa)::integer::text || '-' || (extract(year FROM data_spesa)::integer+1)::text ELSE (extract(year FROM data_spesa)::integer-1)::text || '-' || extract(year FROM data_spesa)::integer::text END),
 CHECK((file_path IS NULL)=(file_name IS NULL)),
 CHECK(CASE WHEN stato='RIMBORSATO' THEN movimento_id IS NOT NULL AND data_rimborso IS NOT NULL AND data_rimborso>=data_spesa AND metodo_rimborso IS NOT NULL AND validated_by IS NOT NULL AND validated_by_name IS NOT NULL AND validated_at IS NOT NULL ELSE movimento_id IS NULL AND data_rimborso IS NULL AND metodo_rimborso IS NULL AND validated_by IS NULL AND validated_at IS NULL END)
);
CREATE INDEX rimborsi_year_status ON public.rimborsi(anno_scout,stato,created_at DESC);
CREATE INDEX rimborsi_beneficiary ON public.rimborsi(beneficiary_id,stato);
CREATE INDEX rimborsi_creator ON public.rimborsi(created_by);
ALTER TABLE public.rimborsi ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rimborsi FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.rimborsi TO service_role;
ALTER TABLE public.registro_spese ADD COLUMN rimborso_id uuid UNIQUE REFERENCES public.rimborsi(id) ON DELETE RESTRICT;

-- Trigger needs no private table read: settled ledger rows carry their own link.
CREATE FUNCTION public.protect_reimbursement_movement() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.rimborso_id IS NOT NULL AND current_user NOT IN('service_role','postgres') THEN RAISE EXCEPTION 'Il rimborso deve essere confermato dal tesoriere o admin';END IF;
  RETURN NEW;
 END IF;
 IF OLD.rimborso_id IS NOT NULL THEN
  IF TG_OP='DELETE' OR NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Movimento di rimborso validato: dati e scontrino devono restare conservati';END IF;
 ELSIF TG_OP='UPDATE' AND NEW.rimborso_id IS NOT NULL THEN
  RAISE EXCEPTION 'Non è possibile collegare manualmente un rimborso';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.protect_reimbursement_movement() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER protect_reimbursement_movement BEFORE INSERT OR UPDATE OR DELETE ON public.registro_spese FOR EACH ROW EXECUTE FUNCTION public.protect_reimbursement_movement();

CREATE FUNCTION public.confirm_reimbursement(p_id uuid,p_actor uuid,p_actor_name text,p_date date,p_method text) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE req public.rimborsi; movement uuid; today date:= (pg_catalog.now() AT TIME ZONE 'Europe/Rome')::date;
BEGIN
 -- Called only by the service-role API after fresh Auth permission validation.
 -- No grants on auth.users are needed or introduced.
 IF p_actor IS NULL OR p_actor_name IS NULL OR length(btrim(p_actor_name)) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Validatore non valido';END IF;
 SELECT * INTO req FROM public.rimborsi WHERE id=p_id FOR UPDATE;
 IF req.id IS NULL THEN RAISE EXCEPTION 'Richiesta non trovata';END IF;
 IF req.stato='RIMBORSATO' THEN
  IF req.data_rimborso IS DISTINCT FROM p_date OR req.metodo_rimborso IS DISTINCT FROM p_method THEN RAISE EXCEPTION 'Rimborso già confermato con data o metodo diversi';END IF;
  RETURN req.movimento_id;
 END IF;
 IF req.stato<>'DA_RIMBORSARE' THEN RAISE EXCEPTION 'Richiesta annullata: nessuna uscita registrata';END IF;
 IF p_date IS NULL OR p_date<req.data_spesa OR p_date>today OR p_method IS NULL OR p_method NOT IN('Contanti','Bonifico','Carta') THEN RAISE EXCEPTION 'Indica data effettiva del rimborso e metodo valido';END IF;
 INSERT INTO public.registro_spese(importo,data,metodo,tipo_movimento,voce_spesa,momento_anno,note,ricevuta_presente,foto_scontrino_url,rimborso_id)
 VALUES(req.importo,p_date,p_method,'USCITA',req.categoria,req.momento_anno,
  'Rimborso a '||req.beneficiary_name||' · spesa del '||req.data_spesa::text||CASE WHEN req.note<>'' THEN ' · '||req.note ELSE '' END,
  req.file_path IS NOT NULL,CASE WHEN req.file_path IS NOT NULL THEN 'rimborso:'||req.id::text||'/'||req.file_name ELSE NULL END,req.id)
 RETURNING id INTO movement;
 UPDATE public.rimborsi SET stato='RIMBORSATO',movimento_id=movement,data_rimborso=p_date,metodo_rimborso=p_method,
  validated_by=p_actor,validated_by_name=p_actor_name,validated_at=pg_catalog.now() WHERE id=p_id;
 RETURN movement;
END $$;
REVOKE ALL ON FUNCTION public.confirm_reimbursement(uuid,uuid,text,date,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_reimbursement(uuid,uuid,text,date,text) TO service_role;
INSERT INTO storage.buckets(id,name,public,file_size_limit) VALUES('rimborsi','rimborsi',false,3145728) ON CONFLICT(id) DO NOTHING;
COMMIT;
