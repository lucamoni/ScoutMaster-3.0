vi.mock('@/lib/annualRoster/server', () => ({ getAnnualBoys: vi.fn().mockResolvedValue([]) }))
import { expect, it, vi } from 'vitest'
import type { Tables } from '@/types/database.types'
import { buildScoutBotContext, readAllRows } from './context'
import { answerFromData, modelContext } from './answers'

const person = (id: string, extras = {}) => ({ id, nome: id, cognome: 'Test', attivo: true, pattuglia: 'Aquile', quota_censimento: true, importo_censimento: 50, ...extras }) as Tables<'ragazzi'>
const event = (id: string, extras = {}) => ({ id, nome_evento: id, data_inizio: '2025-12-28', tipo_evento: 'CI', quota_standard: 100, metodo_pagamento: 'Bonifico', ...extras }) as Tables<'eventi'>
const attendance = (id: string, extras = {}) => ({ id, evento_id: 'Campo invernale', ragazzo_id: id, stato_presenza: 'PRESENTE', quota_dovuta: 100, riscosso: true, metodo_pagamento: 'Bonifico', scheda_medica_consegnata: true, ...extras }) as Tables<'partecipazioni_eventi'>
const movement = (id: string, extras = {}) => ({ id, data: '2025-11-01', tipo_movimento: 'USCITA', importo: 10, metodo: 'Contanti', voce_spesa: 'Materiale', momento_anno: 'ANNO', note: '', riferimento_censimento_anno: null, ...extras }) as Tables<'registro_spese'>
const facts = (extras = {}) => buildScoutBotContext({ year: '2025-2026', settings: new Map([['saldo_iniziale_cassa_2025-2026', '1000'], ['saldo_iniziale_banca_2025-2026', '200']]), people: [], events: [], participations: [], movements: [], quotes: [], today: new Date('2026-10-05T12:00:00Z'), ...extras })

it('risponde alla domanda dell’utente con numero uscite e importo, senza saldo o ragazzi', () => {
  const context = facts({ movements: Array.from({ length: 120 }, (_, i) => movement(String(i))) })
  const answer = answerFromData('quante uscite ci sono in cassa?', context)!
  expect(answer).toContain('120 movimenti in uscita')
  expect(answer).toMatch(/1\.?200,00/)
  expect(answer).not.toMatch(/saldo|ragazzi/i)
})
it('include saldi iniziali, distingue contanti e banca ed esclude censimento e movimenti fuori anno', () => {
  const context = facts({ movements: [movement('cash'), movement('bank', { metodo: 'Bonifico', importo: 20 }), movement('income', { tipo_movimento: 'ENTRATA', importo: 50 }), movement('census', { tipo_movimento: 'ENTRATA', importo: 100, riferimento_censimento_anno: '2025-2026' }), movement('old', { data: '2024-11-01', importo: 999 }), movement('undated', { data: null, importo: 999 })] })
  expect(context.cassa).toMatchObject({ entrate: 50, uscite: 30, saldoFinaleCassa: 1040, saldoFinaleBanca: 180, saldoFinaleTotale: 1220, movimenti: 3 })
  expect(context.dati_da_verificare.movimenti_senza_data).toBe(1)
  expect(answerFromData('quante uscite ci sono in cassa?', context)).toContain('2 movimenti in uscita')
})
it('non usa i saldi globali dell’anno attuale per un altro anno senza saldo registrato', () => {
  expect(facts({ settings: new Map([['anno_scout_corrente', '2026-2027'], ['saldo_iniziale_contanti', '999']]) }).cassa.saldoFinaleTotale).toBe(0)
})
it('segue il metodo di pagamento e la categoria richiesti senza sostituire un totale generico', () => {
  const context = facts({ movements: [movement('1', { note: 'pane' }), movement('2', { metodo: 'Bonifico', note: 'benzina' })] })
  expect(answerFromData('E quelle in bonifico?', context, 'Quante uscite ci sono in cassa?')).toContain('1 movimenti in uscita')
  expect(answerFromData('quanto abbiamo speso per pane?', context)).toContain('1 movimenti in uscita')
  expect(answerFromData('quanto abbiamo speso per pizza?', context)).toBeNull()
})
it('non confonde presenti, quote saldate e gratuiti: 26 bonifici, 2 contanti, 2 a zero', () => {
  const people = Array.from({ length: 30 }, (_, i) => person(String(i)))
  const participations = people.map((p, i) => attendance(p.id, i >= 28 ? { quota_dovuta: 0, riscosso: false } : i >= 26 ? { metodo_pagamento: 'Contanti' } : {}))
  const context = facts({ people, events: [event('Campo invernale')], participations })
  expect(context.eventi[0]).toMatchObject({ presenti: 30, incassato: 2800, da_incassare: 0, gratuiti: 2 })
  expect(answerFromData('chi ha pagato il campo invernale in bonifico?', context)).toContain('**26**')
  expect(answerFromData('chi ha pagato il campo invernale in contanti?', context)).toContain('**2**')
})
it('non sceglie un evento arbitrario se ci sono più campi e rispetta quote mensili per anno e scadenza', () => {
  const context = facts({ people: [person('Luca')], events: [event('Campo uno'), event('Campo due')] })
  expect(answerFromData('quanti al campo invernale?', context)).toContain('Quale intendi?')
  expect(context.ragazzi[0].mensili_da_pagare).toBe(80)
  const future = facts({ year: '2026-2027', people: [person('Luca')] })
  expect(future.ragazzi[0].mensili_da_pagare).toBe(0)
})
it('legge tutte le pagine e rifiuta risultati incompleti invece di considerarli zero', async () => {
  const read = vi.fn().mockResolvedValueOnce({ data: Array.from({ length: 500 }, (_, i) => i), error: null }).mockResolvedValueOnce({ data: [500], error: null })
  expect(await readAllRows(read)).toHaveLength(501)
  expect(read).toHaveBeenNthCalledWith(2, 500, 999)
  await expect(readAllRows(async () => ({ data: null, error: new Error('database') }))).rejects.toThrow('database')
})
it('distingue dati vuoti ed esempi parziali da conteggi completi', () => {
  expect(answerFromData('quante uscite ci sono in cassa?', facts())).toContain('0 movimenti in uscita')
  const context = facts({ movements: Array.from({ length: 60 }, (_, i) => movement(String(i))) })
  expect(modelContext(context, 'situazione generale').movimenti).toHaveLength(30)
  expect(modelContext(context, 'situazione generale').cassa.movimenti).toBe(60)
})
