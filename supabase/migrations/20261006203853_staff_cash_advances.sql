BEGIN;
CREATE TABLE public.anticipi_capi (
 id uuid PRIMARY KEY, created_by uuid NOT NULL, created_by_name text NOT NULL,
 anno_scout text NOT NULL, data_spesa date NOT NULL, descrizione text NOT NULL CHECK(length(btrim(descrizione)) BETWEEN 1 AND 2000),
 importo numeric(12,2) NOT NULL CHECK(importo>0 AND importo<=1000000), metodo text NOT NULL CHECK(metodo IN('Contanti','Carta','Bonifico')),
 file_path text, file_name text, fingerprint text NOT NULL,
 movimento_id uuid UNIQUE REFERENCES public.registro_spese(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(), CHECK((file_path IS NULL)=(file_name IS NULL)),
 CHECK(anno_scout=CASE WHEN extract(month FROM data_spesa)>=10 THEN extract(year FROM data_spesa)::integer::text || '-' || (extract(year FROM data_spesa)::integer+1)::text ELSE (extract(year FROM data_spesa)::integer-1)::text || '-' || extract(year FROM data_spesa)::integer::text END)
);
CREATE TABLE public.quote_anticipi_capi (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), anticipo_id uuid NOT NULL REFERENCES public.anticipi_capi(id) ON DELETE RESTRICT,
 staff_id uuid NOT NULL, staff_name text NOT NULL, quota numeric(12,2) NOT NULL CHECK(quota>0), UNIQUE(anticipo_id,staff_id)
);
CREATE INDEX quote_anticipi_staff ON public.quote_anticipi_capi(staff_id);
CREATE INDEX anticipi_capi_year ON public.anticipi_capi(anno_scout,data_spesa DESC);
CREATE TABLE public.restituzioni_capi (
 id uuid PRIMARY KEY, quota_id uuid NOT NULL REFERENCES public.quote_anticipi_capi(id) ON DELETE RESTRICT,
 importo numeric(12,2) NOT NULL CHECK(importo>0), data date NOT NULL, metodo text NOT NULL CHECK(metodo IN('Contanti','Carta','Bonifico')),
 validated_by uuid NOT NULL, validated_by_name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 movimento_id uuid NOT NULL UNIQUE REFERENCES public.registro_spese(id) ON DELETE RESTRICT
);
CREATE INDEX restituzioni_capi_quota ON public.restituzioni_capi(quota_id);
ALTER TABLE public.anticipi_capi ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_anticipi_capi ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restituzioni_capi ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.anticipi_capi, public.quote_anticipi_capi, public.restituzioni_capi FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.anticipi_capi, public.quote_anticipi_capi, public.restituzioni_capi TO service_role;
ALTER TABLE public.registro_spese ADD COLUMN anticipo_capi_id uuid REFERENCES public.anticipi_capi(id) ON DELETE RESTRICT;
CREATE INDEX registro_spese_anticipo_capi ON public.registro_spese(anticipo_capi_id) WHERE anticipo_capi_id IS NOT NULL;
ALTER TABLE public.registro_spese ADD CONSTRAINT different_advance_links CHECK(anticipo_capi_id IS NULL OR rimborso_id IS NULL);
CREATE FUNCTION public.protect_staff_advance_movement() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.anticipo_capi_id IS NOT NULL AND current_user NOT IN('service_role','postgres') THEN RAISE EXCEPTION 'Anticipi ai capi gestiti solo da tesoriere e admin'; END IF;
  RETURN NEW;
 END IF;
 IF OLD.anticipo_capi_id IS NOT NULL THEN
  IF TG_OP='DELETE' OR NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Movimento fuori bilancio conservato con anticipo e restituzioni'; END IF;
 ELSIF TG_OP='UPDATE' AND NEW.anticipo_capi_id IS NOT NULL THEN RAISE EXCEPTION 'Non collegare manualmente un anticipo ai capi'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.protect_staff_advance_movement() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER protect_staff_advance_movement BEFORE INSERT OR UPDATE OR DELETE ON public.registro_spese FOR EACH ROW EXECUTE FUNCTION public.protect_staff_advance_movement();
CREATE FUNCTION public.create_staff_advance(p_actor uuid,p_actor_name text,p_expense jsonb,p_shares jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE req public.anticipi_capi; request_id uuid:=(p_expense->>'id')::uuid; movement uuid; total numeric; date_spesa date:=(p_expense->>'data')::date;
BEGIN
 IF p_actor IS NULL OR p_actor_name IS NULL OR length(btrim(p_actor_name)) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Validatore non valido'; END IF;
 SELECT * INTO req FROM public.anticipi_capi WHERE id=request_id FOR UPDATE;
 IF req.id IS NOT NULL THEN
  IF req.created_by=p_actor AND req.fingerprint=p_expense->>'fingerprint' THEN RETURN req.id; END IF;
  RAISE EXCEPTION 'Anticipo già registrato con dati diversi';
 END IF;
 IF date_spesa IS NULL OR date_spesa>(pg_catalog.now() AT TIME ZONE 'Europe/Rome')::date THEN RAISE EXCEPTION 'Data non valida'; END IF;
 IF pg_catalog.jsonb_typeof(p_shares)<>'array' OR pg_catalog.jsonb_array_length(p_shares) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Scegli da 1 a 100 capi'; END IF;
 IF (p_expense->>'importo')::numeric IS NULL OR (p_expense->>'importo')::numeric<>round((p_expense->>'importo')::numeric,2) OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(p_shares) WHERE (value->>'quota')::numeric IS NULL OR (value->>'quota')::numeric<=0 OR (value->>'quota')::numeric<>round((value->>'quota')::numeric,2)) THEN RAISE EXCEPTION 'Importi delle quote non validi'; END IF;
 SELECT sum((value->>'quota')::numeric) INTO total FROM pg_catalog.jsonb_array_elements(p_shares);
 IF total IS DISTINCT FROM (p_expense->>'importo')::numeric THEN RAISE EXCEPTION 'La somma delle quote deve coincidere con la spesa'; END IF;
 INSERT INTO public.anticipi_capi(id,created_by,created_by_name,anno_scout,data_spesa,descrizione,importo,metodo,file_path,file_name,fingerprint)
 VALUES(request_id,p_actor,p_actor_name,p_expense->>'anno',(p_expense->>'data')::date,p_expense->>'descrizione',(p_expense->>'importo')::numeric,p_expense->>'metodo',p_expense->>'file_path',p_expense->>'file_name',p_expense->>'fingerprint');
 INSERT INTO public.quote_anticipi_capi(anticipo_id,staff_id,staff_name,quota)
 SELECT request_id,(value->>'id')::uuid,value->>'name',(value->>'quota')::numeric FROM pg_catalog.jsonb_array_elements(p_shares);
 INSERT INTO public.registro_spese(data,importo,metodo,tipo_movimento,voce_spesa,momento_anno,note,ricevuta_presente,foto_scontrino_url,anticipo_capi_id)
 VALUES(date_spesa,(p_expense->>'importo')::numeric,p_expense->>'metodo','USCITA','Anticipo ai capi (fuori bilancio)','ANNO',p_expense->>'descrizione',p_expense->>'file_path' IS NOT NULL,CASE WHEN p_expense->>'file_path' IS NOT NULL THEN 'capo:'||request_id::text||'/'||(p_expense->>'file_name') ELSE NULL END,request_id) RETURNING id INTO movement;
 UPDATE public.anticipi_capi SET movimento_id=movement WHERE id=request_id; RETURN request_id;
END $$;
REVOKE ALL ON FUNCTION public.create_staff_advance(uuid,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_staff_advance(uuid,text,jsonb,jsonb) TO service_role;
CREATE FUNCTION public.record_staff_return(p_id uuid,p_quota uuid,p_actor uuid,p_actor_name text,p_amount numeric,p_date date,p_method text) RETURNS uuid
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE quota public.quote_anticipi_capi; req public.anticipi_capi; previous public.restituzioni_capi; returned numeric; movement uuid;
BEGIN
 IF p_actor IS NULL OR p_actor_name IS NULL OR length(btrim(p_actor_name)) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Validatore non valido'; END IF;
 SELECT * INTO quota FROM public.quote_anticipi_capi WHERE id=p_quota FOR UPDATE;
 IF quota.id IS NULL THEN RAISE EXCEPTION 'Quota non trovata'; END IF;
 SELECT * INTO previous FROM public.restituzioni_capi WHERE id=p_id;
 IF previous.id IS NOT NULL THEN
  IF previous.quota_id=p_quota AND previous.importo=p_amount AND previous.data=p_date AND previous.metodo=p_method THEN RETURN previous.movimento_id; END IF;
  RAISE EXCEPTION 'Restituzione già registrata con dati diversi';
 END IF;
 SELECT * INTO req FROM public.anticipi_capi WHERE id=quota.anticipo_id;
 IF p_date IS NULL OR p_date<req.data_spesa OR p_date>(pg_catalog.now() AT TIME ZONE 'Europe/Rome')::date OR p_method IS NULL OR p_method NOT IN('Contanti','Carta','Bonifico') THEN RAISE EXCEPTION 'Data o metodo di restituzione non validi'; END IF;
 SELECT coalesce(sum(importo),0) INTO returned FROM public.restituzioni_capi WHERE quota_id=p_quota;
 IF p_amount IS NULL OR p_amount<=0 OR p_amount<>round(p_amount,2) OR p_amount>quota.quota-returned THEN RAISE EXCEPTION 'Importo superiore al residuo o non valido'; END IF;
 INSERT INTO public.registro_spese(data,importo,metodo,tipo_movimento,voce_spesa,momento_anno,note,ricevuta_presente,anticipo_capi_id)
 VALUES(p_date,p_amount,p_method,'ENTRATA','Restituzione capi (fuori bilancio)','ANNO','Restituzione da '||quota.staff_name||' · '||req.descrizione,false,req.id) RETURNING id INTO movement;
 INSERT INTO public.restituzioni_capi(id,quota_id,importo,data,metodo,validated_by,validated_by_name,movimento_id)
 VALUES(p_id,p_quota,p_amount,p_date,p_method,p_actor,p_actor_name,movement); RETURN movement;
END $$;
REVOKE ALL ON FUNCTION public.record_staff_return(uuid,uuid,uuid,text,numeric,date,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_staff_return(uuid,uuid,uuid,text,numeric,date,text) TO service_role;
INSERT INTO storage.buckets(id,name,public,file_size_limit) VALUES('anticipi-capi','anticipi-capi',false,3145728) ON CONFLICT(id) DO NOTHING;
COMMIT;
