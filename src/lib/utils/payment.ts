export type MetodoPagamento = 'Contanti' | 'Bonifico' | 'Carta'

/**
 * Converte qualsiasi variante di stringa relativa al metodo di pagamento
 * al valore canonico standard ('Contanti' | 'Bonifico' | 'Carta').
 */
export function toCanonicalMetodo(
  rawMetodo?: string | null,
  fallback: MetodoPagamento = 'Contanti'
): MetodoPagamento {
  if (!rawMetodo) return fallback
  const s = String(rawMetodo).trim().toUpperCase()
  if (s.includes('BONIF') || s.includes('BANC') || s.includes('BB') || s.includes('TRANSFER')) {
    return 'Bonifico'
  }
  if (s.includes('CART') || s.includes('POS')) {
    return 'Carta'
  }
  if (s === 'CONTANTI' || s === 'CONTANTE' || s === 'CASH') {
    return 'Contanti'
  }
  if (s === 'BONIFICO') return 'Bonifico'
  if (s === 'CARTA') return 'Carta'
  return fallback
}

/**
 * Normalizza le stringhe dell'anno scout (es. '2025/2026' -> '2025-2026')
 */
export function normalizeAnnoScout(raw?: string | null): string {
  if (!raw) return '2025-2026'
  return String(raw).trim().replace('/', '-')
}
