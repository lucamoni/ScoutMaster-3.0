import * as XLSX from 'xlsx'

// Unlike gviz, XLSX preserves mixed text/boolean columns and duplicate headers.
export async function fetchPublicWorkbook(spreadsheetId: string): Promise<Record<string, string[][]>> {
  if (!/^[a-zA-Z0-9_-]{20,}$/.test(spreadsheetId)) throw new Error('ID Google Sheets non valido')
  const response = await fetch(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx`, { cache: 'no-store' })
  if (!response.ok) throw new Error(`Impossibile accedere al foglio Google (HTTP ${response.status}). Verifica la condivisione del foglio.`)
  const bytes = await response.arrayBuffer()
  if (bytes.byteLength > 20 * 1024 * 1024) throw new Error('Foglio Google troppo grande (massimo 20 MB).')
  return parsePublicWorkbook(bytes)
}

export function parsePublicWorkbook(bytes: ArrayBuffer): Record<string, string[][]> {
  const workbook = XLSX.read(bytes, { type: 'array', cellDates: false, cellNF: true })
  return Object.fromEntries(workbook.SheetNames.map(name => {
    const sheet = workbook.Sheets[name]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', raw: true })
    return [name, rows.map((row, rowIndex) => row.map((value, column) => {
      const header = String(rows[0]?.[column] ?? '').trim().toLowerCase()
      const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex, c: column })]
      if (rowIndex > 0 && typeof value === 'number' && /^data(?:$|[ _])/.test(header)) {
        // Serial dates are calendar dates, not instants in the server timezone.
        const date = XLSX.SSF.parse_date_code(value)
        return date ? `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}` : ''
      }
      if (rowIndex > 0 && /importo|quota/.test(header) && typeof cell?.z === 'string' && XLSX.SSF.is_date(cell.z)) {
        // The source uses h.mm for a monetary 1.20; the owner confirmed the
        // displayed decimal is the amount, not the underlying fraction of a day.
        if (cell.z === 'h.mm' && typeof value === 'number' && value >= 0 && value < 1) {
          const minutes = Math.round(value * 24 * 60)
          return `${Math.floor(minutes / 60)}.${String(minutes % 60).padStart(2, '0')}`
        }
        return 'Valore con formato data/ora'
      }
      return String(value ?? '')
    }))]
  }))
}

export async function fetchPublicSheetValues(spreadsheetId: string, sheetName?: string) {
  const workbook = await fetchPublicWorkbook(spreadsheetId)
  const name = sheetName ?? Object.keys(workbook)[0]
  if (!(name in workbook)) throw new Error(`Foglio non trovato: ${name}`)
  return workbook[name]
}

export async function fetchPublicSheetTitles(spreadsheetId: string) {
  return Object.keys(await fetchPublicWorkbook(spreadsheetId))
}
