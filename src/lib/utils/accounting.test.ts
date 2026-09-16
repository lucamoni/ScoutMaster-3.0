import { describe, expect, it } from 'vitest'
import { calculateAccountingBalances } from './accounting'
import { annoScoutVariants, getCurrentAnnoScout, normalizeAnnoScout, toCanonicalMetodo } from './payment'

describe('anno scout', () => {
  it('cambia esercizio il primo ottobre', () => {
    expect(getCurrentAnnoScout(new Date(2026, 8, 30))).toBe('2025-2026')
    expect(getCurrentAnnoScout(new Date(2026, 9, 1))).toBe('2026-2027')
  })

  it('normalizza i dati legacy senza perdere la compatibilità', () => {
    expect(normalizeAnnoScout(' 2025 / 2026 ')).toBe('2025-2026')
    expect(annoScoutVariants('2025/2026')).toEqual(['2025-2026', '2025/2026'])
  })
})

describe('metodi di pagamento', () => {
  it.each([
    ['cash', 'Contanti'],
    ['bonifico bancario', 'Bonifico'],
    ['POS', 'Carta'],
  ])('converte %s in %s', (input, expected) => {
    expect(toCanonicalMetodo(input)).toBe(expected)
  })
})

describe('riconciliazione contabile', () => {
  it('separa cassa e banca e conserva i saldi iniziali', () => {
    const result = calculateAccountingBalances([
      { importo: 100, metodo: 'Contanti', tipo_movimento: 'ENTRATA' },
      { importo: 25, metodo: 'cash', tipo_movimento: 'USCITA' },
      { importo: 80, metodo: 'Bonifico', tipo_movimento: 'ENTRATA' },
      { importo: 30, metodo: 'Carta', tipo_movimento: 'USCITA' },
    ], 10, 20)

    expect(result.saldoFinaleCassa).toBe(85)
    expect(result.saldoFinaleBanca).toBe(70)
    expect(result.saldoFinaleTotale).toBe(155)
    expect(result.risultatoEsercizio).toBe(125)
  })

  it('ignora importi non validi e movimenti senza tipo contabile', () => {
    const result = calculateAccountingBalances([
      { importo: Number.NaN, metodo: 'Contanti', tipo_movimento: 'ENTRATA' },
      { importo: -10, metodo: 'Contanti', tipo_movimento: 'USCITA' },
      { importo: 50, metodo: 'Contanti', tipo_movimento: null },
    ])

    expect(result.saldoFinaleTotale).toBe(0)
  })
})
