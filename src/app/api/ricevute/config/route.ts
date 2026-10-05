import { requireReceiptIssuer,requireAuthenticatedUser } from '@/lib/security/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { config,reply,failure,sameOrigin } from '@/lib/issuedReceipts/server'
export async function GET(){try{await requireAuthenticatedUser();const db=createAdminClient();const [{data},issuer]=await Promise.all([db.from('gmail_connection').select('email').eq('id','sender').maybeSingle(),config()]);return reply({config:issuer,gmailConnected:!!data,gmailReady:!!(process.env.GMAIL_CLIENT_ID&&process.env.GMAIL_CLIENT_SECRET&&process.env.GMAIL_TOKEN_ENCRYPTION_KEY),sender:'repartoeirenebrownsea.prato6@gmail.com'})}catch(e){return failure(e)}}
export async function POST(request:Request){try{
 await requireReceiptIssuer();sameOrigin(request)
 const body=await request.json();const treasurer=String(body.treasurer||'').trim();const signature=String(body.signature||'')
 if(!treasurer||treasurer.length>100||signature.length>700000||!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(signature))throw Error('Inserisci nome e firma PNG/JPEG (massimo 500 KB)')
 // Validate actual raster data before storing it, not just the supplied MIME label.
 const {jsPDF}=await import('jspdf');new jsPDF().getImageProperties(signature)
 const {error}=await createAdminClient().from('ricevute_config').upsert({id:'issuer',valore:{treasurer,signature}});if(error)throw Error('Firma non salvata');return reply({ok:true})
}catch(e){return failure(e)}}
