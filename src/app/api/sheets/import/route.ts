import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchPublicWorkbook } from '@/lib/googleSheetsPublic'
import { buildKnownSheetMapping, createSheetReader as createReader } from '@/lib/googleSheetsMapping'
import { normalizeAnnoScout, toCanonicalMetodo } from '@/lib/utils/payment'
import { parseSheetAmount, parseSheetDate, parseSheetMetodo } from '@/lib/googleSheetsImport'
import { authorizationErrorResponse, requireRole } from '@/lib/security/auth'
import type { Database } from '@/types/database.types'

type ImportMapping = { sheetName?: string; tableName?: string; columnsMap?: Record<string, string> }
type ImportRequest = {
  mappings?: ImportMapping[]
  spreadsheetId?: string
  selectedTables?: string[]
  selectedSheets?: string[]
  annoScout?: string
  eventAccountingDate?: string
}
type ImportCounts = { sheetName: string; tableName: string; inserted: number; updated: number; skipped: number; warning?: string }

class ImportRequestError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'ImportRequestError'
    this.status = status
  }
}

const DEFAULT_TABLES = ['ragazzi', 'quote_mensili', 'partecipazioni_eventi', 'registro_spese', 'eventi', 'campi']
const MONTHS = ['ottobre', 'novembre', 'dicembre', 'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno']

function extractSpreadsheetId(raw: string) {
  const trimmed = raw.trim()
  const fromUrl = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1]
  const candidate = fromUrl || trimmed
  return /^[a-zA-Z0-9_-]{20,}$/.test(candidate) ? candidate : null
}

async function fetchSheetRows(spreadsheetId: string, sheetName: string, publicRows: () => Promise<Record<string, string[][]>>) {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  let key = process.env.GOOGLE_PRIVATE_KEY
  if (key?.includes('\\n')) key = key.replace(/\\n/g, '\n')

  if (email && key) {
    try {
      const auth = new google.auth.JWT({
        email,
        key,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      })
      const sheets = google.sheets({ version: 'v4', auth })
      const safeTitle = sheetName.replace(/'/g, "''")
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${safeTitle}'`,
      })
      if (response.data.values?.length) {
        return response.data.values.map(row => row.map(cell => String(cell ?? '')))
      }
    } catch (error) {
      console.warn('[api/sheets/import] service account read failed, trying public sheet', {
        sheetName,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const workbook = await publicRows()
  if (!workbook[sheetName]) throw new ImportRequestError(`Foglio non trovato: ${sheetName}`)
  return workbook[sheetName]
}

function normalizeKey(value: unknown) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

function readBoolean(value: unknown) {
  const normalized = normalizeKey(value)
  return ['1', 'true', 'vero', 'si', 'sì', 'yes', 'y', 'x', '✔', '✓', '☑', 'pagato', 'presente', 'p'].includes(normalized)
}

function readPresence(value: unknown) {
  const raw = String(value ?? '').trim()
  const normalized = normalizeKey(value)
  if (['a', 'assente', 'no', 'non presente', '-', '0'].includes(normalized)) return 'Assente'
  if (['p', 'presente', 'si', 'sì', 'yes', 'x', '1', '✔', '✓', '☑', 'pagato'].includes(normalized)) return 'Presente'
  if (normalized.includes('pendol')) return 'Pendolare'
  return raw || 'Presente'
}

function splitFullName(value: unknown) {
  const parts = String(value ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length < 2) return { nome: parts[0] || '', cognome: '' }
  return { nome: parts[0], cognome: parts.slice(1).join(' ') }
}

function hasMappedTarget(columnsMap: Record<string, string>, target: string) {
  return Object.values(columnsMap).some(mapped => normalizeKey(mapped) === normalizeKey(target))
}

type Person = { id: string; nome: string; cognome: string }
type ScoutEvent = { id: string; nome_evento: string; quota_standard: number | null; metodo_pagamento: string | null; data_inizio?: string | null }

async function getPeople(supabase: ReturnType<typeof createAdminClient>) {
  const { data, error } = await supabase.from('ragazzi').select('id, nome, cognome')
  if (error) throw error
  return ((data || []) as Person[])
}

async function getEvents(supabase: ReturnType<typeof createAdminClient>) {
  const { data, error } = await supabase.from('eventi').select('id, nome_evento, quota_standard, metodo_pagamento, data_inizio')
  if (error) throw error
  return ((data || []) as ScoutEvent[])
}

function findPerson(people: Person[], fullName: string) {
  const key = normalizeKey(fullName)
  if (!key) return null
  const matches = people.filter(person => normalizeKey(`${person.nome} ${person.cognome}`) === key)
  if (matches.length > 1) throw new ImportRequestError(`Nome ambiguo in anagrafica: ${fullName}. Risolvi l'omonimia prima di importare.`)
  return matches[0] || null
}

function findEvent(events: ScoutEvent[], name: string) {
  const key = normalizeKey(name)
  return events.find(event => normalizeKey(event.nome_evento) === key) || null
}

async function upsertPerson(
  supabase: ReturnType<typeof createAdminClient>,
  people: Person[],
  reader: (target: string) => string,
  columnsMap: Record<string, string>,
) {
  const mappedFullName = reader('nome_cognome_ragazzo') || reader('nome_cognome')
  const split = splitFullName(mappedFullName)
  const nome = reader('nome') || split.nome
  const cognome = reader('cognome') || split.cognome
  if (!nome || !cognome) return 'skipped' as const

  const payload: Database['public']['Tables']['ragazzi']['Insert'] = { nome, cognome }
  const values = payload as Record<string, unknown>
  const stringFields = [
    'codice_censimento', 'codice_fiscale', 'pattuglia', 'residenza',
    'sesso', 'telefono_ragazzo', 'genitore_1_nome', 'genitore_1_telefono',
    'genitore_2_nome', 'genitore_2_telefono', 'note_sanitarie',
  ]
  for (const field of stringFields) {
    const value = reader(field)
    if (value) values[field] = value
  }

  if (hasMappedTarget(columnsMap, 'data_nascita')) {
    const value = parseSheetDate(reader('data_nascita'))
    if (value) values.data_nascita = value
  }
  for (const field of ['attivo', 'quota_censimento', 'ricevuta_censimento', 'foglio_privacy_firmato', 'partecipazione_ci', 'scheda_medica_ci', 'partecipazione_ce', 'scheda_medica_ce']) {
    if (hasMappedTarget(columnsMap, field)) values[field] = readBoolean(reader(field))
  }
  if (hasMappedTarget(columnsMap, 'importo_censimento')) {
    const amount = parseSheetAmount(reader('importo_censimento'))
    if (amount !== null) {
      values.importo_censimento = amount
      values.quota_censimento = true
    }
  }
  const existing = findPerson(people, `${nome} ${cognome}`)
  if (existing) {
    const { error } = await supabase.from('ragazzi').update(payload).eq('id', existing.id)
    if (error) throw error
    existing.nome = nome
    existing.cognome = cognome
    return 'updated' as const
  }

  if (!hasMappedTarget(columnsMap, 'attivo')) values.attivo = true
  const { data, error } = await supabase.from('ragazzi').insert(payload).select('id, nome, cognome').single()
  if (error) throw error
  if (data) people.push(data as Person)
  return 'inserted' as const
}

async function importRagazzi(
  supabase: ReturnType<typeof createAdminClient>,
  people: Person[],
  mapping: ImportMapping,
  rows: string[][],
): Promise<ImportCounts> {
  const headers = rows[0] || []
  const columnsMap = mapping.columnsMap || {}
  let inserted = 0
  let updated = 0
  let skipped = 0

  for (const row of rows.slice(1, 2001)) {
    const result = await upsertPerson(supabase, people, createReader(headers, row, columnsMap), columnsMap)
    if (result === 'inserted') inserted += 1
    else if (result === 'updated') updated += 1
    else skipped += 1
  }
  return { sheetName: mapping.sheetName || '', tableName: 'ragazzi', inserted, updated, skipped }
}

async function importQuoteMensili(
  supabase: ReturnType<typeof createAdminClient>,
  people: Person[],
  mapping: ImportMapping,
  rows: string[][],
  annoScout: string,
): Promise<ImportCounts> {
  const headers = rows[0] || []
  const columnsMap = mapping.columnsMap || {}
  let inserted = 0
  let updated = 0
  let skipped = 0

  for (const row of rows.slice(1, 2001)) {
    const reader = createReader(headers, row, columnsMap)
    const fullName = reader('nome_cognome_ragazzo') || reader('nome_cognome') || `${reader('nome')} ${reader('cognome')}`
    const person = findPerson(people, fullName)
    if (!person) {
      skipped += 1
      continue
    }

    const payload: Database['public']['Tables']['quote_mensili']['Insert'] = {
      ragazzo_id: person.id,
      anno_scout: annoScout,
    }
    const values = payload as Record<string, unknown>
    for (const month of MONTHS) {
      if (hasMappedTarget(columnsMap, month)) values[month] = readBoolean(reader(month))
    }

    const { data: existing, error: lookupError } = await supabase
      .from('quote_mensili')
      .select('id')
      .eq('ragazzo_id', person.id)
      .eq('anno_scout', annoScout)
      .limit(1)
      .maybeSingle()
    if (lookupError) throw lookupError

    if (existing) {
      const { error } = await supabase.from('quote_mensili').update(payload).eq('id', existing.id)
      if (error) throw error
      updated += 1
    } else {
      const { error } = await supabase.from('quote_mensili').insert(payload)
      if (error) throw error
      inserted += 1
    }
  }

  return { sheetName: mapping.sheetName || '', tableName: 'quote_mensili', inserted, updated, skipped }
}

async function upsertEvent(
  supabase: ReturnType<typeof createAdminClient>,
  events: ScoutEvent[],
  name: string,
  quota: number | null,
  method: string,
  type: string,
  date: string | null,
) {
  const existing = findEvent(events, name)
  const payload: Database['public']['Tables']['eventi']['Insert'] = {
    nome_evento: name,
    quota_standard: quota,
    metodo_pagamento: method || 'Contanti',
    tipo_evento: type || null,
    data_inizio: date,
  }

  if (existing) {
    const { error } = await supabase.from('eventi').update(payload).eq('id', existing.id)
    if (error) throw error
    Object.assign(existing, payload)
    return { event: existing, action: 'updated' as const }
  }

  const { data, error } = await supabase.from('eventi').insert(payload).select('id, nome_evento, quota_standard, metodo_pagamento').single()
  if (error) throw error
  const event = data as ScoutEvent
  events.push(event)
  return { event, action: 'inserted' as const }
}

async function importEventi(
  supabase: ReturnType<typeof createAdminClient>,
  events: ScoutEvent[],
  mapping: ImportMapping,
  rows: string[][],
): Promise<ImportCounts> {
  const headers = rows[0] || []
  const columnsMap = mapping.columnsMap || {}
  let inserted = 0
  let updated = 0
  let skipped = 0

  for (const row of rows.slice(1, 2001)) {
    const reader = createReader(headers, row, columnsMap)
    const name = reader('nome_evento') || reader('nome') || reader('evento')
    if (!name) {
      skipped += 1
      continue
    }
    const result = await upsertEvent(
      supabase,
      events,
      name.trim(),
      parseSheetAmount(reader('quota_standard')),
      toCanonicalMetodo(reader('metodo_pagamento')),
      reader('tipo_evento'),
      parseSheetDate(reader('data_inizio')),
    )
    if (result.action === 'inserted') inserted += 1
    else updated += 1
  }

  return { sheetName: mapping.sheetName || '', tableName: 'eventi', inserted, updated, skipped }
}

async function importPartecipazioni(
  supabase: ReturnType<typeof createAdminClient>,
  people: Person[],
  events: ScoutEvent[],
  mapping: ImportMapping,
  rows: string[][],
  accountingDate: string,
): Promise<ImportCounts> {
  const headers = rows[0] || []
  const columnsMap = mapping.columnsMap || {}
  const eventTargets = Array.from(new Set(Object.values(columnsMap).filter(target => target.startsWith('evento:'))))
  let inserted = 0
  let updated = 0
  let skipped = 0

  for (const target of eventTargets) {
    const name = target.slice('evento:'.length).trim()
    const existing = findEvent(events, name)
    if (!existing) await upsertEvent(supabase, events, name, null, 'Contanti', 'USCITA', accountingDate)
    else if (!existing.data_inizio) {
      const { error } = await supabase.from('eventi').update({ data_inizio: accountingDate }).eq('id', existing.id)
      if (error) throw error
      existing.data_inizio = accountingDate
    }
  }

  for (const row of rows.slice(1, 2001)) {
    const reader = createReader(headers, row, columnsMap)
    const fullName = reader('nome_cognome_ragazzo') || reader('nome_cognome') || `${reader('nome')} ${reader('cognome')}`
    const person = findPerson(people, fullName)
    if (!person || eventTargets.length === 0) {
      skipped += 1
      continue
    }

    for (const target of eventTargets) {
      const rawPresence = reader(target)
      if (!rawPresence) continue
      const eventName = target.slice('evento:'.length).trim()
      const existingEvent = findEvent(events, eventName)
      const event = existingEvent || (await upsertEvent(supabase, events, eventName, null, 'Contanti', '', null)).event
      if (!event) throw new Error(`Impossibile creare l'evento importato: ${eventName}`)

      const amount = parseSheetAmount(reader(`quota_evento:${eventName}`) || reader('quota_dovuta')) ?? event.quota_standard

      const paidValue = reader(`riscosso_evento:${eventName}`) || reader('riscosso')
      const payload: Database['public']['Tables']['partecipazioni_eventi']['Insert'] = {
        ragazzo_id: person.id,
        evento_id: event.id,
        stato_presenza: readPresence(rawPresence),
        quota_dovuta: amount,
        riscosso: paidValue ? readBoolean(paidValue) : normalizeKey(rawPresence) === 'pagato',
        metodo_pagamento: toCanonicalMetodo(reader(`metodo_evento:${eventName}`) || reader('metodo_pagamento') || event.metodo_pagamento || 'Contanti'),
      }

      const { data: existing, error: lookupError } = await supabase
        .from('partecipazioni_eventi')
        .select('id')
        .eq('ragazzo_id', person.id)
        .eq('evento_id', event.id)
        .limit(1)
        .maybeSingle()
      if (lookupError) throw lookupError

      if (existing) {
        const { error } = await supabase.from('partecipazioni_eventi').update(payload).eq('id', existing.id)
        if (error) throw error
        updated += 1
      } else {
        const { error } = await supabase.from('partecipazioni_eventi').insert(payload)
        if (error) throw error
        inserted += 1
      }
    }
  }

  return { sheetName: mapping.sheetName || '', tableName: 'partecipazioni_eventi', inserted, updated, skipped }
}

async function importCampi(
  supabase: ReturnType<typeof createAdminClient>,
  people: Person[],
  events: ScoutEvent[],
  mapping: ImportMapping,
  rows: string[][],
  annoScout: string,
  accountingDate: string,
): Promise<ImportCounts> {
  const type = /^(CI|CAMPO INVERNALE)$/i.test(mapping.sheetName ?? '') ? 'CI' : 'CE'
  const name = `Campo ${type === 'CI' ? 'invernale' : 'estivo'} ${annoScout}`
  const event = findEvent(events, name) ?? (await upsertEvent(supabase, events, name, type === 'CI' ? 100 : null, 'Contanti', type, accountingDate)).event
  if (!event.data_inizio) {
    const { error } = await supabase.from('eventi').update({ data_inizio: accountingDate }).eq('id', event.id)
    if (error) throw error
    event.data_inizio = accountingDate
  }
  let inserted = 0
  let updated = 0
  let skipped = 0
  const seenNames = new Set<string>()
  for (const row of rows.slice(1)) {
    const read = createReader(rows[0], row, mapping.columnsMap ?? {})
    const fullName = read('nome_cognome_ragazzo')
    if (!fullName.trim()) continue
    const key = normalizeKey(fullName)
    if (seenNames.has(key)) { skipped++; continue }
    seenNames.add(key)
    const person = findPerson(people, fullName)
    const rawQuota = read('quota_dovuta').trim()
    const quota = /^0+(?:[.,]0+)?$/.test(rawQuota) ? 0
      : rawQuota ? parseSheetAmount(rawQuota) : (type === 'CI' ? 100 : null)
    if (!person || quota === null) { skipped++; continue }
    const method = parseSheetMetodo(read('metodo_pagamento'))
    // Missing payment details cannot establish a cash payment or an exemption.
    // Leave existing corrections intact until the source is explicit.
    if (quota > 0 && !method) { skipped++; continue }
    const payload: Database['public']['Tables']['partecipazioni_eventi']['Insert'] = {
      ragazzo_id: person.id, evento_id: event.id, quota_dovuta: quota,
      riscosso: readBoolean(read('riscosso')),
      metodo_pagamento: method,
      stato_presenza: read('stato_presenza') ? readPresence(read('stato_presenza')) : 'Presente',
    }
    const { data: existing, error: lookupError } = await supabase.from('partecipazioni_eventi').select('id').eq('ragazzo_id', person.id).eq('evento_id', event.id).maybeSingle()
    if (lookupError) throw lookupError
    const { error } = existing
      ? await supabase.from('partecipazioni_eventi').update(payload).eq('id', existing.id)
      : await supabase.from('partecipazioni_eventi').insert(payload)
    if (error) throw error
    if (existing) updated++; else inserted++
  }
  return { sheetName: mapping.sheetName ?? '', tableName: 'campi', inserted, updated, skipped,
    warning: skipped ? `${skipped} righe non importate: nome ripetuto/non trovato, quota individuale o metodo di pagamento mancante/non valido. Per gli esenti indicare una quota esplicita di 0. I dati esistenti delle righe saltate restano invariati.` : undefined }
}

async function importRegistroSpese(
  supabase: ReturnType<typeof createAdminClient>,
  mapping: ImportMapping,
  rows: string[][],
): Promise<ImportCounts> {
  const headers = rows[0] || []
  const columnsMap = mapping.columnsMap || {}
  let inserted = 0
  let updated = 0
  let skipped = 0
  let invalidMethods = 0
  const invalidRows: string[] = []

  for (let index = 0; index < Math.min(rows.length - 1, 2000); index += 1) {
    const row = rows[index + 1]
    const reader = createReader(headers, row, columnsMap)
    const amount = parseSheetAmount(reader('importo'))
    const date = parseSheetDate(reader('data'))
    const voce = String(reader('voce_spesa') || reader('categoria') || reader('note')).trim()
    if (!reader('importo') && !reader('data') && !voce) continue
    if (!amount || !date || !voce) {
      skipped += 1
      invalidRows.push(reader('numero_operazione') ? `operazione ${reader('numero_operazione')} (riga ${index + 2})` : `riga ${index + 2}`)
      continue
    }
    const method = parseSheetMetodo(reader('metodo') || reader('metodo_pagamento') || reader('carta'))
    if (!method) { skipped++; invalidMethods++; continue }

    const marker = `[Google Sheets:${mapping.sheetName}:${index + 2}]`
    const momentoValue = normalizeKey(reader('momento_anno')).toUpperCase()
    const momentoAnno = ['ANNO', 'CE', 'CI'].includes(momentoValue)
      ? (momentoValue as 'ANNO' | 'CE' | 'CI')
      : null
    const sourceNote = String(reader('note') || '').trim()
    const payload: Database['public']['Tables']['registro_spese']['Insert'] = {
      importo: amount,
      data: date,
      voce_spesa: voce,
      momento_anno: momentoAnno,
      metodo: method,
      tipo_movimento: normalizeKey(reader('tipo_movimento')) === 'entrata' ? 'ENTRATA' : 'USCITA',
      ricevuta_presente: readBoolean(reader('ricevuta_presente')),
      note: [marker, sourceNote, 'Importazione da Google Sheets'].filter(Boolean).join(' '),
    }
    const { data: existing, error: lookupError } = await supabase
      .from('registro_spese')
      .select('id')
      .like('note', `${marker}%`)
      .limit(1)
      .maybeSingle()
    if (lookupError) throw lookupError

    if (existing) {
      const { error } = await supabase.from('registro_spese').update(payload).eq('id', existing.id)
      if (error) throw error
      updated += 1
    } else {
      const { error } = await supabase.from('registro_spese').insert(payload)
      if (error) throw error
      inserted += 1
    }
  }

  return { sheetName: mapping.sheetName || '', tableName: 'registro_spese', inserted, updated, skipped,
    warning: [
      invalidMethods ? `${invalidMethods} spese saltate: metodo di pagamento mancante o non riconosciuto.` : '',
      invalidRows.length ? `Righe da verificare (${invalidRows.join(', ')}): data, importo o voce mancanti/non validi.` : '',
    ].filter(Boolean).join(' ') || undefined }
}

async function importData(body: {
  mappings: ImportMapping[]
  spreadsheetId: string
  selectedTables: string[]
  selectedSheets: string[]
  annoScout: string
  eventAccountingDate?: string
}) {
  const spreadsheetId = extractSpreadsheetId(body.spreadsheetId)
  if (!spreadsheetId) throw new ImportRequestError('ID o link Google Sheets non valido')
  const supabase = createAdminClient()
  const results: ImportCounts[] = []
  const sheetCache = new Map<string, string[][]>()
  let publicWorkbook: Promise<Record<string, string[][]>> | undefined
  const publicRows = () => publicWorkbook ??= fetchPublicWorkbook(spreadsheetId)
  const people = await getPeople(supabase)
  const events = await getEvents(supabase)

  const getRows = async (sheetName: string) => {
    if (!sheetCache.has(sheetName)) {
      const rows = await fetchSheetRows(spreadsheetId, sheetName, publicRows)
      if (rows.length > 2001) throw new ImportRequestError(`Il foglio ${sheetName} supera 2000 righe: suddividilo prima di importare.`)
      sheetCache.set(sheetName, rows)
    }
    return sheetCache.get(sheetName) || []
  }

  const importPriority: Record<string, number> = {
    ragazzi: 1,
    eventi: 2,
    quote_mensili: 3,
    partecipazioni_eventi: 4,
    campi: 4,
    registro_spese: 5,
  }
  // Rebuild known mappings from the actual source, including saved legacy mappings.
  const refreshedMappings: ImportMapping[] = []
  for (const sheetName of body.selectedSheets) {
    const rows = await getRows(sheetName)
    const known = buildKnownSheetMapping(sheetName, rows[0] ?? [])
    if (known) refreshedMappings.push(known)
    else refreshedMappings.push(...body.mappings.filter(mapping => mapping.sheetName === sheetName))
  }
  const orderedMappings = refreshedMappings.sort(
    (left, right) => (importPriority[left.tableName || ''] ?? 99) - (importPriority[right.tableName || ''] ?? 99),
  )
  const accountingDate = parseSheetDate(body.eventAccountingDate)
  if (orderedMappings.some(mapping => ['campi', 'partecipazioni_eventi'].includes(mapping.tableName ?? '') && body.selectedTables.includes(mapping.tableName ?? '')) && !accountingDate) {
    throw new ImportRequestError('Indica la data contabile per gli eventi senza data: serve a registrare gli incassi nel periodo corretto.')
  }

  for (const mapping of orderedMappings) {
    if (!mapping.sheetName || !body.selectedSheets.includes(mapping.sheetName)) continue
    if (!mapping.tableName || !body.selectedTables.includes(mapping.tableName)) continue

    const rows = await getRows(mapping.sheetName)
    if (mapping.tableName === 'ragazzi') {
      results.push(await importRagazzi(supabase, people, mapping, rows))
    } else if (mapping.tableName === 'quote_mensili') {
      results.push(await importQuoteMensili(supabase, people, mapping, rows, body.annoScout))
    } else if (mapping.tableName === 'eventi') {
      results.push(await importEventi(supabase, events, mapping, rows))
    } else if (mapping.tableName === 'partecipazioni_eventi') {
      results.push(await importPartecipazioni(supabase, people, events, mapping, rows, accountingDate!))
    } else if (mapping.tableName === 'campi') {
      results.push(await importCampi(supabase, people, events, mapping, rows, body.annoScout, accountingDate!))
    } else if (mapping.tableName === 'registro_spese') {
      results.push(await importRegistroSpese(supabase, mapping, rows))
    } else {
      results.push({
        sheetName: mapping.sheetName,
        tableName: mapping.tableName,
        inserted: 0,
        updated: 0,
        skipped: 0,
        warning: 'Modulo non supportato dall’importazione automatica',
      })
    }
  }

  return results
}
function importErrorResponse(error: unknown) {
  const authorizationResponse = authorizationErrorResponse(error)
  if (authorizationResponse) return authorizationResponse

  const message = error instanceof Error ? error.message : 'Errore sconosciuto'
  const status = error instanceof ImportRequestError ? error.status : 500
  console.error('[api/sheets/import] failed', {
    message,
    stack: error instanceof Error ? error.stack : undefined,
  })

  const safeMessage =
    error instanceof ImportRequestError || message.startsWith('Impossibile accedere al foglio Google')
      ? message
      : 'Importazione non riuscita. Controlla il log del server e la configurazione di Google Sheets.'

  return NextResponse.json({ error: safeMessage }, { status })
}

export async function GET() {
  try {
    await requireRole(['admin', 'capo', 'tesoriere'])
    return NextResponse.json({ error: 'Usa POST dalla procedura guidata nelle Impostazioni per importare i dati.' }, { status: 405 })
  } catch (error: unknown) {
    return importErrorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    await requireRole(['admin', 'capo', 'tesoriere'])

    let body: ImportRequest
    try {
      body = await request.json() as ImportRequest
    } catch {
      throw new ImportRequestError('Corpo della richiesta non valido')
    }

    if (!Array.isArray(body.mappings) || !body.spreadsheetId || !Array.isArray(body.selectedSheets)) {
      throw new ImportRequestError('Parametri di importazione incompleti')
    }

    const results = await importData({
      mappings: body.mappings,
      spreadsheetId: body.spreadsheetId,
      selectedTables: body.selectedTables ?? DEFAULT_TABLES,
      selectedSheets: body.selectedSheets,
      annoScout: normalizeAnnoScout(body.annoScout),
      eventAccountingDate: body.eventAccountingDate,
    })
    return NextResponse.json({ success: true, results })
  } catch (error: unknown) {
    return importErrorResponse(error)
  }
}
