import {requireAuthenticatedUser} from '@/lib/security/auth'
import {createAdminClient} from '@/lib/supabase/admin'
import {failure,reply,sameOrigin} from '@/lib/issuedReceipts/server'
import {canValidateReimbursement,validId,validDate,todayInItaly} from '@/lib/reimbursements/model'
import {freshUser,staffOptions} from '@/lib/reimbursements/server'
import {cents} from '@/lib/staffAdvances/model'
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){try{
 const user=await freshUser(await requireAuthenticatedUser());sameOrigin(request)
 if(!canValidateReimbursement(user,process.env.ADMIN_EMAILS||''))return reply({error:'Solo admin e tesoriere possono confermare le restituzioni'},403)
 const quota=validId((await params).id),body=await request.json(),id=validId(body.id),amount=cents(body.amount),date=validDate(body.date),method=String(body.method||'')
 if(body.confirmed!==true)throw Error('Conferma che il denaro sia stato effettivamente restituito')
 if(date>todayInItaly()||!['Contanti','Carta','Bonifico'].includes(method))throw Error('Data o metodo non validi')
 const actor=(await staffOptions()).find(u=>u.id===user.id);if(!actor)throw Error('Account non abilitato')
 const {data,error}=await createAdminClient().rpc('record_staff_return',{p_id:id,p_quota:quota,p_actor:user.id,p_actor_name:actor.name,p_amount:amount/100,p_date:date,p_method:method})
 if(error)throw Error('Restituzione non confermata: verifica importo residuo, data e anno aperto. Ricarica l’elenco prima di riprovare.')
 return reply({ok:true,id:data})
}catch(e){return failure(e)}}
