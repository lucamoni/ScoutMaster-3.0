import { requireAuthenticatedUser } from '@/lib/security/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getReceipt,failure,reply,sameOrigin } from '@/lib/issuedReceipts/server'
import { gmailClient,mailMime } from '@/lib/issuedReceipts/gmail'
import { receiptRecipient } from '@/lib/issuedReceipts/model'
import { getAnnualBoy } from '@/lib/annualRoster/server'
import { receiptPdf } from '@/lib/issuedReceipts/pdf'
export const maxDuration=60
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{
 await requireAuthenticatedUser();sameOrigin(request);const {confirm,expectedEmail}=await request.json();if(confirm!==true)throw Error('Conferma destinatario e ricevuta prima dell’invio')
 const r=await getReceipt((await params).id);const boy=await getAnnualBoy(r.anno,r.snapshot.boy.id);const recipient=receiptRecipient(r.snapshot,boy||undefined).email;if(expectedEmail!==recipient)throw Error('Il contatto è cambiato: aggiorna e conferma nuovamente il destinatario');if(!recipient)throw Error('Email del genitore assente nella ricevuta: usa WhatsApp o scarica il PDF')
 const gmail=await gmailClient(new URL(request.url).origin);const db=createAdminClient()
 // A durable claim prevents double sends. Timeouts are uncertain, never retried
 // automatically: the parent may already have received the message.
 const {error:claimError}=await db.from('ricevute_invio').insert({ricevuta_id:r.id,stato:'sending',email:recipient})
 if(claimError){const {data}=await db.from('ricevute_invio').select('stato').eq('ricevuta_id',r.id).single();if(data?.stato!=='failed')throw Error('Invio già eseguito, in corso o da verificare in Gmail');const {data:claimed,error}=await db.from('ricevute_invio').update({stato:'sending',updated_at:new Date().toISOString()}).eq('ricevuta_id',r.id).eq('stato','failed').select('ricevuta_id');if(error||!claimed?.length)throw Error('Invio già in corso')}
 try{const raw=mailMime(recipient,`Ricevuta ${r.numero}/${r.anno} - ${r.snapshot.boy.name}`,`Ciao ${r.snapshot.payer.name},\nin allegato la ricevuta dei pagamenti per ${r.snapshot.boy.name}, anno ${r.anno}.\n\nGruppo Scout Prato 6\n${r.snapshot.treasurer}`,receiptPdf(r.snapshot,r.numero),`ricevuta-${r.numero}-${r.anno}.pdf`)
  const result=await gmail.users.messages.send({userId:'me',requestBody:{raw}},{timeout:20000,retry:false})
  const {error}=await db.from('ricevute_invio').update({stato:'sent',message_id:result.data.id||null,updated_at:new Date().toISOString()}).eq('ricevuta_id',r.id)
  if(error)throw Error('Invio effettuato, ma stato archivio da verificare')
  return reply({ok:true})
 }catch(e){const status=(e as {response?:{status?:number}})?.response?.status;await db.from('ricevute_invio').update({stato:status&&status>=400&&status<500?'failed':'uncertain',updated_at:new Date().toISOString()}).eq('ricevuta_id',r.id);throw Error(status&&status>=400&&status<500?'Gmail ha rifiutato l’invio. Verifica il collegamento e riprova.':'Esito invio incerto: controlla Posta inviata in Gmail prima di ripetere.')}
}catch(e){return failure(e)}}
