import { cookies } from 'next/headers'
import { requireRole } from '@/lib/security/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { gmailOAuth,SENDER,encryptToken } from '@/lib/issuedReceipts/gmail'
export async function GET(request:Request){const url=new URL(request.url);try{
 const {user}=await requireRole(['admin']);const jar=await cookies();const expected=jar.get('scoutmaster-gmail-state')?.value;jar.delete('scoutmaster-gmail-state')
 if(!url.searchParams.get('state')||expected!==`${url.searchParams.get('state')}:${user.id}`||!url.searchParams.get('code'))throw Error()
 const oauth=gmailOAuth(url.origin);const {tokens}=await oauth.getToken(url.searchParams.get('code')!);if(!tokens.id_token||!tokens.refresh_token)throw Error()
 const ticket=await oauth.verifyIdToken({idToken:tokens.id_token,audience:process.env.GMAIL_CLIENT_ID});const payload=ticket.getPayload();if(payload?.email!==SENDER||!payload.email_verified)throw Error()
 const {error}=await createAdminClient().from('gmail_connection').upsert({id:'sender',email:SENDER,token:encryptToken(tokens.refresh_token)});if(error)throw Error()
 return Response.redirect(`${url.origin}/ricevute?gmail=connected`)
}catch{return Response.redirect(`${url.origin}/ricevute?gmail=error`)}}
