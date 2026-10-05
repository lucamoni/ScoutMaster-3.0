import { beforeEach,describe,expect,it,vi } from 'vitest'
const state=vi.hoisted(()=>({allowed:true,calls:[] as unknown[]}))
vi.mock('@/lib/security/auth',()=>({requireAuthenticatedUser:async()=>{if(!state.allowed)throw Error('denied')},authorizationErrorResponse:(e:unknown)=>e instanceof Error&&e.message==='denied'?Response.json({error:'Autenticazione richiesta'},{status:401}):null}))
vi.mock('@/lib/annualRoster/server',()=>({
  resolveAnnualYear:async(value:unknown)=>{state.calls.push(['year',value]);return value||'2026-2027'},
  getAnnualBoys:async(year:string,archived:boolean)=>{state.calls.push(['read',year,archived]);return []},
  writeAnnualBoy:async(year:string,id:unknown,changes:unknown,census:unknown)=>{state.calls.push(['write',year,id,changes,census]);return{id:id||'new',nome:'Mario'}},
}))
import { GET,PATCH,POST } from './route'
const request=(body:unknown,headers:Record<string,string>={})=>new Request('https://example.com/api/anagrafica',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)})
beforeEach(()=>{state.allowed=true;state.calls=[]})
describe('API anagrafica annuale',()=>{
  it('richiede autenticazione prima di qualsiasi lettura o preparazione anno',async()=>{
    state.allowed=false
    expect((await GET(new Request('https://example.com/api/anagrafica'))).status).toBe(401)
    expect((await POST(request({changes:{nome:'Mario'}}))).status).toBe(401)
    expect(state.calls).toEqual([])
  })
  it('non permette scritture da origine esterna',async()=>{
    expect((await PATCH(request({id:'x',changes:{attivo:false}},{Origin:'https://other.example'}))).status).toBe(403)
    expect(state.calls).toEqual([])
  })
  it('legge l’anno esplicito e consente modificare un anno storico da archivio',async()=>{
    await GET(new Request('https://example.com/api/anagrafica?year=2025-2026&includeArchived=false'))
    const response=await PATCH(request({year:'2025-2026',id:'old',changes:{quota_censimento:false}}))
    expect(response.status).toBe(200)
    expect(state.calls).toContainEqual(['read','2025-2026',false])
    expect(state.calls).toContainEqual(['write','2025-2026','old',{quota_censimento:false},undefined])
  })
})
