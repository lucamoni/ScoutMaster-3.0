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
 if(input.action==='cancel'){
  if(!manager&&row.created_by!==user.id)throw new AuthorizationError('Puoi annullare soltanto le richieste che hai inserito',403)
  const {data,error}=await db.from('rimborsi').update({stato:'ANNULLATO',cancelled_by:user.id,cancelled_at:new Date().toISOString()}).eq('id',id).eq('stato','DA_RIMBORSARE').select('id');if(error||!data?.length)throw Error('Richiesta già confermata o annullata: ricarica l’elenco')
  return reply({ok:true})
 }
 throw Error('Operazione non valida')
}catch(e){return failure(e)}}
