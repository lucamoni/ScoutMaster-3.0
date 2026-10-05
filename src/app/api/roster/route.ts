import { getAnnualBoys, getAllAnnualBoys } from '@/lib/annualRoster/server'
import { getWorkingYear } from '@/lib/workingYear'
import { validWorkingYear } from '@/lib/utils/workingYear'
import { requireRole } from '@/lib/security/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { reply,failure,sameOrigin } from '@/lib/issuedReceipts/server'
import { previewRoster } from '@/lib/roster'
import type { Json } from '@/types/database.types'
export async function GET(request:Request){try{await requireRole(['admin']);const year=await getWorkingYear();const boys=await getAnnualBoys(year,true);if(new URL(request.url).searchParams.get('format')==='xlsx'){const [{rosterWorkbook},XLSX]=await Promise.all([import('@/lib/rosterWorkbook'),import('xlsx')]);return new Response(XLSX.write(rosterWorkbook(await getAllAnnualBoys()),{type:'buffer',bookType:'xlsx'}),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="anagrafiche-complete.xlsx"','Cache-Control':'no-store'}})}return reply({boys,year})}catch(e){return failure(e)}}
export async function POST(request:Request){try{
 await requireRole(['admin']);sameOrigin(request)
 if(Number(request.headers.get('content-length')||0)>10000000)throw Error('File troppo grande')
 const input=await request.json();const year=validWorkingYear(input.year) || await getWorkingYear();
 if(input.googleUrl&&!input.commit){
  const id=String(input.googleUrl).match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/)?.[1];if(!id)throw Error('Link Google Sheets non valido')
  let matrix:unknown[][]|undefined
  if(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL&&process.env.GOOGLE_PRIVATE_KEY){const {google}=await import('googleapis');const auth=new google.auth.JWT({email:process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,key:process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g,'\n'),scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']});const result=await google.sheets({version:'v4',auth}).spreadsheets.values.get({spreadsheetId:id,range:'ANAGRAFICA!A1:AZ2001'});matrix=result.data.values||undefined}
  else{const {fetchPublicWorkbook}=await import('@/lib/googleSheetsPublic');try{matrix=(await fetchPublicWorkbook(id)).ANAGRAFICA}catch{throw Error('Foglio privato non accessibile: scarica l’Excel e caricalo qui')}}
  if(!matrix?.length)throw Error('Scheda ANAGRAFICA non trovata o vuota');const headers=matrix[0].map(String);input.rows=matrix.slice(1).map(row=>Object.fromEntries(headers.map((h,i)=>[h,row[i]??''])))
 }
 if(!Array.isArray(input.rows))throw Error('Righe non valide');input.rows=input.rows.filter((r:Record<string,unknown>)=>Object.values(r).some(v=>String(v??'').trim()!==''))
 const otherYears=input.rows.filter((r:Record<string,unknown>)=>r.anno_scout&&validWorkingYear(String(r.anno_scout))&&validWorkingYear(String(r.anno_scout))!==year).length;input.rows=input.rows.filter((r:Record<string,unknown>)=>!r.anno_scout||!validWorkingYear(String(r.anno_scout))||validWorkingYear(String(r.anno_scout))===year)
 const preview=previewRoster(input.rows,await getAnnualBoys(year,true),input.mode)
 if(!input.commit)return reply({preview,rows:input.rows,year,otherYears})
 if(preview.some(r=>r.errors.length))throw Error('Correggi gli errori prima di importare')
 const rows=preview.filter(r=>r.action!=='skip').map(r=>{const data={...r.data};delete data.anno_scout;return data})
 const {data,error}=await createAdminClient().rpc('import_roster_year',{p_year:year,p_rows:rows as Json,p_mode:input.mode})
 if(error)throw Error('Importazione annullata: dati cambiati o non validi. Aggiorna anteprima e riprova.')
 return reply({count:data,skipped:preview.length-rows.length,year,otherYears})
}catch(e){return failure(e)}}
