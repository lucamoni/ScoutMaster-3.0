import { toCanonicalMetodo } from './utils/payment'

export const AUDIT_MONTHS = ['novembre', 'dicembre', 'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno'] as const
type Movement = {
  id: string; data: string | null; tipo_movimento: string | null; ragazzo_id: string | null
  quota_mensile_id: string | null; riferimento_quota: string | null; voce_spesa: string | null
  note: string | null; partecipazione_evento_id: string | null; importo: number; metodo: string | null
  foto_scontrino_url: string | null
}
type Period = { startDate: string; endDate: string }

export function validAuditDate(value: unknown, period: Period): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    && value >= period.startDate && value <= period.endDate
}

function matchesMonth(movement: Movement, month: string) {
  if (movement.riferimento_quota) return movement.riferimento_quota.trim().toLowerCase() === month
  if (movement.voce_spesa?.trim().toLowerCase() !== 'quota mensile') return false
  return new RegExp(`\\b(?:${month}|${month.slice(0, 3)})\\b`, 'i').test(movement.note || '')
}

export function hasMonthlyMovement(movements: Movement[], quota: { id: string; ragazzo_id: string | null }, month: string, period: Period) {
  return movements.some(movement => movement.tipo_movimento === 'ENTRATA'
    && movement.ragazzo_id === quota.ragazzo_id && validAuditDate(movement.data, period)
    && matchesMonth(movement, month)
    && (movement.quota_mensile_id === quota.id || !movement.quota_mensile_id))
}

export function auditDuplicateMovements(movements: Movement[], protectedIds: Set<string>) {
  const groups = new Map<string, Movement[]>()
  for (const movement of movements) {
    if (movement.tipo_movimento !== 'ENTRATA') continue
    const key = movement.quota_mensile_id && movement.riferimento_quota
      ? `quota:${movement.quota_mensile_id}:${movement.riferimento_quota.toLowerCase()}`
      : movement.partecipazione_evento_id ? `evento:${movement.partecipazione_evento_id}` : null
    if (key) groups.set(key, [...(groups.get(key) || []), movement])
  }
  const isProtected = (movement: Movement) => protectedIds.has(movement.id) || Boolean(movement.foto_scontrino_url)
  const ids: string[] = []
  let review = 0
  for (const group of groups.values()) {
    group.sort((a, b) => Number(isProtected(b)) - Number(isProtected(a)) || (a.data || a.id).localeCompare(b.data || b.id) || a.id.localeCompare(b.id))
    const keeper = group[0]
    for (const duplicate of group.slice(1)) {
      const knownMethod = (value: string | null) => value && /CONTANT|CASH|BONIF|BANC|TRANSFER|CART|POS|^BB$/i.test(value)
      if (isProtected(duplicate) || duplicate.importo !== keeper.importo || !knownMethod(duplicate.metodo) || !knownMethod(keeper.metodo)
        || toCanonicalMetodo(duplicate.metodo) !== toCanonicalMetodo(keeper.metodo)) review++
      else ids.push(duplicate.id)
    }
  }
  return { ids, review }
}
