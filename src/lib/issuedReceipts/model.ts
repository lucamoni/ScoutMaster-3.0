import type { Boy } from '@/lib/roster'
import type { Database } from '@/types/database.types'
import { dateInWorkingYear, validWorkingYear } from '@/lib/utils/workingYear'
import { validCF } from '@/lib/roster'
export type Movement = Database['public']['Tables']['registro_spese']['Row']
export type ReceiptConfig = { treasurer: string; signature: string }
export type ReceiptLine = { id: string; date: string; amount: number; method: string; sourceMethod: string; category: string; note: string; period: string }
export type ReceiptSnapshot = { year: string; date: string; boy: {id: string; name: string; cf: string}; parent: number; payer: {name: string; cf: string; email: string; phone: string}; lines: ReceiptLine[]; total: number; treasurer: string; signature: string }
export type IssuedReceipt = { recipient?: {email:string;phone:string}; id: string; numero: number; anno: string; snapshot: ReceiptSnapshot; created_at: string; pdf_path: string | null }
export function paymentMethod(raw: string | null) {
 const s=(raw || '').trim().toLowerCase()
 if (['contanti','cash'].includes(s)) return 'Contanti'
 if (['bonifico','banca','bonifici'].includes(s)) return 'Bonifico'
 if (['carta','pos','pos / carta','carta/pos'].includes(s)) return 'POS / Carta'
 throw new Error('Metodo di pagamento assente o non riconosciuto: correggi il movimento in Cassa')
}
export function makeSnapshot(boy: Boy, movements: Movement[], year: string, parent: number, config: ReceiptConfig, issuedIds: Set<string>, date: string): ReceiptSnapshot {
 if (!validWorkingYear(year) || ![1,2].includes(parent) || !/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date).toISOString().slice(0,10)!==date) throw new Error('Anno, data o genitore non valido')
 if (!boy.codice_fiscale || !validCF(boy.codice_fiscale.trim().toUpperCase())) throw new Error(`Completa il codice fiscale del ragazzo nell’anagrafica di ${boy.nome}`)
 const name=parent===1?boy.genitore_1_nome:boy.genitore_2_nome
 const cf=(parent===1?boy.genitore_1_codice_fiscale:boy.genitore_2_codice_fiscale)?.trim().toUpperCase() || ''
 if (!name?.trim() || !validCF(cf)) throw new Error(`Completa nome e codice fiscale del genitore ${parent} nell’anagrafica di ${boy.nome}`)
 if (!config.treasurer.trim() || !/^data:image\/(png|jpeg);base64,/.test(config.signature)) throw new Error('Inserisci nome e firma del tesoriere nella sezione Firma')
 if (!movements.length || movements.length>500 || new Set(movements.map(m=>m.id)).size!==movements.length) throw new Error('Seleziona da 1 a 500 movimenti distinti')
 const lines=movements.map(m=> {
  if (m.tipo_movimento!=='ENTRATA' || m.ragazzo_id!==boy.id || !dateInWorkingYear(m.data,year) || !Number.isFinite(m.importo) || m.importo<=0 || issuedIds.has(m.id)) throw new Error('Movimento non valido, fuori anno o già certificato')
  return { id:m.id,date:m.data!,amount:Math.round(m.importo*100)/100,method:paymentMethod(m.metodo),sourceMethod:m.metodo || '',category:m.voce_spesa || '',note:m.note || '',period:m.momento_anno || '' }
 }).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id))
 return { year,date,parent,boy:{id:boy.id,name:`${boy.nome} ${boy.cognome}`,cf:boy.codice_fiscale.trim().toUpperCase()},payer:{name:name.trim(),cf,email:(parent===1?boy.genitore_1_email:boy.genitore_2_email)||'',phone:(parent===1?boy.genitore_1_telefono:boy.genitore_2_telefono)||''},lines,total:lines.reduce((sum,l)=>sum+Math.round(l.amount*100),0)/100,treasurer:config.treasurer.trim(),signature:config.signature }
}
const units=['zero','uno','due','tre','quattro','cinque','sei','sette','otto','nove','dieci','undici','dodici','tredici','quattordici','quindici','sedici','diciassette','diciotto','diciannove']
function integerWords(n: number): string {
 if(n<20)return units[n]; if(n<100){const t=['','','venti','trenta','quaranta','cinquanta','sessanta','settanta','ottanta','novanta'][Math.floor(n/10)];const u=n%10;return (u===1||u===8?t.slice(0,-1):t)+(u?integerWords(u):'')}
 if(n<1000){const h=Math.floor(n/100),r=n%100;return (h===1?'':units[h])+(r>=80&&r<90?'cent':'cento')+(r?integerWords(r):'')}
 if(n<1000000){const h=Math.floor(n/1000),r=n%1000;return (h===1?'mille':integerWords(h)+'mila')+(r?integerWords(r):'')}
 if(n<1000000000){const h=Math.floor(n/1000000),r=n%1000000;return (h===1?'un milione':integerWords(h)+' milioni')+(r?' '+integerWords(r):'')}
 throw new Error('Importo troppo elevato')
}
export const amountWords=(n:number)=>{const cents=Math.round(n*100);return `${integerWords(Math.floor(cents/100))}/${String(cents%100).padStart(2,'0')}`}
export const euros=(n:number)=>new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(n).replace(/\u00a0/g,' ')
export const italianDate=(s:string)=>s.split('-').reverse().join('/')

export function receiptRecipient(s:ReceiptSnapshot,boy?:Boy){
 if(boy){const parents=[{cf:boy.genitore_1_codice_fiscale,email:boy.genitore_1_email,phone:boy.genitore_1_telefono},{cf:boy.genitore_2_codice_fiscale,email:boy.genitore_2_email,phone:boy.genitore_2_telefono}].filter(p=>p.cf?.trim().toUpperCase()===s.payer.cf)
  if(parents.length===1)return {email:parents[0].email||'',phone:parents[0].phone||''}
 }
 return {email:s.payer.email,phone:s.payer.phone}
}
