import {beforeEach,expect,it,vi} from 'vitest'
const state=vi.hoisted(()=>({user:{id:'00000000-0000-0000-0000-000000000001',user_metadata:{name:'Mario'}},rows:new Map<string,Record<string,unknown>>(),tables:[] as string[],inserts:[] as Record<string,unknown>[]}))
vi.mock('@/lib/security/auth',()=>({requireAuthenticatedUser:async()=>state.user}))
vi.mock('@/lib/reimbursements/server',()=>({freshUser:async()=>state.user,staffOptions:async()=>[{id:state.user.id,name:'Mario'},{id:'00000000-0000-0000-0000-000000000003',name:'Anna'}],listRequests:async()=>[]}))
vi.mock('@/lib/issuedReceipts/server',()=>({sameOrigin:()=>{},reply:(data:unknown,status=200)=>Response.json(data,{status}),failure:(e:Error)=>Response.json({error:e.message},{status:400})}))
vi.mock('@/lib/receipts',()=>({validateReceiptFile:()=> 'image/jpeg'}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:(table:string)=>{state.tables.push(table);return{select:()=>({eq:(_field:string,id:string)=>({maybeSingle:async()=>({data:state.rows.get(id)||null,error:null})})}),insert:async(row:Record<string,unknown>)=>{state.inserts.push(row);state.rows.set(String(row.id),{...row,stato:'DA_RIMBORSARE'});return{error:null}}}},storage:{from:()=>({upload:async()=>({error:null}),remove:async()=>({error:null})})}})}))
import {POST} from './route'
const request=(extra:Record<string,string>={})=>{const data=new FormData();for(const [k,v]of Object.entries({id:'00000000-0000-0000-0000-000000000002',beneficiary:state.user.id,year:'2025-2026',date:'2026-09-30',amount:'12.34',category:'Materiale',period:'ANNO',note:'Anticipata',...extra}))data.set(k,v);return new Request('https://example.com/api/rimborsi',{method:'POST',body:data})}
beforeEach(()=>{state.rows.clear();state.tables=[];state.inserts=[]})
it('una spesa anticipata rimane fuori dal registro spese anche con stato forgiato nel payload',async()=>{
 expect((await POST(request({stato:'RIMBORSATO',created_by:'forged'}))).status).toBe(201)
 expect(state.tables.every(t=>t==='rimborsi')).toBe(true);expect(state.inserts[0]).toMatchObject({created_by:state.user.id,importo:12.34,anno_scout:'2025-2026'});expect(state.inserts[0]).not.toHaveProperty('stato');expect(state.inserts[0]).not.toHaveProperty('movimento_id')
})
it('un retry della stessa richiesta non duplica anticipi o uscite',async()=>{
 await POST(request());expect((await POST(request())).status).toBe(200);expect(state.inserts).toHaveLength(1)
 expect((await POST(request({amount:'20'}))).status).toBe(400);expect(state.inserts).toHaveLength(1)
})
it('non accetta beneficiari che non sono utenti attivi',async()=>{
 expect((await POST(request({beneficiary:'00000000-0000-0000-0000-000000000099'}))).status).toBe(400);expect(state.inserts).toEqual([])
})
