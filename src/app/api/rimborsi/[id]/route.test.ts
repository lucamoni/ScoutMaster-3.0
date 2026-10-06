import {beforeEach,expect,it,vi} from 'vitest'
const state=vi.hoisted(()=>({user:{id:'00000000-0000-0000-0000-000000000001',app_metadata:{role:'aiuto_capo_unita',treasurer:false},user_metadata:{name:'Mario'}},calls:[] as unknown[],error:null as null|{code:string,message:string}}))
vi.mock('@/lib/security/auth',()=>({requireAuthenticatedUser:async()=>state.user,AuthorizationError:class extends Error{status=403}}))
vi.mock('@/lib/reimbursements/server',()=>({freshUser:async()=>state.user,authorizedRequest:async()=>({created_by:state.user.id,stato:'DA_RIMBORSARE'})}))
vi.mock('@/lib/issuedReceipts/server',()=>({sameOrigin:(r:Request)=>{if(r.headers.get('origin')&&r.headers.get('origin')!==new URL(r.url).origin)throw Error('Origine non consentita')},reply:(data:unknown)=>Response.json(data),failure:(e:Error&{status?:number})=>Response.json({error:e.message},{status:e.status||400})}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({rpc:async(name:string,args:unknown)=>{state.calls.push([name,args]);return{data:'movement-id',error:state.error}}})}))
import {PATCH} from './route'
const request=(body:unknown,origin?:string)=>new Request('https://example.com/api/rimborsi/x',{method:'PATCH',headers:{'Content-Type':'application/json',...(origin?{origin}:{})},body:JSON.stringify(body)})
const params={params:Promise.resolve({id:'00000000-0000-0000-0000-000000000002'})}
beforeEach(()=>{state.user.app_metadata={role:'aiuto_capo_unita',treasurer:false};state.calls=[];state.error=null})
it('non consente ad un aiuto capo di validare anche se il payload si dichiara admin',async()=>{
 const r=await PATCH(request({action:'confirm',confirm:true,role:'admin',treasurer:true,date:'2026-10-06',method:'Contanti'}),params);expect(r.status).toBe(403);expect(state.calls).toEqual([])
})
it('il tesoriere usa una sola chiamata atomica e ignora importo/beneficiario/validatore inviati dal browser',async()=>{
 state.user.app_metadata.treasurer=true;expect((await PATCH(request({action:'confirm',confirm:true,date:'2026-10-06',method:'Bonifico',importo:999,actor:'forged'}),params)).status).toBe(200)
 expect(state.calls).toEqual([['confirm_reimbursement',{p_id:'00000000-0000-0000-0000-000000000002',p_actor:state.user.id,p_actor_name:'Mario',p_date:'2026-10-06',p_method:'Bonifico'}]])
})
it('rifiuta origine esterna e conferma mancante prima della scrittura',async()=>{
 state.user.app_metadata.treasurer=true;expect((await PATCH(request({action:'confirm',confirm:true},'https://evil.example'),params)).status).toBe(400);expect((await PATCH(request({action:'confirm'}),params)).status).toBe(400);expect(state.calls).toEqual([])
})
it('mantiene l’errore del rimborso già confermato senza altre scritture',async()=>{
 state.user.app_metadata.treasurer=true;state.error={code:'P0001',message:'Rimborso già confermato con data o metodo diversi'};const response=await PATCH(request({action:'confirm',confirm:true,date:'2026-10-06',method:'Contanti'}),params);expect(response.status).toBe(400);expect((await response.json()).error).toMatch(/già confermato/);expect(state.calls).toHaveLength(1)
})
