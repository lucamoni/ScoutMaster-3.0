import { getAnnualBoys } from '@/lib/annualRoster/server'
import { getWorkingYear } from '@/lib/workingYear'
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { authorizationErrorResponse } from '@/lib/security/auth'
import type { ReceiptConfig, IssuedReceipt } from './model'
export const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}})
export const failure=(e:unknown)=>authorizationErrorResponse(e)||reply({error:e instanceof Error?e.message:'Operazione non riuscita'},400)
export function sameOrigin(request:Request){if(request.headers.get('sec-fetch-site')==='cross-site'||(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin))throw Error('Richiesta non consentita')}
export async function allBoys(year?:string){return getAnnualBoys(year || await getWorkingYear(),true)}
export async function config(){const {data,error}=await createAdminClient().from('ricevute_config').select('valore').eq('id','issuer').maybeSingle();if(error)throw Error('Configurazione ricevute non disponibile');return (data?.valore || {treasurer:'',signature:''}) as ReceiptConfig}
export async function getReceipt(id:string){if(!/^[a-f0-9-]{36}$/i.test(id))throw Error('Ricevuta non valida');const {data,error}=await createAdminClient().from('ricevute_emesse').select('*').eq('id',id).single();if(error||!data)throw Error('Ricevuta non trovata');return data as unknown as IssuedReceipt}
