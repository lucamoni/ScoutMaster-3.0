export async function fetchPublicSheetValues(spreadsheetId: string, sheetName?: string): Promise<string[][]> {
  const url = sheetName 
    ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`
    : `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:json`

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  })

  if (!res.ok) {
    throw new Error(`Impossibile accedere al foglio Google (HTTP ${res.status}). Assicurati che il foglio sia condiviso con "Chiunque abbia il link può visualizzare" oppure imposta le credenziali GOOGLE_SERVICE_ACCOUNT_EMAIL in .env.local.`)
  }

  const text = await res.text()
  const jsonMatch = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);/)
  if (!jsonMatch || !jsonMatch[1]) {
    throw new Error('Formato risposta del foglio Google non valido.')
  }

  const data = JSON.parse(jsonMatch[1])
  const table = data.table
  if (!table) return []

  const rows: string[][] = []

  // Intestazioni colonne
  const headers: string[] = table.cols.map((col: { label?: string, id?: string }) => col.label || col.id || '')
  rows.push(headers)

  // Righe dati
  if (table.rows && Array.isArray(table.rows)) {
    for (const r of table.rows) {
      if (!r.c || !Array.isArray(r.c)) continue
      const rowVal: string[] = r.c.map((cell: { v?: unknown, f?: string } | null) => {
        if (!cell) return ''
        if (cell.v !== undefined && cell.v !== null) return String(cell.v)
        if (cell.f !== undefined && cell.f !== null) return String(cell.f)
        return ''
      })
      rows.push(rowVal)
    }
  }

  return rows
}

export async function fetchPublicSheetTitles(spreadsheetId: string): Promise<string[]> {
  try {
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    })
    if (res.ok) {
      const html = await res.text()
      const matches = html.match(/"name":\s*"([^"]+)"/g)
      if (matches) {
        const titles = matches
          .map(m => m.replace(/"name":\s*"/, '').replace(/"$/, ''))
          .filter(t => t && t.length < 50 && !['sheet', 'spreadsheet', 'grid'].includes(t.toLowerCase()))
        if (titles.length > 0) {
          return Array.from(new Set(titles))
        }
      }
    }
  } catch (err) {
    console.warn('Errore lettura titoli fogli pubblici:', err)
  }
  return ['Foglio1', 'Cassa', 'Anagrafica', 'Quote', 'Uscite']
}
