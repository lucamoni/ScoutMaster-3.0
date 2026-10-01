import { describe, expect, it } from 'vitest'
import { dateInWorkingYear, validWorkingYear, workingYearSettings } from './workingYear'
import { getAccountingPeriod } from './accounting'

describe('anno scout di lavoro', () => {
  it('accetta anni consecutivi e rifiuta valori incompleti o manomessi', () => {
    expect(validWorkingYear('2025/2026')).toBe('2025-2026')
    for (const value of ['', '2025-2027', 'x', '1800-1801']) expect(validWorkingYear(value)).toBeNull()
  })
  it('separa i saldi storici e non riutilizza il saldo iniziale di un altro anno', () => {
    const settings = new Map([['saldo_iniziale_anno', '2025-2026'], ['saldo_iniziale_contanti', '1000'], ['saldo_iniziale_banca', '347.02'], ['saldo_iniziale_cassa_2024-2025', '200']])
    expect(getAccountingPeriod(workingYearSettings(settings, '2025-2026'), '2025-2026').initialCash).toBe(1000)
    expect(getAccountingPeriod(workingYearSettings(settings, '2024-2025'), '2024-2025')).toMatchObject({ initialCash: 200, initialBank: 0 })
    expect(getAccountingPeriod(workingYearSettings(settings, '2026-2027'), '2026-2027')).toMatchObject({ initialCash: 0, initialBank: 0 })
    expect(settings.get('saldo_iniziale_contanti')).toBe('1000')
  })
  it('include gli estremi dell’anno scout e separa il primo ottobre', () => {
    expect(dateInWorkingYear('2025-10-01', '2025-2026')).toBe(true)
    expect(dateInWorkingYear('2026-09-30', '2025-2026')).toBe(true)
    expect(dateInWorkingYear('2026-10-01', '2025-2026')).toBe(false)
  })
})
