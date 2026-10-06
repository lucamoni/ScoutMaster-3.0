import {beforeEach,expect,it,vi} from 'vitest'
const state=vi.hoisted(()=>({quotas:[] as Record<string,unknown>[],expenses:[] as Record<string,unknown>[],returns:[] as Record<string,unknown>[],fail:false}))
vi.mock('server-only',()=>({}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:(table:string)=>{
 const filters:Array<(r:Record<string,unknown>)=>boolean>=[],rows=()=>table==='quote_anticipi_capi'?state.quotas:table==='anticipi_capi'?state.expenses:state.returns
 const read=()=>({data:rows().filter(r=>filters.every(fn=>fn(r))),error:state.fail?'error':null})
 const query={select:()=>query,order:()=>query,eq:(k:string,v:unknown)=>{filters.push(r=>r[k]===v);return query},in:(k:string,v:unknown[])=>{filters.push(r=>v.includes(r[k]));return query},range:async(f:number,t:number)=>({...read(),data:read().data.slice(f,t+1)}),maybeSingle:async()=>({...read(),data:read().data[0]||null}),then:(resolve:(value:unknown)=>unknown)=>Promise.resolve(read()).then(resolve)};return query
}})}))
import {listStaffShares,staffExpenseFile} from './server'
import type {User} from '@supabase/supabase-js'
const user=(role='capo_unita',treasurer=false)=>({id:'one',app_metadata:{role,treasurer}} as unknown as User)
beforeEach(()=>{state.fail=false;state.expenses=[{id:'a',data_spesa:'2025-10-01',file_path:'private',file_name:'foto.jpg'},{id:'b',data_spesa:'2026-10-01',file_path:'private',file_name:'foto.jpg'}];state.quotas=[{id:'q1',anticipo_id:'a',staff_id:'one',staff_name:'One',quota:0.3},{id:'q2',anticipo_id:'b',staff_id:'two',staff_name:'Two',quota:20}];state.returns=[{id:'r1',quota_id:'q1',importo:0.1},{id:'r2',quota_id:'q1',importo:0.2},{id:'r3',quota_id:'q2',importo:5}]})
it('utente normale vede solo quote proprie, incluse saldate e anni precedenti',async()=>{const rows=await listStaffShares(user());expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({staff_id:'one',residuo:0,restituito:0.3});expect(rows[0].returns).toHaveLength(2)})
it('admin e qualifica tesoriere su aiuto capo vedono ogni quota',async()=>{for(const account of [user('admin'),user('aiuto_capo_unita',true)])expect(await listStaffShares(account)).toHaveLength(2)})
it('nega anche il download di un allegato assegnato ad altri e segnala letture fallite',async()=>{await expect(staffExpenseFile('b',user())).rejects.toThrow();expect(await staffExpenseFile('a',user())).toMatchObject({id:'a'});state.fail=true;await expect(listStaffShares(user())).rejects.toThrow()})
