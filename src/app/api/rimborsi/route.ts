import {createHash} from 'node:crypto'
import {requireAuthenticatedUser} from '@/lib/security/auth'
import {createAdminClient} from '@/lib/supabase/admin'
import {failure,reply,sameOrigin} from '@/lib/issuedReceipts/server'
import {validateReceiptFile} from '@/lib/receipts'
import {parseRequest,canValidateReimbursement} from '@/lib/reimbursements/model'
import {freshUser,staffOptions,listRequests} from '@/lib/reimbursements/server'
export const dynamic='force-dynamic'
export async function GET(){try{const user=await freshUser(await requireAuthenticatedUser());return reply({requests:await listRequests(user),users:await staffOptions(),canValidate:canValidateReimbursement(user,process.env.ADMIN_EMAILS||'')})}catch(e){return failure(e)}}
export async function POST(request:Request){try{
 const user=await freshUser(await requireAuthenticatedUser());sameOrigin(request)
 if(Number(request.headers.get('content-length')||0)>4000000)throw Error('Allegato troppo grande: massimo 3 MB')
 const form=await request.formData(),data=parseRequest(Object.fromEntries(form));const options=await staffOptions(),beneficiary=options.find(u=>u.id===data.beneficiary);if(!beneficiary)throw Error('Scegli un utente attivo per il rimborso')
 const creator=options.find(u=>u.id===user.id);if(!creator)throw Error('Account non abilitato')
 const file=form.get('file');let bytes:Uint8Array|null=null,contentType='',filename:string|null=null,path:string|null=null
 if(file instanceof File&&file.size){contentType=validateReceiptFile(file);if(file.size>3145728)throw Error('File troppo grande: massimo 3 MB');bytes=new Uint8Array(await file.arrayBuffer());filename=file.name.slice(0,160);const safe=filename.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g,'_');path=`${user.id}/${data.id}/${safe}`}
 const fingerprint=createHash('sha256').update(JSON.stringify(data)).update(filename||'').update(bytes||'').digest('hex'),db=createAdminClient()
 const {data:existing,error:readError}=await db.from('rimborsi').select('created_by,fingerprint').eq('id',data.id).maybeSingle();if(readError)throw Error('Impossibile verificare la richiesta')
 if(existing){if(existing.created_by===user.id&&existing.fingerprint===fingerprint)return reply({ok:true,id:data.id});throw Error('Richiesta già salvata: ricarica la pagina per inserirne una nuova')}
 if(bytes&&path){const {error}=await db.storage.from('rimborsi').upload(path,bytes,{contentType,upsert:false});if(error)throw Error('Allegato non salvato. Riprova senza chiudere la finestra.')}
 const {error}=await db.from('rimborsi').insert({id:data.id,created_by:user.id,created_by_name:creator.name,beneficiary_id:beneficiary.id,beneficiary_name:beneficiary.name,anno_scout:data.year,data_spesa:data.date,importo:data.amount,categoria:data.category,momento_anno:data.period,note:data.note,file_path:path,file_name:filename,fingerprint})
 if(error){const check=await db.from('rimborsi').select('created_by,fingerprint').eq('id',data.id).maybeSingle();if(check.data?.created_by===user.id&&check.data.fingerprint===fingerprint)return reply({ok:true,id:data.id});if(path&&!check.error&&!check.data)await db.storage.from('rimborsi').remove([path]);throw Error('Richiesta non confermata: ricarica l’elenco prima di riprovare')}
 return reply({ok:true,id:data.id},201)
}catch(e){return failure(e)}}
