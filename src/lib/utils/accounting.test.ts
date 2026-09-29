import { describe, expect, it } from 'vitest'
import { calculateAccountingBalances, getAccountingPeriod } from './accounting'
import { annoScoutVariants, getCurrentAnnoScout, normalizeAnnoScout, toCanonicalMetodo } from './payment'
import { isIncludedInAccounting } from './censusAccounting'

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
  it('esclude il censimento saldato per default e lo include solo con consenso, senza perdere movimenti', () => {
    const movements = [
      { importo: 50, metodo: 'Contanti', tipo_movimento: 'ENTRATA', riferimento_censimento_anno: '2025-2026' },
      { importo: 35, metodo: 'Bonifico', tipo_movimento: 'ENTRATA', riferimento_censimento_anno: '2025-2026' },
      { importo: 20, metodo: 'Carta', tipo_movimento: 'ENTRATA', voce_spesa: 'Uscita di reparto' },
      { importo: 10, metodo: 'Contanti', tipo_movimento: 'USCITA', voce_spesa: 'Versamento censimento' },
    ]
    const before = structuredClone(movements)
    const excluded = calculateAccountingBalances(movements, 100, 200)
    expect(excluded.entrateContanti).toBe(0)
    expect(excluded.entrateBanca).toBe(20)
    expect(excluded.saldoFinaleTotale).toBe(310)
    const included = calculateAccountingBalances(movements, 100, 200, true)
    expect(included.entrateContanti).toBe(50)
    expect(included.entrateBanca).toBe(55)
    expect(included.saldoFinaleTotale).toBe(395)
    expect(calculateAccountingBalances(movements, 100, 200, false)).toEqual(excluded)
    expect(movements).toEqual(before)
  })

  it('filtra anche le vecchie quote censimento, senza escludere altre entrate o uscite', () => {
    expect(isIncludedInAccounting({ tipo_movimento: 'ENTRATA', voce_spesa: 'Quota Censimento' })).toBe(false)
    expect(isIncludedInAccounting({ tipo_movimento: 'ENTRATA', voce_spesa: 'Quota Censimento' }, true)).toBe(true)
    expect(isIncludedInAccounting({ tipo_movimento: 'ENTRATA', voce_spesa: 'Donazione per censimento' })).toBe(true)
    expect(isIncludedInAccounting({ tipo_movimento: 'USCITA', voce_spesa: 'Quota Censimento' })).toBe(true)
  })

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

describe('impostazioni contabili condivise', () => {
  it('dà precedenza al saldo annuale anche se zero, con compatibilità degli anni legacy', () => {
    const period = getAccountingPeriod(new Map([
      ['anno_scout_corrente', '2026/2027'], ['saldo_iniziale_contanti', '999'],
      ['saldo_iniziale_cassa_2026-2027', '0'], ['saldo_iniziale_banca_2026/2027', '120'],
    ]), '2025-2026')
    expect(period).toEqual({ currentYear: '2026-2027', startDate: '2026-10-01', endDate: '2027-09-30', initialCash: 0, initialBank: 120 })
  })
})
