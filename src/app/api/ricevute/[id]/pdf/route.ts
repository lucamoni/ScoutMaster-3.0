import { requireAuthenticatedUser } from '@/lib/security/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getReceipt,failure } from '@/lib/issuedReceipts/server'
import { receiptPdf } from '@/lib/issuedReceipts/pdf'
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){try{await requireAuthenticatedUser();const r=await getReceipt((await params).id);let bytes:Uint8Array|undefined
 if(r.pdf_path){const {data}=await createAdminClient().storage.from('ricevute-pagamenti').download(r.pdf_path);if(data)bytes=new Uint8Array(await data.arrayBuffer())}
 bytes ||= receiptPdf(r.snapshot,r.numero)
 return new Response(bytes as BodyInit,{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="ricevuta-${r.numero}-${r.anno}.pdf"`,'Cache-Control':'no-store'}})
}catch(e){return failure(e)}}
