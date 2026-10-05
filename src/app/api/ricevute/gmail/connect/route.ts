import { cookies } from 'next/headers'
import { randomBytes } from 'node:crypto'
import { requireRole } from '@/lib/security/auth'
import { gmailOAuth,SENDER } from '@/lib/issuedReceipts/gmail'
import { failure } from '@/lib/issuedReceipts/server'
export async function GET(request:Request){try{const {user}=await requireRole(['admin']);if(!process.env.GMAIL_TOKEN_ENCRYPTION_KEY)throw Error('Collegamento Gmail da configurare');const state=randomBytes(32).toString('hex');const jar=await cookies();jar.set('scoutmaster-gmail-state',`${state}:${user.id}`,{httpOnly:true,secure:new URL(request.url).protocol==='https:',sameSite:'lax',path:'/api/ricevute/gmail',maxAge:600});const url=gmailOAuth(new URL(request.url).origin).generateAuthUrl({access_type:'offline',prompt:'consent',scope:['openid','email','https://www.googleapis.com/auth/gmail.send'],state,login_hint:SENDER});return Response.redirect(url)}catch(e){return failure(e)}}
