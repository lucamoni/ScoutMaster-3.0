import { prepare } from '@/lib/issuedReceipts/prepare'
import { receiptPdf } from '@/lib/issuedReceipts/pdf'
import { failure } from '@/lib/issuedReceipts/server'
export async function POST(request:Request){try{const {snapshot}=await prepare(request);return new Response(receiptPdf(snapshot,null) as BodyInit,{headers:{'Content-Type':'application/pdf','Cache-Control':'no-store'}})}catch(e){return failure(e)}}
