import { requireAuthenticatedUser } from '@/lib/security/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { sameOrigin,config } from './server'
import { makeSnapshot } from './model'
export async function prepare(request:Request){
 const actor=await requireAuthenticatedUser();sameOrigin(request);const input=await request.json();if(!Array.isArray(input.ids)||input.ids.length<1||input.ids.length>500||input.ids.some((id:unknown)=>typeof id!=='string'||!/^[a-f0-9-]{36}$/i.test(id)))throw Error('Selezione non valida')
 const db=createAdminClient();const [{data:boy,error:be},{data:movements,error:me},{data:links,error:le},issuer]=await Promise.all([db.from('ragazzi').select('*').eq('id',String(input.boyId)).single(),db.from('registro_spese').select('*').in('id',input.ids),db.from('ricevute_movimenti').select('movimento_id').in('movimento_id',input.ids),config()])
 if(be||me||le||!boy||movements.length!==input.ids.length)throw Error('Dati cambiati o non disponibili: aggiorna la pagina')
 return {actor,db,input,snapshot:makeSnapshot(boy,movements,input.year,Number(input.parent),issuer,new Set(links.map(l=>l.movimento_id)),input.date)}
}
