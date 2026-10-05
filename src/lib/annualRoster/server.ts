import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getWorkingYear } from '@/lib/workingYear'
import { validWorkingYear } from '@/lib/utils/workingYear'
import { ROSTER_FIELDS, validCF, type Boy } from '@/lib/roster'
import type { Json, Tables } from '@/types/database.types'

const flags = new Set(['attivo','quota_censimento','ricevuta_censimento','foglio_privacy_firmato','partecipazione_ci','partecipazione_ce','scheda_medica_ci','scheda_medica_ce'])
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
export type AnnualCensus = { method?: 'Contanti' | 'Bonifico' | 'Carta'; date?: string }

export async function resolveAnnualYear(explicit?: unknown): Promise<string> {
  if (explicit !== undefined) {
    const year = typeof explicit === 'string' && validWorkingYear(explicit)
    if (!year) throw new Error('Anno scout non valido')
    return year
  }
  const { data, error } = await createAdminClient().from('impostazioni').select('valore').eq('chiave','anno_scout_corrente').maybeSingle()
  if (error) throw new Error('Impossibile leggere l’anno scout')
  return getWorkingYear(data?.valore)
}

export function annualSnapshot(row: Pick<Tables<'ragazzi_anni'>, 'ragazzo_id' | 'snapshot' | 'attivo'>): Boy {
  if (!row.snapshot || typeof row.snapshot !== 'object' || Array.isArray(row.snapshot)) throw new Error('Anagrafica annuale non valida')
  const snapshot = row.snapshot as Record<string, Json | undefined>
  if (typeof snapshot.nome !== 'string' || typeof snapshot.cognome !== 'string') throw new Error('Anagrafica annuale incompleta')
  return { ...snapshot, id: row.ragazzo_id, attivo: row.attivo } as Boy
}

export async function ensureAnnualYear(year: string) {
  const canonical = validWorkingYear(year)
  if (!canonical) throw new Error('Anno scout non valido')
  const { error } = await createAdminClient().rpc('ensure_roster_year',{ p_year: canonical })
  if (error) throw new Error('Impossibile preparare l’anagrafica dell’anno selezionato')
  return canonical
}

export async function getAnnualBoys(year: string, includeArchived = true): Promise<Boy[]> {
  const canonical = await ensureAnnualYear(year)
  const db = createAdminClient(); const boys: Boy[] = []
  for (let offset = 0; ; offset += 500) {
    let query = db.from('ragazzi_anni').select('ragazzo_id,snapshot,attivo').eq('anno_scout',canonical).order('ragazzo_id')
    if (!includeArchived) query = query.eq('attivo',true)
    const { data,error } = await query.range(offset,offset+499)
    if (error || !data) throw new Error('Impossibile leggere l’anagrafica dell’anno selezionato')
    boys.push(...data.map(annualSnapshot))
    if (data.length < 500) return boys.sort((a,b)=>a.cognome.localeCompare(b.cognome,'it')||a.nome.localeCompare(b.nome,'it'))
  }
}

export async function getAnnualBoy(year: string, id: string): Promise<Boy | null> {
  if (!uuid.test(id)) throw new Error('Ragazzo non valido')
  const canonical = await ensureAnnualYear(year)
  const {data,error}=await createAdminClient().from('ragazzi_anni').select('ragazzo_id,snapshot,attivo').eq('anno_scout',canonical).eq('ragazzo_id',id).maybeSingle()
  if(error)throw new Error('Impossibile leggere l’anagrafica dell’anno selezionato')
  return data ? annualSnapshot(data) : null
}

/** Complete export keeps archived memberships and the source year of each row. */
export async function getAllAnnualBoys(): Promise<Array<Boy & { anno_scout: string }>> {
  const db=createAdminClient(); const boys:Array<Boy & {anno_scout:string}>=[]
  for(let offset=0;;offset+=500){
    const {data,error}=await db.from('ragazzi_anni').select('ragazzo_id,anno_scout,snapshot,attivo').order('anno_scout').order('ragazzo_id').range(offset,offset+499)
    if(error||!data)throw new Error('Impossibile esportare lo storico delle anagrafiche')
    boys.push(...data.map(row=>({...annualSnapshot(row),anno_scout:row.anno_scout})))
    if(data.length<500)return boys
  }
}

export function validateAnnualChanges(input: unknown): Record<string, Json> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Modifiche anagrafica non valide')
  const changes: Record<string, Json> = {}
  for (const [field, raw] of Object.entries(input)) {
    if (field === 'id' || field === 'anno_scout' || !(ROSTER_FIELDS as readonly string[]).includes(field)) throw new Error(`Campo anagrafica non consentito: ${field}`)
    if (raw === undefined) continue
    let value: Json
    if (flags.has(field)) {
      if (typeof raw !== 'boolean' && !(raw === null && field !== 'attivo')) throw new Error(`${field}: stato non valido`)
      value = raw as boolean | null
    } else if (field === 'importo_censimento') {
      if (raw !== null && (typeof raw !== 'number' || !Number.isFinite(raw) || raw < 0)) throw new Error('Importo censimento non valido')
      value = raw as number | null
    } else if (field === 'stati_documenti') {
      if (raw !== null && (typeof raw !== 'object' || Array.isArray(raw) || JSON.stringify(raw).length > 20000)) throw new Error('Stati documenti non validi')
      value = raw as Json
    } else {
      if (raw !== null && typeof raw !== 'string') throw new Error(`${field}: testo non valido`)
      value = raw === null ? null : raw.trim() || null
      if (typeof value === 'string') {
        if (value.length > 5000) throw new Error(`${field}: testo troppo lungo`)
        if (field.includes('codice_fiscale')) { value=value.toUpperCase(); if(!validCF(value))throw new Error(`${field}: codice fiscale non valido`) }
        if (field.endsWith('_email')) { value=value.toLowerCase(); if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))throw new Error(`${field}: email non valida`) }
        if (field === 'data_nascita') { const date = new Date(`${value}T00:00:00Z`); if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)throw new Error('Data di nascita non valida') }
      }
    }
    changes[field]=value
  }
  if (!Object.keys(changes).length) throw new Error('Nessuna modifica da salvare')
  for (const field of ['nome','cognome']) if (field in changes && !changes[field]) throw new Error('Nome e cognome obbligatori')
  return changes
}

export async function writeAnnualBoy(year: string, id: string | null, input: unknown, census?: AnnualCensus): Promise<Boy> {
  const canonical=validWorkingYear(year)
  if(!canonical)throw new Error('Anno scout non valido')
  if(id!==null&&!uuid.test(id))throw new Error('Ragazzo non valido')
  const changes=validateAnnualChanges(input)
  if(id===null&&(!changes.nome||!changes.cognome))throw new Error('Nome e cognome obbligatori')
  if(census){
    if(census.method!==undefined&&!['Contanti','Bonifico','Carta'].includes(census.method))throw new Error('Metodo censimento non valido')
    if(census.date!==undefined){const date=new Date(`${census.date}T00:00:00Z`); const [start,end]=canonical.split('-'); if(!/^\d{4}-\d{2}-\d{2}$/.test(census.date)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==census.date||census.date<`${start}-10-01`||census.date>`${end}-09-30`)throw new Error('Data censimento fuori anno')}
  }
  const {data,error}=await createAdminClient().rpc('write_annual_boy',{p_year:canonical,p_id:id,p_changes:changes,p_census_method:census?.method,p_census_date:census?.date})
  if(error||!data)throw new Error(error?.code==='P0001'?error.message:'Anagrafica non salvata: aggiorna e riprova')
  const snapshot=data as Record<string,Json>
  return annualSnapshot({ragazzo_id:String(snapshot.id),snapshot:data,attivo:snapshot.attivo!==false})
}
