import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchPublicSheetValues } from '@/lib/googleSheetsPublic'
import { toCanonicalMetodo } from '@/lib/utils/payment'
import { parseSheetAmount, parseSheetDate } from '@/lib/googleSheetsImport'
import { authorizationErrorResponse, requireRole } from '@/lib/security/auth'

type ImportMapping = { sheetName?: string; tableName?: string; columnsMap?: Record<string, string> }
type ImportRequest = {
  mappings?: ImportMapping[]
  spreadsheetId?: string
  selectedTables?: string[]
  selectedSheets?: string[]
}

class ImportRequestError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'ImportRequestError'
    this.status = status
  }
}

const DEFAULT_TABLES = ['ragazzi', 'quote_mensili', 'partecipazioni_eventi', 'registro_spese']

function extractSpreadsheetId(raw: string) {
  const trimmed = raw.trim()
  const fromUrl = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1]
  const candidate = fromUrl || trimmed
  return /^[a-zA-Z0-9_-]{20,}$/.test(candidate) ? candidate : null
}

async function importExpenses(body: {
  mappings: ImportMapping[]
  spreadsheetId: string
  selectedTables: string[]
  selectedSheets: string[]
}) {
  const spreadsheetId = extractSpreadsheetId(body.spreadsheetId)
  if (!spreadsheetId) throw new ImportRequestError('ID o link Google Sheets non valido')
  const supabase = createAdminClient()
  const results: Array<Record<string, unknown>> = []

  for (const mapping of body.mappings) {
    if (!mapping.sheetName || !body.selectedSheets.includes(mapping.sheetName)) continue
    if (!mapping.tableName || !body.selectedTables.includes(mapping.tableName)) continue
    if (mapping.tableName !== 'registro_spese') {
      results.push({ sheetName: mapping.sheetName, tableName: mapping.tableName, inserted: 0, updated: 0, skipped: 0, warning: 'Modulo non ancora supportato dall’importazione automatica' })
      continue
    }
    const columnsMap = mapping.columnsMap || {}
    const reverse = new Map(Object.entries(columnsMap).map(([header, column]) => [column, header]))
    const rows = await fetchPublicSheetValues(spreadsheetId, mapping.sheetName)
    const headers = rows[0] || []
    const dataRows = rows.slice(1, 2001)
    let inserted = 0
    let skipped = 0
    for (let index = 0; index < dataRows.length; index += 1) {
      const row = dataRows[index]
      const value = (column: string) => {
        const header = reverse.get(column)
        const position = header ? headers.indexOf(header) : -1
        return position >= 0 ? row[position] : ''
      }
      const amount = parseSheetAmount(value('importo'))
      const date = parseSheetDate(value('data'))
      const voce = String(value('voce_spesa') || value('categoria') || '').trim()
      if (!amount || !date || !voce) {
        skipped += 1
        continue
      }
      const marker = `[Google Sheets:${mapping.sheetName}:${index + 2}]`
      const { data: existing, error: lookupError } = await supabase
        .from('registro_spese')
        .select('id')
        .like('note', `${marker}%`)
        .limit(1)
        .maybeSingle()
      if (lookupError) throw lookupError
      if (existing) {
        skipped += 1
        continue
      }
      const { error } = await supabase.from('registro_spese').insert({
        importo: amount,
        data: date,
        voce_spesa: voce,
        metodo: toCanonicalMetodo(String(value('metodo') || 'Contanti')),
        tipo_movimento: String(value('tipo_movimento') || '').toUpperCase() === 'ENTRATA' ? 'ENTRATA' : 'USCITA',
        ricevuta_presente: false,
        note: `${marker} Importazione da Google Sheets`,
      })
      if (error) throw error
      inserted += 1
    }
    results.push({ sheetName: mapping.sheetName, tableName: mapping.tableName, inserted, updated: 0, skipped })
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

    const results = await importExpenses({
      mappings: body.mappings,
      spreadsheetId: body.spreadsheetId,
      selectedTables: body.selectedTables ?? DEFAULT_TABLES,
      selectedSheets: body.selectedSheets,
    })
    return NextResponse.json({ success: true, results })
  } catch (error: unknown) {
    return importErrorResponse(error)
  }
}
