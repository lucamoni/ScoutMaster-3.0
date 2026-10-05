import { describe, expect, it } from 'vitest'
import { getIndividualMonthlyQuotaAmount, getMonthlyQuotaAccountingDate, getMonthlyQuotaAmount } from './monthlyQuota'

describe('tariffe mensili per anno scout', () => {
  it('mantiene 240 quote storiche da 8 euro anche con tariffa corrente da 10', () => {
    const settings = new Map([['quota_mensile_standard', '10'], ['quota_mensile_standard_2025-2026', '8']])
    expect(getMonthlyQuotaAmount(settings, '2025/2026') * 240).toBe(1920)
    expect(getMonthlyQuotaAmount(settings, '2026-2027')).toBe(10)
  })

  it('supporta gli anni legacy, la virgola e una tariffa gratuita esplicita', () => {
    expect(getMonthlyQuotaAmount(new Map([['quota_mensile_standard_2025/2026', '8,00']]), '2025-2026')).toBe(8)
    expect(getMonthlyQuotaAmount(new Map([['quota_mensile_standard', '10'], ['quota_mensile_standard_2025-2026', '0']]), '2025-2026')).toBe(0)
    expect(getIndividualMonthlyQuotaAmount([{ importo_mensile: 0 }], 10)).toBe(0)
  })

  it('ignora tariffe non numeriche o negative e mantiene la quota individuale importata', () => {
    expect(getMonthlyQuotaAmount(new Map([['quota_mensile_standard_2025-2026', '-8'], ['quota_mensile_standard', '12']]), '2025-2026')).toBe(12)
    expect(getMonthlyQuotaAmount(new Map([['quota_mensile_standard', 'errore']]), '2025-2026')).toBe(10)
    expect(getIndividualMonthlyQuotaAmount([{ importo_mensile: null }, { importo_mensile: 8 }], 10)).toBe(8)
  })
})

describe('date contabili delle mensilità', () => {
  const today = new Date('2026-10-05T12:00:00Z')
  it('riporta l’importazione storica alla fine del suo anno e rispetta la data esplicita', () => {
    expect(getMonthlyQuotaAccountingDate('2025-2026', null, today)).toBe('2026-09-30')
    expect(getMonthlyQuotaAccountingDate('2025/2026', '2026-05-10', today)).toBe('2026-05-10')
    expect(getMonthlyQuotaAccountingDate('2025-2026', '2026-10-05', today)).toBe('2026-09-30')
    expect(getMonthlyQuotaAccountingDate('2025-2026', '2026-02-31', today)).toBe('2026-09-30')
  })
  it('mantiene la data attuale per pagamenti dell’anno in corso', () => {
    expect(getMonthlyQuotaAccountingDate('2026-2027', null, today)).toBe('2026-10-05')
  })
})
