export type SheetMapping = { sheetName: string; tableName: string; columnsMap: Record<string, string> }
export const normalizeHeader = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

export function createSheetReader(headers: string[], row: string[], columns: Record<string, string>) {
  return (target: string) => {
    const entry = Object.entries(columns).find(([, value]) => normalizeHeader(value) === normalizeHeader(target))
    if (!entry) return ''
    const indexed = entry[0].match(/^__col_(\d+)$/)
    const index = indexed ? Number(indexed[1]) : headers.indexOf(entry[0])
    return index >= 0 ? row[index] ?? '' : ''
  }
}

export function buildKnownSheetMapping(sheetName: string, headers: string[]): SheetMapping | null {
  const name = normalizeHeader(sheetName).toUpperCase()
  const h = headers.map(normalizeHeader)
  const columnsMap: Record<string, string> = {}
  const set = (index: number, target: string) => { if (index >= 0) columnsMap[`__col_${index}`] = target }
  const person = h.findIndex(x => ['nome', 'nome cognome', 'nome e cognome', 'nome_cognome'].includes(x))
  set(person, 'nome_cognome_ragazzo')
  const result = (tableName: string) => ({ sheetName, tableName, columnsMap })
  if (name.includes('QUOTE')) {
    for (const month of ['ottobre', 'novembre', 'dicembre', 'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno']) set(h.indexOf(month), month)
    return result('quote_mensili')
  }
  if (name === 'CENSIMENTO') {
    set(h.findIndex(x => x.includes('censimento')), 'importo_censimento')
    set(h.findIndex(x => x.includes('ricevuta')), 'ricevuta_censimento')
    return result('ragazzi')
  }
  if (name.includes('PRIVACY')) {
    for (const [label, target] of Object.entries({ 'foglio privacy': 'foglio_privacy_firmato', 'partecipazione ci': 'partecipazione_ci', 'scheda medica ci': 'scheda_medica_ci', 'partecipazione ce': 'partecipazione_ce', 'scheda medica ce': 'scheda_medica_ce' })) set(h.findIndex(x => x.includes(label)), target)
    return result('ragazzi')
  }
  if (['CI', 'CE', 'CAMPO INVERNALE', 'CAMPO ESTIVO'].includes(name)) {
    set(h.findIndex(x => x.startsWith('saldo')), 'riscosso')
    set(h.findIndex(x => x.includes('bonifico') || x.includes('metodo')), 'metodo_pagamento')
    set(h.findIndex(x => x === 'quota' || x === 'quota dovuta'), 'quota_dovuta')
    // The shared CE register stores each participant's 180/190 quota after TOTALE.
    if (name === 'CE' && !Object.values(columnsMap).includes('quota_dovuta')) {
      const total = h.indexOf('totale')
      if (total >= 0 && !h[total + 1]) set(total + 1, 'quota_dovuta')
    }
    set(h.findIndex(x => x.includes('presenza')), 'stato_presenza')
    return result('campi')
  }
  if (name === 'USCITE' || name.includes('CON.CA')) {
    const occurrences = new Map<string, number>()
    for (let i = Math.max(person + 1, 2); i < headers.length; i++) {
      const label = headers[i].trim()
      if (!label || /^(quot[ae]|riscosso|metodo|saldo|totale)/.test(h[i])) continue
      const count = (occurrences.get(h[i]) ?? 0) + 1
      occurrences.set(h[i], count)
      const event = `${name.includes('CON.CA') ? 'CON.CA · ' : ''}${label}${count > 1 ? ` (${count})` : ''}`
      set(i, `evento:${event}`)
      if (h[i + 1]?.startsWith('quota')) set(++i, `quota_evento:${event}`)
      if (h[i + 1]?.startsWith('riscosso')) set(++i, `riscosso_evento:${event}`)
      if (h[i + 1]?.includes('metodo')) set(++i, `metodo_evento:${event}`)
    }
    return result('partecipazioni_eventi')
  }
  if (name === 'SPESE' || name === 'USCITE CASSA') {
    for (const [label, target] of Object.entries({ 'voce di spesa': 'voce_spesa', descrizione: 'voce_spesa', causale: 'voce_spesa', data: 'data', importo: 'importo', 'momento anno': 'momento_anno', carta: 'metodo', metodo: 'metodo', ricevuta: 'ricevuta_presente', note: 'note', 'tipo movimento': 'tipo_movimento', 'n° operaz': 'numero_operazione' })) set(h.findIndex(x => x.includes(label)), target)
    return result('registro_spese')
  }
  if (name === 'ANAGRAFICA') {
    for (const field of ['nome', 'cognome', 'pattuglia', 'sesso', 'data_nascita', 'codice_censimento', 'codice_fiscale', 'residenza', 'telefono_ragazzo', 'genitore_1_nome', 'genitore_1_telefono', 'genitore_1_email', 'genitore_1_codice_fiscale', 'genitore_2_nome', 'genitore_2_telefono', 'genitore_2_email', 'genitore_2_codice_fiscale', 'note_sanitarie']) set(h.findIndex(x => x.replace(/ /g, '_') === field), field)
    return result('ragazzi')
  }
  return null
}
