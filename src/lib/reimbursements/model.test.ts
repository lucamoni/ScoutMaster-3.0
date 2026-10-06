import {expect,it,vi} from 'vitest'
import {canValidateReimbursement,canReadReimbursement,pendingByUser,parseRequest,validDate,reimbursementFileUrl,type Reimbursement} from './model'
const id='00000000-0000-0000-0000-000000000001'
it('solo admin o qualifica tesoriere su un ruolo attivo confermano; il capo semplice no',()=>{
 expect(canValidateReimbursement({app_metadata:{role:'admin'}})).toBe(true)
 expect(canValidateReimbursement({app_metadata:{role:'capo_unita'}})).toBe(false)
 expect(canValidateReimbursement({app_metadata:{role:'aiuto_capo_unita',treasurer:true}})).toBe(true)
 expect(canValidateReimbursement({app_metadata:{role:'capo_unita',treasurer:true,disabled:true}})).toBe(false)
 expect(canValidateReimbursement({app_metadata:{role:'tesoriere_unita',treasurer:false}})).toBe(false)
 expect(canValidateReimbursement({app_metadata:{treasurer:true}})).toBe(false)
})
it('le richieste di altri utenti sono riservate ai validatori',()=>{
 const r={created_by:'one',beneficiary_id:'two'};expect(canReadReimbursement(r,'one',false)).toBe(true);expect(canReadReimbursement(r,'two',false)).toBe(true);expect(canReadReimbursement(r,'three',false)).toBe(false);expect(canReadReimbursement(r,'three',true)).toBe(true)
})
it('riepilogo distingue anni e raggruppa solo gli anticipi non rimborsati, senza errori sui centesimi',()=>{
 const row={beneficiary_id:id,beneficiary_name:'Mario',stato:'DA_RIMBORSARE'} as Reimbursement
 const result=pendingByUser([{...row,importo:0.1,anno_scout:'2025-2026'},{...row,importo:0.2,anno_scout:'2026-2027'},{...row,importo:200,stato:'RIMBORSATO'},{...row,importo:50,stato:'ANNULLATO'}]);expect(result).toEqual([{id,name:'Mario',amount:0.3,count:2}])
})
it('rifiuta importi/date invalidi o fuori anno, e mantiene anno della spesa',()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-06T12:00:00Z'))
 const input={id,beneficiary:id,year:'2025-2026',date:'2026-09-30',amount:'12,34',category:'Materiale',period:'ANNO'}
 expect(parseRequest(input)).toMatchObject({amount:12.34,year:'2025-2026',date:'2026-09-30'})
 for(const amount of ['0','-1','Infinity','1.234'])expect(()=>parseRequest({...input,amount})).toThrow()
 expect(()=>parseRequest({...input,date:'2026-10-05'})).toThrow();expect(()=>validDate('2026-02-30')).toThrow();vi.useRealTimers()
})
it('i file dei rimborsi vengono recuperati dal percorso autenticato, mai da storage pubblico',()=>{
 expect(reimbursementFileUrl(`rimborso:${id}/foto.jpg`)).toBe(`/api/rimborsi/${id}/file`);expect(reimbursementFileUrl('allegati/photo.jpg')).toBeNull()
})
