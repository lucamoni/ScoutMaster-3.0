import {expect,it,vi} from 'vitest'
import {cents,parseStaffExpense,splitEqually,staffFileUrl} from './model'
const id='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002'
it('ripartisce anche i centesimi residui senza perdere denaro',()=>{expect(splitEqually(cents('10'),[id,other,'third'])).toEqual([{id,quota:3.34},{id:other,quota:3.33},{id:'third',quota:3.33}]);expect(()=>splitEqually(1,[id,other])).toThrow();expect(()=>splitEqually(10,[])).toThrow()})
it('accetta solo quote distinte con somma esatta e data nell’anno della spesa',()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-06T12:00:00Z'))
 const input={id,year:'2025-2026',date:'2026-09-30',amount:'10,01',description:'Cena capi',method:'Contanti',shares:[{id,quota:5.01},{id:other,quota:5}]}
 expect(parseStaffExpense(input)).toMatchObject({amount:1001,shares:[{id,quota:501},{id:other,quota:500}]})
 expect(()=>parseStaffExpense({...input,shares:[{id,quota:10}]})).toThrow()
 expect(()=>parseStaffExpense({...input,shares:[{id,quota:5},{id,quota:5.01}]})).toThrow()
 expect(()=>parseStaffExpense({...input,date:'2026-10-01'})).toThrow()
 expect(()=>parseStaffExpense({...input,year:'2026-2027',date:'2026-10-07'})).toThrow()
 vi.useRealTimers()
})
it('rifiuta importi nulli, negativi, non finiti o frazioni di centesimo',()=>{for(const value of ['',0,-1,'Infinity',1.001,1000001])expect(()=>cents(value)).toThrow();expect(cents('0,01')).toBe(1)})
it('gli allegati dei capi passano dal percorso autenticato',()=>{expect(staffFileUrl(`capo:${id}/ricevuta.pdf`)).toBe(`/api/anticipi-capi/${id}/file`);expect(staffFileUrl('public/x.pdf')).toBeNull()})
