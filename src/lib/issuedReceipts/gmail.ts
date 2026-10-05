import 'server-only'
import { createCipheriv,createDecipheriv,randomBytes } from 'node:crypto'
import { google } from 'googleapis'
import { createAdminClient } from '@/lib/supabase/admin'
export const SENDER='repartoeirenebrownsea.prato6@gmail.com'
export function gmailOAuth(origin:string){if(!process.env.GMAIL_CLIENT_ID||!process.env.GMAIL_CLIENT_SECRET)throw Error('Collegamento Gmail da configurare nelle impostazioni del progetto');return new google.auth.OAuth2(process.env.GMAIL_CLIENT_ID,process.env.GMAIL_CLIENT_SECRET,`${origin}/api/ricevute/gmail/callback`)}
function key(){const k=Buffer.from(process.env.GMAIL_TOKEN_ENCRYPTION_KEY||'','base64');if(k.length!==32)throw Error('Protezione collegamento Gmail da configurare');return k}
export function encryptToken(token:string){const iv=randomBytes(12);const c=createCipheriv('aes-256-gcm',key(),iv);return Buffer.concat([iv,c.update(token),c.final(),c.getAuthTag()]).toString('base64')}
export function decryptToken(value:string){const b=Buffer.from(value,'base64');const c=createDecipheriv('aes-256-gcm',key(),b.subarray(0,12));c.setAuthTag(b.subarray(-16));return Buffer.concat([c.update(b.subarray(12,-16)),c.final()]).toString()}
export async function gmailClient(origin:string){const {data,error}=await createAdminClient().from('gmail_connection').select('token,email').eq('id','sender').single();if(error||!data||data.email!==SENDER)throw Error('Collega prima la casella Gmail del reparto');const oauth=gmailOAuth(origin);oauth.setCredentials({refresh_token:decryptToken(data.token)});return google.gmail({version:'v1',auth:oauth})}
export function mailMime(to:string,subject:string,body:string,pdf:Uint8Array,filename:string){if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)||/[\r\n]/.test(to))throw Error('Email destinatario non valida');const boundary=`scoutmaster-${randomBytes(18).toString('hex')}`
 return Buffer.from([`From: ${SENDER}`,`To: ${to}`,`Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,`MIME-Version: 1.0`,`Content-Type: multipart/mixed; boundary="${boundary}"`,'',`--${boundary}`,'Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',Buffer.from(body).toString('base64'),`--${boundary}`,'Content-Type: application/pdf',`Content-Disposition: attachment; filename="${filename}"`,'Content-Transfer-Encoding: base64','',Buffer.from(pdf).toString('base64').match(/.{1,76}/g)!.join('\r\n'),`--${boundary}--`,''].join('\r\n')).toString('base64url')
}
