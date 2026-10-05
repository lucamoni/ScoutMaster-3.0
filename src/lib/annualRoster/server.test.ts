import { beforeEach, describe, expect, it, vi } from 'vitest'
const state=vi.hoisted(()=>({rows:[] as Record<string,unknown>[],readError:false,prepareError:false,calls:[] as Array<{name:string;args:Record<string,unknown>}>}))
vi.mock('server-only',()=>({}))
vi.mock('@/lib/workingYear',()=>({getWorkingYear:async()=> '2026-2027'}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({
  rpc:async(name:string,args:Record<string,unknown>)=>{state.calls.push({name,args});return name==='ensure_roster_year'?{data:0,error:state.prepareError?{message:'no read'}:null}:{data:{id:args.p_id||'12345678-1234-1234-1234-123456789abc',nome:'Mario',cognome:'Rossi',attivo:true,...args.p_changes as object},error:null}},
  from:(table:string)=>{
    const filters:Array<(r:Record<string,unknown>)=>boolean>=[]
    const query={select:()=>query,order:()=>query,eq:(k:string,v:unknown)=>{filters.push(r=>r[k]===v);return query},
      range:async(from:number,to:number)=>({data:state.rows.filter(r=>filters.every(fn=>fn(r))).slice(from,to+1),error:state.readError?{message:'bad read'}:null}),
      maybeSingle:async()=>table==='impostazioni'?{data:{valore:'2026-2027'},error:null}:{data:state.rows.find(r=>filters.every(fn=>fn(r)))||null,error:null},
    };return query
  }
})}))
import { getAnnualBoys,getAllAnnualBoys,validateAnnualChanges,writeAnnualBoy } from './server'
const id='12345678-1234-1234-1234-123456789abc'
beforeEach(()=>{state.calls=[];state.rows=[];state.readError=false;state.prepareError=false})
describe('anagrafica annuale server',()=>{
  it('legge tutte le pagine e filtra l’appartenenza all’anno senza usare lo stato globale',async()=>{
    state.rows=Array.from({length:1001},(_,n)=>({ragazzo_id:String(n),anno_scout:'2025-2026',attivo:true,snapshot:{id:String(n),nome:`Nome ${n}`,cognome:'Rossi',attivo:false}}))
    state.rows.push({ragazzo_id:'other',anno_scout:'2026-2027',attivo:true,snapshot:{nome:'Altro',cognome:'Anno'}})
    expect(await getAnnualBoys('2025/2026',false)).toHaveLength(1001)
    expect((await getAnnualBoys('2025-2026',false))[0].attivo).toBe(true)
    expect(state.calls[0]).toEqual({name:'ensure_roster_year',args:{p_year:'2025-2026'}})
  })
  it('esporta anni e archiviati separatamente anche con UUID condiviso',async()=>{
    state.rows=[{ragazzo_id:id,anno_scout:'2025-2026',attivo:true,snapshot:{nome:'Mario',cognome:'Rossi'}},{ragazzo_id:id,anno_scout:'2026-2027',attivo:false,snapshot:{nome:'Mario',cognome:'Rossi'}}]
    expect((await getAllAnnualBoys()).map(b=>[b.id,b.anno_scout,b.attivo])).toEqual([[id,'2025-2026',true],[id,'2026-2027',false]])
    expect(state.calls).toEqual([])
  })
  it('interrompe una lettura incompleta senza inventare uno storico dai ragazzi globali',async()=>{
    state.readError=true
    await expect(getAnnualBoys('2025-2026')).rejects.toThrow('leggere')
    state.readError=false;state.prepareError=true
    await expect(getAnnualBoys('2025-2026')).rejects.toThrow('preparare')
  })
  it('preserva zeri iniziali e consente cancellare contatti con null, normalizzando CF ed email',()=>{
    expect(validateAnnualChanges({telefono_ragazzo:'001234',codice_fiscale:'rssmra10a01h501u',genitore_1_email:'A@EXAMPLE.IT',genitore_2_email:'',importo_censimento:0,attivo:false})).toEqual({telefono_ragazzo:'001234',codice_fiscale:'RSSMRA10A01H501U',genitore_1_email:'a@example.it',genitore_2_email:null,importo_censimento:0,attivo:false})
  })
  it('rifiuta campi arbitrari, identità nel patch e date inesistenti',()=>{
    for(const input of [{id},{anno_scout:'2025-2026'},{quota_censimento:'true'},{data_nascita:'2026-02-30'},{codice_fiscale:'xxx'},{genitore_1_email:'a'},{attivo:null},{importo_censimento:NaN}])expect(()=>validateAnnualChanges(input)).toThrow()
  })
  it('scrive nell’anno esplicito con UUID stabile e pagamento opzionale, senza aggiornare altri anni',async()=>{
    await writeAnnualBoy('2025/2026',id,{quota_censimento:true},{method:'Bonifico',date:'2026-09-30'})
    expect(state.calls).toEqual([{name:'write_annual_boy',args:{p_year:'2025-2026',p_id:id,p_changes:{quota_censimento:true},p_census_method:'Bonifico',p_census_date:'2026-09-30'}}])
  })
  it('rifiuta pagamenti fuori anno prima di qualsiasi RPC',async()=>{
    await expect(writeAnnualBoy('2025-2026',id,{quota_censimento:true},{date:'2026-10-01'})).rejects.toThrow('fuori anno')
    expect(state.calls).toEqual([])
  })
})
