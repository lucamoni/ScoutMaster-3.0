export type Proof = {movimento_id:string;parent:number;payer:string;amount:number;date:string|null;confirmed:boolean;filename:string}
export type ProofReading = {payer:string;amount:number|null;date:string|null;status:string;reference:string;suggestedParent:number|null;warning?:string}
const words=(s:string)=>s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z ]/g,' ').split(/\s+/).filter(Boolean).sort().join(' ')
export function suggestParent(payer:string,names:(string|null)[]){const key=words(payer);if(!key)return null;const matches=names.map((n,i)=>n&&words(n)===key?i+1:null).filter((n):n is number=>n!==null);return matches.length===1?matches[0]:null}
export function normalizeProof(value:Record<string,unknown>,names:(string|null)[]):ProofReading{
 const payer=typeof value.payer==='string'?value.payer.trim().slice(0,150):''
 const amount=typeof value.amount==='number'?value.amount:null
 const date=typeof value.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value.date)&&Number.isFinite(Date.parse(value.date))&&new Date(value.date).toISOString().slice(0,10)===value.date?value.date:null
 return {payer,amount:amount&&Number.isFinite(amount)&&amount>0&&amount<1000000?Math.round(amount*100)/100:null,date,status:typeof value.status==='string'?value.status.slice(0,120):'',reference:typeof value.reference==='string'?value.reference.slice(0,200):'',suggestedParent:suggestParent(payer,names)}
}
