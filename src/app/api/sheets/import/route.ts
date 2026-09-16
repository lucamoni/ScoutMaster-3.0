import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchPublicSheetValues } from '@/lib/googleSheetsPublic'
import { toCanonicalMetodo } from '@/lib/utils/payment'
import { parseSheetAmount, parseSheetDate } from '@/lib/googleSheetsImport'
import { authorizationErrorResponse, requireRole } from '@/lib/security/auth'

type ImportMapping = { sheetName?: string; tableName?: string; columnsMap?: Record<string, string> }

async function importExpenses(body: { mappings: ImportMapping[]; spreadsheetId: string; selectedSheets: string[] }) {
  const spreadsheetId = body.spreadsheetId.trim().match(/^[a-zA-Z0-9_-]{20,}$/)?.[0]
  if (!spreadsheetId) throw new Error('Spreadsheet ID non valido')
  const supabase = createAdminClient()
  const results: Array<Record<string, unknown>> = []

  for (const mapping of body.mappings) {
    if (!mapping.sheetName || !body.selectedSheets.includes(mapping.sheetName)) continue
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
        .eq('note', marker)
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

export async function GET() {
  try {
    await requireRole(['admin', 'capo', 'tesoriere'])
    return NextResponse.json({ error: 'Usa POST dalla procedura guidata nelle Impostazioni per importare i dati.' }, { status: 405 })
  } catch (error: unknown) {
    return authorizationErrorResponse(error) || NextResponse.json({ error: 'Errore interno server' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    await requireRole(['admin', 'capo', 'tesoriere'])
    const body = await request.json() as { mappings?: ImportMapping[]; spreadsheetId?: string; selectedSheets?: string[] }
    if (!Array.isArray(body.mappings) || !body.spreadsheetId || !Array.isArray(body.selectedSheets)) {
      return NextResponse.json({ error: 'Parametri di importazione incompleti' }, { status: 400 })
    }
    const results = await importExpenses({ mappings: body.mappings, spreadsheetId: body.spreadsheetId, selectedSheets: body.selectedSheets })
    return NextResponse.json({ success: true, results })
  } catch (error: unknown) {
    return authorizationErrorResponse(error) || NextResponse.json({ error: 'Errore interno server' }, { status: 500 })
  }
}
