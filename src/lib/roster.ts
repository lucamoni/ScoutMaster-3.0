import type { Database } from '@/types/database.types'
export type Boy = Database['public']['Tables']['ragazzi']['Row']
export const ROSTER_FIELDS = ['id','nome','cognome','codice_fiscale','codice_censimento','data_nascita','residenza','sesso','pattuglia','telefono_ragazzo','genitore_1_nome','genitore_1_telefono','genitore_1_email','genitore_1_codice_fiscale','genitore_2_nome','genitore_2_telefono','genitore_2_email','genitore_2_codice_fiscale','note_sanitarie','attivo','foglio_privacy_firmato','partecipazione_ci','scheda_medica_ci','partecipazione_ce','scheda_medica_ce','quota_censimento','ricevuta_censimento','importo_censimento','stati_documenti'] as const
const flags = new Set(['attivo','foglio_privacy_firmato','partecipazione_ci','scheda_medica_ci','partecipazione_ce','scheda_medica_ce','quota_censimento','ricevuta_censimento'])
export const validCF = (s: string) => /^[A-Z0-9]{16}$/.test(s) || /^\d{11}$/.test(s)
export type RosterPreview = { row: number; action: 'create' | 'update' | 'skip'; data: Record<string, unknown>; errors: string[] }
const norm = (s: unknown) => String(s ?? '').trim().toLowerCase()
export function previewRoster(rows: Record<string, unknown>[], existing: Boy[], mode: string): RosterPreview[] {
 if (!['create','update'].includes(mode) || !rows.length || rows.length > 2000) throw new Error('Scegli un file con 1–2000 righe e una modalità valida')
 const seen = new Set<string>()
 return rows.map((row,i) => {
  const data: Record<string, unknown> = {}; const errors: string[] = []
  for (const [key,raw] of Object.entries(row)) {
   const field = key.trim().toLowerCase().replace(/\s+/g,'_')
   if (!(ROSTER_FIELDS as readonly string[]).includes(field)) { if (String(raw ?? '').trim()) errors.push(`Colonna sconosciuta: ${key}`); continue }
   let value: unknown = typeof raw === 'string' ? raw.trim() : raw
   if (value === '' || value == null) continue // Empty cells never erase existing values.
   if (flags.has(field)) { const v=norm(value); if (!['true','false','1','0','si','sì','no'].includes(v)) errors.push(`${field}: usa Sì/No`); value=['true','1','si','sì'].includes(v) }
   else if (field.includes('codice_fiscale')) { value=String(value).toUpperCase(); if (!validCF(String(value))) errors.push(`${field}: formato non valido`) }
   else if (field.endsWith('_email')) { value=norm(value); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) errors.push(`${field}: email non valida`) }
   else if (field === 'importo_censimento') { value=Number(String(value).replace(',','.')); if (!Number.isFinite(value) || Number(value)<0) errors.push('Importo censimento non valido') }
   else if (field === 'stati_documenti') { try { value=typeof value==='string'?JSON.parse(value):value; if (!value || typeof value!=='object' || Array.isArray(value)) throw Error() } catch { errors.push('Stati documenti: JSON non valido') } }
   else if (field==='data_nascita') { const v=String(value); const m=v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); value=m?`${m[3]}-${m[2]}-${m[1]}`:v; if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value)) || !Number.isFinite(Date.parse(String(value))) || new Date(String(value)).toISOString().slice(0,10)!==value) errors.push('Data nascita: usa AAAA-MM-GG') }
   else value=String(value)
   if (typeof value==='string' && value.length>5000) errors.push(`${field}: troppo lungo`)
   data[field]=value
  }
  if (!data.nome || !data.cognome) errors.push('Nome e cognome obbligatori')
  const matches=existing.filter(b => (data.id && b.id===data.id) || (data.codice_fiscale && norm(b.codice_fiscale)===norm(data.codice_fiscale)) || (data.codice_censimento && b.codice_censimento===data.codice_censimento) || (norm(b.nome)===norm(data.nome) && norm(b.cognome)===norm(data.cognome)))
  if (matches.length>1) errors.push('Più anagrafiche corrispondenti: verifica i codici')
  if (data.id && !existing.some(b=>b.id===data.id)) errors.push('ID non trovato: lascia vuoto per un nuovo ragazzo')
  if (matches.length===1) data.id=matches[0].id
  let action: RosterPreview['action']=data.id?'update':'create'
  if (data.id && mode==='create') action='skip'
  const identifiers=[`name:${norm(data.nome)}|${norm(data.cognome)}`, ...['id','codice_fiscale','codice_censimento'].filter(k=>data[k]).map(k=>`${k}:${norm(data[k])}`)]
  if (identifiers.some(k=>seen.has(k))) errors.push('Riga duplicata nel file')
  identifiers.forEach(k=>seen.add(k))
  return { row:i+2,action,data,errors }
 })
}
