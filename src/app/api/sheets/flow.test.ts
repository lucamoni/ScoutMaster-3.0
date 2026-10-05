import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildKnownSheetMapping, createSheetReader } from '../../../lib/googleSheetsMapping'
import { parsePublicWorkbook } from '../../../lib/googleSheetsPublic'
import * as XLSX from 'xlsx'
import { readFileSync } from 'node:fs'

const state = vi.hoisted(() => ({ tables: {} as Record<string, Record<string, unknown>[]>, sheets: {} as Record<string, string[][]> }))
vi.mock('@/lib/annualRoster/server',()=>({getAnnualBoys:async()=>state.tables.ragazzi || []}))
vi.mock('@/lib/security/auth', () => ({ requireRole: vi.fn(), authorizationErrorResponse: () => null }))
vi.mock('@/lib/googleSheetsPublic', async original => ({ ...await original<object>(), fetchPublicWorkbook: async () => state.sheets }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (table: string) => {
  let action = 'select'
  let payload: Record<string, unknown> = {}
  const filters: Array<(row: Record<string, unknown>) => boolean> = []
  const run = () => {
    const rows = state.tables[table] ??= []
    const matches = rows.filter(row => filters.every(filter => filter(row)))
    if (action === 'upsert') { const row = rows.find(r => r.chiave === payload.chiave); if(row){Object.assign(row,payload);return [row]} }
    if (action === 'insert' || action === 'upsert') { const row = { id: `${table}-${rows.length + 1}`, ...payload }; rows.push(row); return [row] }
    if (action === 'update') matches.forEach(row => Object.assign(row, payload))
    return matches
  }
  const query = {
    select: () => query,
    eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return query },
    like: (key: string, value: string) => { filters.push(row => String(row[key] ?? '').startsWith(value.slice(0, -1))); return query },
    limit: () => query,
    insert: (value: Record<string, unknown>) => { action = 'insert'; payload = value; return query },
    upsert: (value: Record<string, unknown>) => { action = 'upsert'; payload = value; return query },
    update: (value: Record<string, unknown>) => { action = 'update'; payload = value; return query },
    single: async () => ({ data: run()[0] ?? null, error: null }),
    maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: run(), error: null }).then(resolve),
  }
  return query
} }) }))

import { POST } from './import/route'

beforeEach(() => {
  vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL', '')
  vi.stubEnv('GOOGLE_PRIVATE_KEY', '')
  state.tables = { ragazzi: [{ id: 'p1', nome: 'Mario', cognome: 'Rossi' }, { id: 'p2', nome: 'Anna', cognome: 'Bianchi' }], eventi: [] }
  state.sheets = {
    SPESE: [['N° OPERAZ.', 'VOCE DI SPESA', 'DATA', 'IMPORTO', 'MOMENTO ANNO', 'CARTA'], ['1', 'Trasporti', '06/06/2026', '186', 'ANNO', 'CARTA'], ['2', 'Materiali', '07/06/2026', '20', 'CE', 'BONIFICO']],
    USCITE: [['ID', 'NOME', 'MAGGIO', 'QUOTA', 'RISCOSSO', 'MAGGIO', 'QUOTA', 'RISCOSSO', 'CHIUSURA', 'QUOTA', 'RISCOSSO'], ['1', 'Mario Rossi', 'PRESENTE', '15', 'true', 'PRESENTE', '20', 'false', '', '', 'false']],
    CI: [['ID', 'NOME', 'SALDO 100', 'BONIFICO/ CONTANTI'], ['1', 'Mario Rossi', 'true', 'BONIFICO']],
    CE: [['ID', 'NOME', 'SALDO 100', 'BONIFICO/ CONTANTI', 'TOTALE', ''], ['1', 'Mario Rossi', 'true', 'BONIFICO', '0', '190'], ['2', 'Anna Bianchi', 'true', 'CONTANTI', '0', '180']],
  }
})

async function runImport() {
  const response = await POST(new Request('http://localhost/api/sheets/import', { method: 'POST', body: JSON.stringify({ spreadsheetId: 'test-spreadsheet-1234567890', selectedSheets: Object.keys(state.sheets), selectedTables: ['registro_spese', 'partecipazioni_eventi', 'campi'], mappings: [], annoScout: '2025-2026', eventAccountingDate: '2026-07-20' }) }))
  expect(response.status).toBe(200)
  return response.json()
}

describe('importazione fedele al foglio scout', () => {
  it('rifiuta anno e data incompatibili prima di modificare qualsiasi tabella', async () => {
    const response = await POST(new Request('http://localhost/api/sheets/import', {method:'POST',body:JSON.stringify({spreadsheetId:'test-spreadsheet-1234567890',selectedSheets:['CI','SPESE'],selectedTables:['campi','registro_spese'],mappings:[],annoScout:'2026-2027',eventAccountingDate:'2026-09-30'})}))
    expect(response.status).toBe(400)
    expect((await response.json()).error).toContain('anno scout')
    expect(state.tables.eventi).toHaveLength(0)
    expect(state.tables.registro_spese).toBeUndefined()
  })
  it('conserva tariffa storica e data contabile delle mensili senza usare 10€ o oggi', async () => {
    state.sheets['QUOTE MENSILI']=[['NOME','NOVEMBRE','DICEMBRE'],['Mario Rossi','true','true']]
    const input={spreadsheetId:'test-spreadsheet-1234567890',selectedSheets:['QUOTE MENSILI'],selectedTables:['quote_mensili'],mappings:[],annoScout:'2025-2026',eventAccountingDate:'2026-09-30'}
    const missing=await POST(new Request('http://localhost/api/sheets/import',{method:'POST',body:JSON.stringify(input)}))
    expect(missing.status).toBe(400)
    expect(state.tables.quote_mensili).toBeUndefined()
    const response=await POST(new Request('http://localhost/api/sheets/import',{method:'POST',body:JSON.stringify({...input,monthlyAmount:'8,00'})}))
    expect(response.status).toBe(200)
    expect(state.tables.quote_mensili[0]).toMatchObject({anno_scout:'2025-2026',importo_mensile:8,data_contabile:'2026-09-30',novembre:true,dicembre:true})
    expect(state.tables.impostazioni[0]).toMatchObject({chiave:'quota_mensile_standard_2025-2026',valore:'8'})
  })
  it('separa le uscite omonime di due anni senza sovrascrivere le vecchie partecipazioni', async () => {
    await runImport()
    const oldEvent=state.tables.eventi.find(row=>row.nome_evento==='MAGGIO')!
    const oldRows=state.tables.partecipazioni_eventi.filter(row=>row.evento_id===oldEvent.id)
    const response=await POST(new Request('http://localhost/api/sheets/import',{method:'POST',body:JSON.stringify({spreadsheetId:'test-spreadsheet-1234567890',selectedSheets:['USCITE'],selectedTables:['partecipazioni_eventi'],mappings:[],annoScout:'2026-2027',eventAccountingDate:'2027-05-20'})}))
    expect(response.status).toBe(200)
    expect(state.tables.eventi.filter(row=>row.nome_evento==='MAGGIO')).toHaveLength(2)
    expect(oldEvent.data_inizio).toBe('2026-07-20')
    expect(state.tables.partecipazioni_eventi.filter(row=>row.evento_id===oldEvent.id)).toEqual(oldRows)
  })
  it('preserva quote zero e non sovrascrive rettifiche con pagamenti senza metodo', async () => {
    state.sheets.CI[0].push('QUOTA')
    state.sheets.CI[1] = ['1', 'Mario Rossi', 'true', '', '0']
    await runImport()
    const ci = state.tables.eventi.find(row => row.tipo_evento === 'CI')!
    const participation = state.tables.partecipazioni_eventi.find(row => row.evento_id === ci.id)!
    expect(participation.quota_dovuta).toBe(0)
    expect(participation.riscosso).toBe(true)
    expect(participation.metodo_pagamento).toBeNull()
    state.sheets.CI[1][4] = ''
    const result = await runImport()
    expect(participation.quota_dovuta).toBe(0)
    expect(result.results.find((row: { sheetName: string }) => row.sheetName === 'CI').warning).toContain('metodo')
  })
  it('importa la causale dalle note senza duplicare e mantiene sospese le spese senza data', async () => {
    state.sheets.SPESE = [
      ['VOCE DI SPESA', 'DATA', 'IMPORTO', 'MOMENTO ANNO', 'CARTA', 'NOTE:'],
      ['', '01/08/2026', '25', 'CE', 'CONTANTI', 'PEDAGGIO ELENA'],
      ['', '24/07/2026', '110,57', 'CE', 'CONTANTI', 'BENZINA CAMION RITORNO 2'],
      ['Altro', '', '900', 'CE', 'CARTA', 'CAMPO ESTIVO'],
    ]
    await runImport()
    await runImport()
    expect(state.tables.registro_spese).toHaveLength(2)
    expect(state.tables.registro_spese.map(row => row.voce_spesa)).toEqual(['PEDAGGIO ELENA', 'BENZINA CAMION RITORNO 2'])
    expect(state.tables.registro_spese.reduce((sum, row) => sum + Number(row.importo), 0)).toBe(135.57)
  })
  it.skipIf(!process.env.SCOUT_IMPORT_FIXTURE)('verifica il foglio condiviso contro un database in memoria', async () => {
    const bytes = readFileSync(process.env.SCOUT_IMPORT_FIXTURE!)
    state.sheets = parsePublicWorkbook(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
    state.tables.ragazzi = state.sheets.CENSIMENTO.slice(1).filter(row => row[1]?.trim().includes(' ')).map((row, i) => {
      const [nome, ...cognome] = row[1].trim().split(/\s+/)
      return { id: `person-${i}`, nome, cognome: cognome.join(' ') }
    })
    state.tables.ragazzi = state.tables.ragazzi.filter((row, index, all) => all.findIndex(other => other.nome === row.nome && other.cognome === row.cognome) === index)
    await runImport()
    expect(state.tables.registro_spese).toHaveLength(157)
    expect(state.tables.registro_spese.filter(row => row.metodo === 'Carta')).toHaveLength(57)
    expect(state.tables.registro_spese.filter(row => row.metodo === 'Contanti')).toHaveLength(100)
    expect(state.tables.registro_spese.find(row => String(row.note).startsWith('[Google Sheets:SPESE:89]'))?.importo).toBe(1.2)
    expect(state.tables.eventi).toHaveLength(15)
    const ce = state.tables.eventi.find(row => row.tipo_evento === 'CE')!
    const campRows = state.tables.partecipazioni_eventi.filter(row => row.evento_id === ce.id)
    expect(campRows.filter(row => row.quota_dovuta === 190)).toHaveLength(22)
    expect(campRows.filter(row => row.quota_dovuta === 180)).toHaveLength(7)
  })
  it('legge colonne numerate, intestazioni duplicate e metodi testuali', () => {
    const map = buildKnownSheetMapping('SPESE', state.sheets.SPESE[0])!
    expect(createSheetReader(state.sheets.SPESE[0], state.sheets.SPESE[1], map.columnsMap)('metodo')).toBe('CARTA')
    const events = buildKnownSheetMapping('USCITE', state.sheets.USCITE[0])!
    expect(Object.values(events.columnsMap)).toContain('evento:MAGGIO (2)')
  })
  it('importa metodi, tutti gli eventi e campi con quote individuali; reimporta senza duplicare', async () => {
    await runImport()
    expect(state.tables.registro_spese.map(row => row.metodo)).toEqual(['Carta', 'Bonifico'])
    expect(state.tables.eventi.map(row => row.nome_evento)).toEqual(['MAGGIO', 'MAGGIO (2)', 'CHIUSURA', 'Campo invernale 2025-2026', 'Campo estivo 2025-2026'])
    expect(state.tables.eventi.slice(-2).map(row => row.tipo_evento)).toEqual(['CI', 'CE'])
    expect(state.tables.eventi.every(row => row.data_inizio === '2026-07-20')).toBe(true)
    expect(state.tables.partecipazioni_eventi.map(row => row.quota_dovuta)).toEqual([15, 20, 100, 190, 180])
    expect(state.tables.partecipazioni_eventi.slice(-2).map(row => row.metodo_pagamento)).toEqual(['Bonifico', 'Contanti'])
    await runImport()
    expect(state.tables.eventi).toHaveLength(5)
    expect(state.tables.registro_spese).toHaveLength(2)
    expect(state.tables.partecipazioni_eventi).toHaveLength(5)
  })
  it('non stima la quota CE se la cella è vuota e segnala la riga', async () => {
    state.sheets.CE[2][5] = ''
    const result = await runImport()
    expect(result.results.find((row: { sheetName: string }) => row.sheetName === 'CE').skipped).toBe(1)
    expect(state.tables.partecipazioni_eventi).toHaveLength(4)
  })
  it('non trasforma un metodo sconosciuto in contanti', async () => {
    state.sheets.SPESE[1][5] = 'da verificare'
    const result = await runImport()
    expect(state.tables.registro_spese).toHaveLength(1)
    expect(result.results.find((row: { sheetName: string }) => row.sheetName === 'SPESE').warning).toContain('metodo')
  })
  it('non crea eventi dalle colonne di riepilogo', () => {
    const mapping = buildKnownSheetMapping('USCITE', ['ID', 'NOME', 'MAGGIO', 'QUOTA', 'RISCOSSO', 'SALDO TOTALE', 'QUOTE VERSATE'])!
    expect(Object.values(mapping.columnsMap).filter(value => value.startsWith('evento:'))).toEqual(['evento:MAGGIO'])
  })
  it('preserva valori misti, date e intestazioni oltre AZ nel trasporto pubblico', () => {
    const row = Array(60).fill('')
    row[0] = true; row[1] = 'CARTA'; row[2] = new Date('2026-07-04T00:00:00Z'); row[59] = 'EVENTO FINALE'
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Flag', 'Metodo', 'Data'], row]), 'SPESE')
    const parsed = parsePublicWorkbook(XLSX.write(book, { type: 'array', bookType: 'xlsx' }))
    expect(parsed.SPESE[1][0]).toBe('true')
    expect(parsed.SPESE[1][1]).toBe('CARTA')
    expect(parsed.SPESE[1][2]).toBe('2026-07-04')
    expect(parsed.SPESE[1][59]).toBe('EVENTO FINALE')
  })
})
