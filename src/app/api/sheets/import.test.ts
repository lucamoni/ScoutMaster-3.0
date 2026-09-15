import { describe, expect, it } from 'vitest'
import { parseSheetAmount, parseSheetDate } from '../../../lib/googleSheetsImport'

describe('parsing Google Sheets', () => {
  it('legge importi italiani e rifiuta valori non positivi', () => {
    expect(parseSheetAmount('1.234,56')).toBe(1234.56)
    expect(parseSheetAmount('€ 20,50')).toBe(20.5)
    expect(parseSheetAmount('-2,00')).toBeNull()
    expect(parseSheetAmount('non disponibile')).toBeNull()
  })

  it('normalizza le date italiane e ISO valide', () => {
    expect(parseSheetDate('15/09/2026')).toBe('2026-09-15')
    expect(parseSheetDate('2026-09-15')).toBe('2026-09-15')
    expect(parseSheetDate('31/02/2026')).toBeNull()
    expect(parseSheetDate('non disponibile')).toBeNull()
  })
})
