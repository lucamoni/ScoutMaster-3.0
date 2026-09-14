export type MetodoPagamento = 'Contanti' | 'Bonifico' | 'Carta'

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
  return fallback
}

export function getCurrentAnnoScout(referenceDate = new Date()): string {
  const year = referenceDate.getFullYear()
  return referenceDate.getMonth() >= 8
    ? `${year}-${year + 1}`
    : `${year - 1}-${year}`
}

export function normalizeAnnoScout(raw?: string | null): string {
  if (!raw) return getCurrentAnnoScout()

  const normalized = String(raw)
    .trim()
    .replace(/[\s/]+/g, '-')

  const match = normalized.match(/^(\d{4})-(\d{4})$/)
  return match ? `${match[1]}-${match[2]}` : normalized
}

export function annoScoutVariants(raw?: string | null): string[] {
  const canonical = normalizeAnnoScout(raw)
  return [canonical, canonical.replace('-', '/')]
}
