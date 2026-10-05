import {beforeEach,expect,it,vi} from 'vitest'
const state=vi.hoisted(()=>({calls:[] as unknown[],error:null as null|{code:string,message:string}}))
vi.mock('@/lib/security/auth',()=>({requireRole:async()=>{},authorizationErrorResponse:()=>null}))
vi.mock('@/lib/annualRoster/server',()=>({resolveAnnualYear:async(year:string)=>year||'2026-2027'}))
vi.mock('@/lib/issuedReceipts/server',()=>({sameOrigin:(r:Request)=>{if(r.headers.get('origin')&&r.headers.get('origin')!==new URL(r.url).origin)throw Error('Richiesta non consentita')}}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({rpc:async(name:string,args:unknown)=>{state.calls.push([name,args]);return{error:state.error}}})}))
import {POST} from './route'
const req=(body:unknown)=>new Request('https://example.com/api/admin/reset-data',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
beforeEach(()=>{state.calls=[];state.error=null})
it('reset storico usa una sola transazione e non cancella identità globali',async()=>{
 expect((await POST(req({target:'all',confirmation:'RESET all',year:'2025-2026'}))).status).toBe(200)
 expect(state.calls).toEqual([['reset_year_data',{p_year:'2025-2026',p_target:'all'}]])
})
it('non avvia il reset senza la conferma corrispondente',async()=>{
 expect((await POST(req({target:'ragazzi',confirmation:'RESET all'}))).status).toBe(400)
 expect(state.calls).toEqual([])
})
it('un pagamento protetto rifiuta tutto il reset senza operazioni successive',async()=>{
 state.error={code:'P0001',message:'Esistono ricevute emesse'}
 const response=await POST(req({target:'all',confirmation:'RESET all'}))
 expect(response.status).toBe(409);expect(await response.json()).toEqual({error:'Esistono ricevute emesse'});expect(state.calls).toHaveLength(1)
})
