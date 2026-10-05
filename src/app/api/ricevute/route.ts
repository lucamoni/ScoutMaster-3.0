import { requireAuthenticatedUser } from '@/lib/security/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getWorkingYear } from '@/lib/workingYear'
import { allBoys,reply,failure } from '@/lib/issuedReceipts/server'
import { receiptRecipient,type ReceiptSnapshot,type IssuedReceipt,type Movement } from '@/lib/issuedReceipts/model'
import { validWorkingYear } from '@/lib/utils/workingYear'
import { prepare } from '@/lib/issuedReceipts/prepare'
import { receiptPdf } from '@/lib/issuedReceipts/pdf'
import type { Json } from '@/types/database.types'
export const maxDuration=60
export async function GET(request:Request){try{
 await requireAuthenticatedUser();const year=validWorkingYear(new URL(request.url).searchParams.get('year')) || await getWorkingYear();const db=createAdminClient();const [start,end]=year.split('-')
 const boys=await allBoys(year);const movements:Movement[]=[];for(let from=0;;from+=500){const {data,error}=await db.from('registro_spese').select('*').gte('data',`${start}-10-01`).lte('data',`${end}-09-30`).order('id').range(from,from+499);if(error)throw Error('Movimenti non disponibili');movements.push(...data);if(data.length<500)break}
 const receipts=[];for(let from=0;;from+=500){const {data,error}=await db.from('ricevute_emesse').select('id,numero,anno,snapshot,created_at,pdf_path').eq('anno',year).order('numero',{ascending:false}).range(from,from+499);if(error)throw Error('Archivio non disponibile');receipts.push(...data);if(data.length<500)break}
 // Include receipt-linked movements even if their original ledger date was edited.
 const linked=[];for(let from=0;;from+=500){const {data,error}=await db.from('ricevute_movimenti').select('movimento_id').order('movimento_id').range(from,from+499);if(error)throw Error('Collegamenti non disponibili');linked.push(...data.map(x=>x.movimento_id));if(data.length<500)break}
 const {data:proofs,error:proofError}=await db.from('prove_bonifico').select('movimento_id,parent,payer,amount,date,confirmed,filename,ragazzo_id,movement_amount,movement_date');if(proofError)throw Error('Prove di bonifico non disponibili')
 const {data:deliveries,error}=await db.from('ricevute_invio').select('ricevuta_id,stato,email');if(error)throw Error('Stato invii non disponibile')
 return reply({year,boys,movements,receipts:receipts.map(r=>({...r,recipient:receiptRecipient(r.snapshot as unknown as ReceiptSnapshot,boys.find(b=>b.id===(r.snapshot as unknown as ReceiptSnapshot).boy.id)),snapshot:{...(r.snapshot as object),signature:undefined}})),issuedIds:linked,deliveries,proofs:proofs.map(p=>({...p,confirmed:p.confirmed&&movements.some(m=>m.id===p.movimento_id&&m.ragazzo_id===p.ragazzo_id&&m.importo===p.movement_amount&&m.data===p.movement_date&&['bonifico','banca','bonifici'].includes(m.metodo?.toLowerCase()||''))}))})
}catch(e){return failure(e)}}
export async function POST(request:Request){try{
 const {actor,db,input,snapshot}=await prepare(request)
 const {data,error}=await db.rpc('issue_payment_receipt',{p_ids:input.ids,p_snapshot:snapshot as unknown as Json,p_actor:actor.id})
 if(error)throw Error('Emissione annullata: un movimento è cambiato o è già stato certificato. Aggiorna e riprova.')
 const receipt=data as unknown as IssuedReceipt
 const path=`${receipt.id}.pdf`;let pdfStored=false
 try{const {error:uploadError}=await db.storage.from('ricevute-pagamenti').upload(path,receiptPdf(snapshot,receipt.numero),{contentType:'application/pdf',upsert:false});if(!uploadError){const {error:updateError}=await db.from('ricevute_emesse').update({pdf_path:path}).eq('id',receipt.id);pdfStored=!updateError}}catch{/* Snapshot remains archived; PDF can be regenerated without reissuing. */}
 return reply({receipt:{id:receipt.id,numero:receipt.numero,anno:receipt.anno},pdfStored},201)
}catch(e){return failure(e)}}
