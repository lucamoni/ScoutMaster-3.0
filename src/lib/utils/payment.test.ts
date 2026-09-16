import { describe, expect, it } from 'vitest'
import { normalizeAnnoScout, toCanonicalMetodo } from './payment'

describe('normalizzazione dati contabili', () => {
  it('uniforma i metodi di pagamento legacy', () => {
    expect(toCanonicalMetodo('bonifico bancario')).toBe('Bonifico')
    expect(toCanonicalMetodo('POS')).toBe('Carta')
    expect(toCanonicalMetodo('cash')).toBe('Contanti')
  })

  it('accetta solo esercizi scout consecutivi', () => {
    expect(normalizeAnnoScout('2025/2026')).toBe('2025-2026')
    expect(normalizeAnnoScout('2025-2027')).toBe('2025-2027') // conservato per dati legacy da correggere
  })
})
