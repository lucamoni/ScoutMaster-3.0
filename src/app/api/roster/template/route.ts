import { requireRole } from '@/lib/security/auth'
import { rosterWorkbook } from '@/lib/rosterWorkbook'
import { failure } from '@/lib/issuedReceipts/server'
import * as XLSX from 'xlsx'
export async function GET(){try{await requireRole(['admin']);const bytes=XLSX.write(rosterWorkbook(),{type:'buffer',bookType:'xlsx'});return new Response(bytes,{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="modello-anagrafica.xlsx"','Cache-Control':'no-store'}})}catch(e){return failure(e)}}
