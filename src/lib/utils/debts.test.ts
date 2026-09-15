import { describe, expect, it } from 'vitest'
import { calculateScoutDebt, getScoutMonthsUpTo } from './debts'

const scout = { id: 'scout-1', quota_censimento: false, importo_censimento: null }

describe('mensilità scout esigibili', () => {
  it('non chiede mensilità prima di novembre', () => {
    expect(getScoutMonthsUpTo(new Date(2026, 9, 31))).toEqual([])
  })

  it('include progressivamente novembre-giugno', () => {
    expect(getScoutMonthsUpTo(new Date(2026, 10, 1))).toEqual(['novembre'])
    expect(getScoutMonthsUpTo(new Date(2027, 0, 1))).toEqual(['novembre', 'dicembre', 'gennaio'])
    expect(getScoutMonthsUpTo(new Date(2027, 6, 1))).toHaveLength(8)
  })
})

describe('calcolo pendenze', () => {
  it('somma solo mensilità, censimento ed eventi non pagati', () => {
    const result = calculateScoutDebt({
      scout,
      quote: [{ ragazzo_id: scout.id, anno_scout: '2026/2027', novembre: true, dicembre: false }],
      events: [{ id: 'event-1', nome_evento: 'Campo', quota_standard: 40 }],
      participations: [
        { ragazzo_id: scout.id, evento_id: 'event-1', riscosso: false, quota_dovuta: 35 },
        { ragazzo_id: scout.id, evento_id: 'event-2', riscosso: true, quota_dovuta: 100 },
      ],
      currentYear: '2026-2027',
      activeMonths: ['novembre', 'dicembre'],
      monthlyFee: 10,
      censusFee: 45,
    })

    expect(result.unpaidMonths).toEqual(['dicembre'])
    expect(result.quoteDebt).toBe(10)
    expect(result.eventiDebt).toBe(35)
    expect(result.censimentoDebt).toBe(45)
    expect(result.totalDebt).toBe(90)
    expect(result.pendenzeCount).toBe(3)
  })

  it('rispetta quota evento standard, censimento personalizzato e importi zero', () => {
    const result = calculateScoutDebt({
      scout: { ...scout, importo_censimento: 30 },
      quote: [],
      events: [{ id: 'event-1', nome_evento: 'Uscita', quota_standard: 20 }],
      participations: [{ ragazzo_id: scout.id, evento_id: 'event-1', riscosso: false, quota_dovuta: null }],
      currentYear: '2026-2027',
      activeMonths: [],
      monthlyFee: 10,
      censusFee: 45,
    })

    expect(result.eventiDebt).toBe(20)
    expect(result.censimentoDebt).toBe(30)
    expect(result.totalDebt).toBe(50)
  })

  it('non propaga NaN o importi negativi nei totali', () => {
    const result = calculateScoutDebt({
      scout: { ...scout, importo_censimento: -5 },
      quote: [],
      events: [{ id: 'event-1', nome_evento: 'Uscita', quota_standard: 15 }],
      participations: [{ ragazzo_id: scout.id, evento_id: 'event-1', riscosso: false, quota_dovuta: Number.NaN }],
      currentYear: '2026-2027',
      activeMonths: ['novembre'],
      monthlyFee: Number.NaN,
      censusFee: 45,
    })

    expect(result.quoteDebt).toBe(0)
    expect(result.eventiDebt).toBe(15)
    expect(result.censimentoDebt).toBe(45)
    expect(result.totalDebt).toBe(60)
  })
})
