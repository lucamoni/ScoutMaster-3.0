import { getCurrentAnnoScout, normalizeAnnoScout } from './payment'

export const WORKING_YEAR_COOKIE = 'scoutmaster-working-year'
export function validWorkingYear(value?: string | null) {
  const year = normalizeAnnoScout(value || '')
  const match = year.match(/^(\d{4})-(\d{4})$/)
  return value && match && Number(match[2]) === Number(match[1]) + 1 && Number(match[1]) >= 1900 && Number(match[1]) <= 2200 ? year : null
}
export function workingYearSettings<T extends string | null>(settings: Map<string, T>, selected: string) {
  const next = new Map<string, string | null>(settings)
  const legacyYear = validWorkingYear(settings.get('saldo_iniziale_anno')) || validWorkingYear(settings.get('anno_scout_corrente')) || getCurrentAnnoScout()
  if (selected !== legacyYear) {
    next.delete('saldo_iniziale_contanti')
    next.delete('saldo_iniziale_banca')
  }
  next.set('anno_scout_corrente', selected)
  return next
}
export function dateInWorkingYear(date: string | null, year: string) {
  const [start, end] = year.split('-')
  return !!date && date >= `${start}-10-01` && date <= `${end}-09-30`
}
