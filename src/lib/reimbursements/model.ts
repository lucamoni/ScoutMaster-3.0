import {getStaffRole,hasTreasurerQualification} from '@/lib/security/roles'
import {validWorkingYear,dateInWorkingYear} from '@/lib/utils/workingYear'
export type Reimbursement = {
 id:string;created_by:string;created_by_name:string;beneficiary_id:string;beneficiary_name:string;anno_scout:string;data_spesa:string;importo:number;categoria:string;momento_anno:string;note:string;file_name:string|null;stato:'DA_RIMBORSARE'|'RIMBORSATO'|'ANNULLATO';movimento_id:string|null;data_rimborso:string|null;metodo_rimborso:string|null;validated_by_name:string|null;validated_at:string|null;created_at:string
}
export type StaffOption={id:string;name:string}
export const canValidateReimbursement=(user:Parameters<typeof getStaffRole>[0],adminEmails='')=>getStaffRole(user,adminEmails)==='admin'||hasTreasurerQualification(user,adminEmails)
export const canReadReimbursement=(row:Pick<Reimbursement,'created_by'|'beneficiary_id'>,userId:string,manager:boolean)=>manager||row.created_by===userId||row.beneficiary_id===userId
export function validDate(input:unknown){if(typeof input!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(input))throw Error('Data non valida');const d=new Date(`${input}T12:00:00Z`);if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==input)throw Error('Data non valida');return input}
export const todayInItaly=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Rome'})
export function parseRequest(input:Record<string,unknown>){
 const year=validWorkingYear(typeof input.year==='string'?input.year:null);if(!year)throw Error('Anno scout non valido')
 const date=validDate(input.date);if(!dateInWorkingYear(date,year)||date>todayInItaly())throw Error('La data della spesa deve appartenere all’anno scelto e non essere futura')
 const amount=Number(String(input.amount||'').replace(',','.'));if(!Number.isFinite(amount)||amount<=0||amount>1000000||Math.abs(amount*100-Math.round(amount*100))>0.00001)throw Error('Importo non valido: usa al massimo due decimali')
 const category=String(input.category||'').trim(),note=String(input.note||'').trim(),period=String(input.period||'ANNO');if(!category||category.length>150||note.length>2000||!['ANNO','CI','CE'].includes(period))throw Error('Categoria, periodo o note non validi')
 const id=validId(input.id),beneficiary=validId(input.beneficiary)
 return{id,beneficiary,year,date,amount,category,note,period}
}
export function validId(input:unknown){if(typeof input!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(input))throw Error('Identificativo non valido');return input}
export function pendingByUser(rows:Reimbursement[]){const grouped=new Map<string,{name:string;amount:number;count:number}>();for(const r of rows)if(r.stato==='DA_RIMBORSARE'){const old=grouped.get(r.beneficiary_id)||{name:r.beneficiary_name,amount:0,count:0};old.amount+=Math.round(r.importo*100);old.count++;grouped.set(r.beneficiary_id,old)}return [...grouped.entries()].map(([id,r])=>({id,...r,amount:r.amount/100})).sort((a,b)=>a.name.localeCompare(b.name,'it'))}
export function reimbursementFileUrl(pointer:string){const match=pointer.match(/^rimborso:([a-f0-9-]{36})\//i);return match?`/api/rimborsi/${match[1]}/file`:null}
