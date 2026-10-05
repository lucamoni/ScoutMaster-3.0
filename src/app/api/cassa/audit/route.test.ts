import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>, errors: new Set<string>(), writes: [] as string[], year: '2025-2026',
}))
vi.mock('@/lib/annualRoster/server', () => ({ getAnnualBoys: async () => { if(state.errors.has('ragazzi')) throw Error('Ragazzi non disponibili'); return state.tables.ragazzi || [] } }))
vi.mock('@/lib/security/auth', () => ({ requireRole: vi.fn(), authorizationErrorResponse: () => null }))
vi.mock('@/lib/workingYear', () => ({ getWorkingYear: async () => state.year }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (table: string) => {
  let action = 'select'
  let payload: Record<string, unknown> = {}
  let range: [number, number] | undefined
  const filters: Array<(row: Record<string, unknown>) => boolean> = []
  const run = () => {
    if (state.errors.has(table)) return { data: null, error: { message: 'unavailable' } }
    const rows = state.tables[table] ??= []
    const matches = rows.filter(row => filters.every(filter => filter(row)))
    if (action === 'insert') {
      state.writes.push(`insert:${table}`)
      const row = { id: `new-${rows.length}`, ...payload }; rows.push(row)
      return { data: [row], error: null }
    }
    if (action === 'delete') {
      state.writes.push(`delete:${table}`)
      state.tables[table] = rows.filter(row => !matches.includes(row))
    }
    return { data: range ? matches.slice(range[0], range[1] + 1) : matches, error: null }
  }
  const query = {
    select: () => query, order: () => query,
    range: (from: number, to: number) => { range = [from, to]; return query },
    gte: (key: string, value: string) => { filters.push(row => typeof row[key] === 'string' && String(row[key]) >= value); return query },
    lte: (key: string, value: string) => { filters.push(row => typeof row[key] === 'string' && String(row[key]) <= value); return query },
    in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return query },
    insert: (value: Record<string, unknown>) => { action = 'insert'; payload = value; return query },
    delete: () => { action = 'delete'; return query },
    single: async () => { const result = run(); return { ...result, data: result.data?.[0] ?? null } },
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(run()).then(resolve),
  }
  return query
} }) }))
import { POST } from './route'

const movement = (fields: Record<string, unknown> = {}) => ({ id: 'old', data: '2026-09-30', ragazzo_id: 'boy', importo: 10, metodo: 'Contanti', tipo_movimento: 'ENTRATA', quota_mensile_id: null, riferimento_quota: null, voce_spesa: 'Quota Mensile', partecipazione_evento_id: null, foto_scontrino_url: null, note: null, ...fields })
const runAudit = () => POST(new Request('https://example.com/api/cassa/audit', { method: 'POST' }))
beforeEach(() => {
  state.writes = []; state.errors.clear(); state.year = '2025-2026'
  state.tables = {
    impostazioni: [{ chiave: 'anno_scout_corrente', valore: '2026-2027' }, { chiave: 'quota_mensile_standard', valore: '15' }, { chiave: 'saldo_iniziale_cassa_2025-2026', valore: '50' }, { chiave: 'saldo_iniziale_contanti', valore: '999' }],
    ragazzi: [{ id: 'boy', nome: 'Mario', cognome: 'Rossi' }],
    quote_mensili: [{ id: 'quota', anno_scout: '2025/2026', ragazzo_id: 'boy', novembre: true, dicembre: true, importo_mensile: 10, data_contabile: '2026-09-30' }],
    eventi: [], partecipazioni_eventi: [], registro_spese: [], ricevute_movimenti: [], prove_bonifico: [],
  }
})

describe('audit della cassa dell’anno selezionato', () => {
  it('ricrea ogni mese pagato una volta sola, con tariffa e data storiche', async () => {
    state.tables.registro_spese = [movement({ quota_mensile_id: 'quota', riferimento_quota: 'novembre' })]
    await runAudit(); const response = await runAudit(); const result = await response.json()
    expect(state.tables.registro_spese.map(row => row.riferimento_quota)).toEqual(['novembre', 'dicembre'])
    expect(state.tables.registro_spese[1]).toMatchObject({ importo: 10, data: '2026-09-30', metodo: 'Contanti' })
    expect(result.anno_scout).toBe('2025-2026')
    expect(result.report.saldi.totale_generale_cassa).toBe(70)
  })
  it('non confonde mesi, altri anni e righe legacy; esclude censimento dai saldi', async () => {
    state.tables.registro_spese = [
      movement({ id: 'legacy', note: 'Quota NOV - Mario Rossi' }),
      movement({ id: 'last-year', data: '2024-12-01', riferimento_quota: 'dicembre' }),
      movement({ id: 'census', importo: 45, voce_spesa: 'Quota Censimento' }),
      movement({ id: 'expense', importo: 5, tipo_movimento: 'USCITA', metodo: 'Carta' }),
    ]
    const result = await (await runAudit()).json()
    expect(result.report.orfani_ricreati).toBe(1)
    expect(result.report.saldi.dettagli).toEqual({ entrate_contanti: 20, uscite_contanti: 0, entrate_banca: 0, uscite_banca: 5 })
    expect(result.report.saldi.totale_generale_cassa).toBe(65)
  })
  it('preserva le esenzioni e limita gli eventi al periodo selezionato', async () => {
    state.tables.quote_mensili = []
    state.tables.eventi = [
      { id: 'ci', nome_evento: 'Campo invernale', data_inizio: '2026-01-02', quota_standard: 100, tipo_evento: 'CI', metodo_pagamento: 'Bonifico' },
      { id: 'other', nome_evento: 'Altro anno', data_inizio: '2026-10-02', quota_standard: 200, tipo_evento: 'CE' },
    ]
    state.tables.partecipazioni_eventi = [
      { id: 'free', evento_id: 'ci', ragazzo_id: 'boy', riscosso: true, quota_dovuta: 0 },
      { id: 'paid', evento_id: 'ci', ragazzo_id: 'boy', riscosso: true, quota_dovuta: 100, metodo_pagamento: 'Bonifico' },
      { id: 'wrong-year', evento_id: 'other', ragazzo_id: 'boy', riscosso: true, quota_dovuta: 200 },
    ]
    const result = await (await runAudit()).json()
    expect(state.tables.registro_spese).toHaveLength(1)
    expect(state.tables.registro_spese[0]).toMatchObject({ importo: 100, partecipazione_evento_id: 'paid', data: '2026-01-02', momento_anno: 'CI' })
    expect(result.report.saldi.dettagli.entrate_banca).toBe(100)
  })
  it('conserva i documenti e le ricevute emesse anche se una riga precedente era duplicata', async () => {
    state.tables.quote_mensili = []
    state.tables.registro_spese = [
      movement({ id: 'plain', data: '2026-01-01', quota_mensile_id: 'quota', riferimento_quota: 'novembre' }),
      movement({ id: 'issued', quota_mensile_id: 'quota', riferimento_quota: 'novembre' }),
      movement({ id: 'attachment', quota_mensile_id: 'quota', riferimento_quota: 'novembre', foto_scontrino_url: 'file.pdf' }),
      movement({ id: 'proof', quota_mensile_id: 'quota', riferimento_quota: 'novembre' }),
      movement({ id: 'different', quota_mensile_id: 'quota', riferimento_quota: 'novembre', importo: 20 }),
    ]
    state.tables.ricevute_movimenti = [{ movimento_id: 'issued' }]
    state.tables.prove_bonifico = [{ movimento_id: 'proof' }]
    const result = await (await runAudit()).json()
    expect(state.tables.registro_spese.map(row => row.id)).toEqual(['issued', 'attachment', 'proof', 'different'])
    expect(result.report.duplicati_rimossi).toBe(1)
    expect(result.report.duplicati_da_verificare).toBe(3)
  })
  it('interrompe prima di scrivere se una lettura o la protezione dei documenti fallisce', async () => {
    state.tables.registro_spese = [movement()]
    state.errors.add('ricevute_movimenti')
    const response = await runAudit()
    expect(response.status).toBe(500)
    expect(state.writes).toEqual([])
  })
  it('non usa oggi quando la data contabile storica manca o è fuori anno', async () => {
    state.tables.quote_mensili[0].data_contabile = '2026-10-05'
    const result = await (await runAudit()).json()
    expect(state.tables.registro_spese).toHaveLength(0)
    expect(result.warning).toHaveLength(2)
  })
  it('legge tutte le pagine dei movimenti senza troncare il saldo', async () => {
    state.tables.quote_mensili = []
    state.tables.registro_spese = Array.from({ length: 1001 }, (_, i) => movement({ id: `row-${i}`, importo: 1, voce_spesa: 'Raccolta fondi', ragazzo_id: null }))
    const result = await (await runAudit()).json()
    expect(result.report.totale_movimenti_cassa).toBe(1001)
    expect(result.report.saldi.totale_generale_cassa).toBe(1051)
  })
})
