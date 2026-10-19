import {requireAuthenticatedUser,AuthorizationError} from '@/lib/security/auth'
import {createAdminClient} from '@/lib/supabase/admin'
import {failure,reply,sameOrigin} from '@/lib/issuedReceipts/server'
import {freshUser,authorizedRequest} from '@/lib/reimbursements/server'
import {validId,validDate,canValidateReimbursement} from '@/lib/reimbursements/model'
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){try{
 const user=await freshUser(await requireAuthenticatedUser());sameOrigin(request);const id=validId((await params).id),input=await request.json(),manager=canValidateReimbursement(user,process.env.ADMIN_EMAILS||'')
 if(input.confirm!==true)throw Error('Conferma l’operazione prima di procedere')
 const row=await authorizedRequest(id,user);const db=createAdminClient()
 if(input.action==='confirm'){
  if(!manager)throw new AuthorizationError('Solo il tesoriere o admin può confermare il rimborso',403)
  const date=validDate(input.date);if(!['Contanti','Bonifico','Carta'].includes(input.method))throw Error('Metodo non valido')
  const {data,error}=await db.rpc('confirm_reimbursement',{p_id:id,p_actor:user.id,p_actor_name:String(user.user_metadata?.name||user.email||'Utente').trim().slice(0,200),p_date:date,p_method:input.method});if(error)throw Error(error.code==='P0001'?error.message:'Rimborso non confermato: nessuna uscita è stata registrata. Verifica anche che l’anno non sia chiuso.')
  return reply({ok:true,movementId:data})
 }
 if(input.action==='edit_settled'){
  if(!manager)throw new AuthorizationError('Solo il tesoriere o admin può modificare un rimborso già pagato',403)
  if(row.stato!=='RIMBORSATO'||!row.movimento_id)throw Error('È possibile modificare soltanto rimborsi già registrati in Cassa')
  const date=validDate(input.date),amount=Number(input.amount),category=String(input.category||'').trim(),period=String(input.period||'ANNO'),note=String(input.note||'').trim(),method=String(input.method||'')
  if(!Number.isFinite(amount)||amount<=0||amount>1000000||Math.abs(amount*100-Math.round(amount*100))>0.00001)throw Error('Importo non valido')
  if(!category||category.length>150||note.length>2000||!['ANNO','CI','CE'].includes(period)||!['Contanti','Bonifico','Carta'].includes(method))throw Error('Controlla categoria, periodo, note e metodo di pagamento')
  const {data:movement,error:movementReadError}=await db.from('registro_spese').select('*').eq('id',row.movimento_id).maybeSingle()
  if(movementReadError||!movement)throw Error('Movimento collegato non trovato in Cassa')
  const {data:updatedMovement,error:movementError}=await db.from('registro_spese').update({data:date,importo:amount,voce_spesa:category,momento_anno:period,note,metodo:method}).eq('id',row.movimento_id).select('id').maybeSingle()
  if(movementError||!updatedMovement)throw Error('Movimento di Cassa non aggiornato: '+(movementError?.message||'nessuna riga modificata'))
  const {data:updatedRequest,error:requestError}=await db.from('rimborsi').update({data_spesa:date,importo:amount,categoria:category,momento_anno:period,note,metodo_rimborso:method}).eq('id',id).eq('stato','RIMBORSATO').eq('movimento_id',row.movimento_id).select('id').maybeSingle()
  if(requestError||!updatedRequest){
   await db.from('registro_spese').update({data:movement.data,importo:movement.importo,voce_spesa:movement.voce_spesa,momento_anno:movement.momento_anno,note:movement.note,metodo:movement.metodo}).eq('id',row.movimento_id)
   throw Error('Richiesta di rimborso non aggiornata: '+(requestError?.message||'nessuna riga modificata'))
  }
  return reply({ok:true,movementId:row.movimento_id})
 }
 if(input.action==='cancel'){
  if(!manager&&row.created_by!==user.id)throw new AuthorizationError('Puoi annullare soltanto le richieste che hai inserito',403)
  const {data,error}=await db.from('rimborsi').update({stato:'ANNULLATO',cancelled_by:user.id,cancelled_at:new Date().toISOString()}).eq('id',id).eq('stato','DA_RIMBORSARE').select('id');if(error||!data?.length)throw Error('Richiesta già confermata o annullata: ricarica l’elenco')
  return reply({ok:true})
 }
 throw Error('Operazione non valida')
}catch(e){return failure(e)}}
