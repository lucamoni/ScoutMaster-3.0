import {createHash} from 'node:crypto'
import {requireAuthenticatedUser} from '@/lib/security/auth'
import {createAdminClient} from '@/lib/supabase/admin'
import {failure,reply,sameOrigin} from '@/lib/issuedReceipts/server'
import {validateReceiptFile} from '@/lib/receipts'
import {canValidateReimbursement} from '@/lib/reimbursements/model'
import {freshUser,staffOptions} from '@/lib/reimbursements/server'
import {parseStaffExpense} from '@/lib/staffAdvances/model'
import {listStaffShares} from '@/lib/staffAdvances/server'
export const dynamic='force-dynamic'
export async function GET(){try{const user=await freshUser(await requireAuthenticatedUser());return reply({shares:await listStaffShares(user),users:await staffOptions(),canManage:canValidateReimbursement(user,process.env.ADMIN_EMAILS||'')})}catch(e){return failure(e)}}
export async function POST(request:Request){try{
 const user=await freshUser(await requireAuthenticatedUser());sameOrigin(request)
 if(!canValidateReimbursement(user,process.env.ADMIN_EMAILS||''))return reply({error:'Solo admin e tesoriere possono registrare anticipi della cassa'},403)
 if(Number(request.headers.get('content-length')||0)>4000000)throw Error('Allegato troppo grande: massimo 3 MB')
 const form=await request.formData(),payload=JSON.parse(String(form.get('payload')||'{}'));if(payload.confirmed!==true)throw Error('Conferma che la cassa abbia già pagato questa spesa')
 const data=parseStaffExpense(payload),options=await staffOptions(),creator=options.find(u=>u.id===user.id)
 if(!creator)throw Error('Account non abilitato')
 const shares=data.shares.map(s=>{const staff=options.find(u=>u.id===s.id);if(!staff)throw Error('Scegli utenti attivi per le quote');return{id:staff.id,name:staff.name,quota:s.quota/100}})
 const file=form.get('file');let bytes:Uint8Array|null=null,contentType='',filename:string|null=null,path:string|null=null
 if(file instanceof File&&file.size){contentType=validateReceiptFile(file);if(file.size>3145728)throw Error('File troppo grande: massimo 3 MB');bytes=new Uint8Array(await file.arrayBuffer());filename=file.name.slice(0,160);path=`${user.id}/${data.id}/${filename.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g,'_')}`}
 const fingerprint=createHash('sha256').update(JSON.stringify(data)).update(filename||'').update(bytes||'').digest('hex'),db=createAdminClient()
 const checkExisting=()=>db.from('anticipi_capi').select('created_by,fingerprint').eq('id',data.id).maybeSingle()
 const existing=await checkExisting();if(existing.error)throw Error('Impossibile verificare la spesa')
 if(existing.data){if(existing.data.created_by===user.id&&existing.data.fingerprint===fingerprint)return reply({ok:true,id:data.id});throw Error('Spesa già salvata con dati diversi')}
 if(bytes&&path){const upload=await db.storage.from('anticipi-capi').upload(path,bytes,{contentType,upsert:false});if(upload.error)throw Error('Allegato non salvato. Ricarica l’elenco prima di riprovare.')}
 const result=await db.rpc('create_staff_advance',{p_actor:user.id,p_actor_name:creator.name,p_expense:{id:data.id,anno:data.year,data:data.date,descrizione:data.description,importo:data.amount/100,metodo:data.method,file_path:path,file_name:filename,fingerprint},p_shares:shares})
 if(result.error){const check=await checkExisting();if(check.data?.created_by===user.id&&check.data.fingerprint===fingerprint)return reply({ok:true,id:data.id});if(path&&!check.error&&!check.data)await db.storage.from('anticipi-capi').remove([path]);throw Error('Spesa non confermata: controlla che l’anno sia aperto e ricarica l’elenco prima di riprovare')}
 return reply({ok:true,id:data.id},201)
}catch(e){return failure(e)}}
