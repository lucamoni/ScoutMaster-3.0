import { normalizeAnnoScout } from './payment'

/** Historical tariffs take precedence over the current general default. */
export function getMonthlyQuotaAmount(settings: Map<string, string | null>, year: string): number {
  const canonicalYear = normalizeAnnoScout(year)
  for (const key of [`quota_mensile_standard_${canonicalYear}`, `quota_mensile_standard_${canonicalYear.replace('-', '/')}`, 'quota_mensile_standard']) {
    const value = settings.get(key)?.trim()
    if (!value || !/^\d+(?:[.,]\d+)?$/.test(value)) continue
    const amount = Number(value.replace(',', '.'))
    if (Number.isFinite(amount) && amount >= 0) return amount
  }
  return 10
}

export function getIndividualMonthlyQuotaAmount(records: Array<{ importo_mensile?: number | null }>, fallback: number): number {
  for (const record of records) {
    if (record.importo_mensile == null) continue
    if (Number.isFinite(record.importo_mensile) && record.importo_mensile >= 0) return record.importo_mensile
  }
  return Number.isFinite(fallback) && fallback >= 0 ? fallback : 0
}

/** Imported historical payments belong to their declared year, even when entered later. */
export function getMonthlyQuotaAccountingDate(year: string, sourceDate?: string | null, today = new Date()): string {
  const normalizedYear = normalizeAnnoScout(year)
  const [start, end] = normalizedYear.split('-')
  const startDate = `${start}-10-01`
  const endDate = `${end}-09-30`
  const withinYear = (date?: string | null) => {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < startDate || date > endDate) return false
    const parsed = new Date(`${date}T00:00:00Z`)
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
  }
  if (withinYear(sourceDate)) return sourceDate!
  const currentDate = today.toISOString().slice(0, 10)
  return withinYear(currentDate) ? currentDate : endDate
}
