import {beforeEach,expect,it,vi} from 'vitest'
const state=vi.hoisted(()=>({role:'admin',calls:[] as {name:string;args:Record<string,unknown>}[],rows:new Map<string,Record<string,unknown>>()}))
const actor='00000000-0000-0000-0000-000000000001',id='00000000-0000-0000-0000-000000000002'
vi.mock('@/lib/security/auth',()=>({requireAuthenticatedUser:async()=>({id:actor})}))
vi.mock('@/lib/reimbursements/server',()=>({freshUser:async()=>({id:actor,app_metadata:{role:state.role}}),staffOptions:async()=>[{id:actor,name:'Mario'}]}))
vi.mock('@/lib/staffAdvances/server',()=>({listStaffShares:async()=>[]}))
vi.mock('@/lib/issuedReceipts/server',()=>({sameOrigin:()=>{},reply:(data:unknown,status=200)=>Response.json(data,{status}),failure:(e:Error)=>Response.json({error:e.message},{status:400})}))
vi.mock('@/lib/receipts',()=>({validateReceiptFile:()=> 'image/jpeg'}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:()=>({select:()=>({eq:(_k:string,key:string)=>({maybeSingle:async()=>({data:state.rows.get(key)||null,error:null})})})}),rpc:async(name:string,args:Record<string,unknown>)=>{state.calls.push({name,args});const payload=args.p_expense as Record<string,unknown>;state.rows.set(String(payload.id),{created_by:args.p_actor,fingerprint:payload.fingerprint});return{data:payload.id,error:null}},storage:{from:()=>({upload:async()=>({error:null}),remove:async()=>({error:null})})}})}))
import {POST} from './route'
const request=(changes:Record<string,unknown>={})=>{const form=new FormData();form.set('payload',JSON.stringify({id,year:'2025-2026',date:'2026-09-30',amount:'12.34',description:'Cena capi',method:'Contanti',shares:[{id:actor,quota:12.34}],confirmed:true,...changes}));return new Request('https://example.com/api/anticipi-capi',{method:'POST',body:form})}
beforeEach(()=>{state.role='admin';state.calls=[];state.rows.clear()})
it('nega scrittura ai capi senza qualifica anche con payload forgiato',async()=>{state.role='capo_unita';expect((await POST(request({p_actor:actor,canManage:true}))).status).toBe(403);expect(state.calls).toEqual([])})
it('usa identità e nomi server e converte centesimi senza inserimento normale',async()=>{expect((await POST(request({created_by:'forged',staff_name:'forged'}))).status).toBe(201);expect(state.calls[0]).toMatchObject({name:'create_staff_advance',args:{p_actor:actor,p_actor_name:'Mario',p_expense:{importo:12.34},p_shares:[{id:actor,name:'Mario',quota:12.34}]}})})
it('retry idempotente e rifiuto di cambi importo sullo stesso UUID',async()=>{await POST(request());expect((await POST(request())).status).toBe(200);expect((await POST(request({amount:15,shares:[{id:actor,quota:15}]}))).status).toBe(400);expect(state.calls).toHaveLength(1)})
it('richiede conferma reale, quote esatte e utenti attivi',async()=>{for(const change of [{confirmed:false},{shares:[{id:actor,quota:12}]},{shares:[{id:'00000000-0000-0000-0000-000000000099',quota:12.34}]}])expect((await POST(request(change))).status).toBe(400);expect(state.calls).toEqual([])})
