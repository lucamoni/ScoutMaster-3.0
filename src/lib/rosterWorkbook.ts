import * as XLSX from 'xlsx'
import { ROSTER_FIELDS,type Boy } from './roster'
export function rosterWorkbook(boys?:Array<Boy & {anno_scout?:string}>){
 const template=boys===undefined
 const wb=XLSX.utils.book_new()
 const rows=template?[Object.fromEntries(ROSTER_FIELDS.map(k=>[k,'']))]:boys.map(b=>Object.fromEntries(ROSTER_FIELDS.map(k=>[k,typeof b[k]==='object'&&b[k]!==null?JSON.stringify(b[k]):b[k]??''])))
 const sheet=XLSX.utils.json_to_sheet(rows,{header:[...ROSTER_FIELDS]})
 if(template){for(let r=1;r<=200;r++)for(let c=0;c<ROSTER_FIELDS.length;c++){const key=ROSTER_FIELDS[c];if(key.includes('codice')||key.includes('telefono')||key==='id')sheet[XLSX.utils.encode_cell({r,c})]={t:'s',v:'',z:'@'}}sheet['!ref']=XLSX.utils.encode_range({s:{r:0,c:0},e:{r:200,c:ROSTER_FIELDS.length-1}})}
 sheet['!cols']=ROSTER_FIELDS.map(()=>({wch:24}));XLSX.utils.book_append_sheet(wb,sheet,'ANAGRAFICA')
 XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Come compilare'],['Mantieni le intestazioni. Nome e cognome obbligatori.'],['Date: AAAA-MM-GG. Codici fiscali, telefoni e censimento: celle di testo.'],['Genitore 1/2: nome completo, email, telefono WhatsApp e codice fiscale del pagatore.'],['Attivo e flag documenti/pagamenti: Sì/No. Celle vuote non cancellano dati esistenti.'],['ID: lascia vuoto per nuove anagrafiche. Non modificare gli ID esportati.'],['Importa in Google Sheets, compila, poi scarica in formato Excel. Non rendere pubblico il foglio con i dati personali.'],['Ogni riga riguarda il proprio anno_scout. L’importazione modifica solo l’anno scelto nelle Impostazioni.'],['I pagamenti/documenti del nuovo anno non sono ereditati dal precedente.'],['Stati_documenti: JSON facoltativo; mantieni il valore esportato.']]),'ISTRUZIONI')
 return wb
}
export function readRosterWorkbook(buffer:ArrayBuffer){const wb=XLSX.read(buffer,{type:'array',cellDates:true});const sheet=wb.Sheets.ANAGRAFICA||wb.Sheets[wb.SheetNames[0]];return XLSX.utils.sheet_to_json<Record<string,unknown>>(sheet,{defval:'',raw:false,dateNF:'yyyy-mm-dd'}).filter(row=>Object.values(row).some(v=>String(v??'').trim()!==''))}
export function downloadRosterWorkbook(boys?:Array<Boy & {anno_scout?:string}>){XLSX.writeFile(rosterWorkbook(boys),boys===undefined?'modello-anagrafica.xlsx':'anagrafiche-complete.xlsx')}
