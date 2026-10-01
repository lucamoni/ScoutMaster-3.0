import type { Database } from '@/types/database.types'
import { dateInWorkingYear } from '@/lib/utils/workingYear'
import { normalizeAnnoScout } from '@/lib/utils/payment'
import { getScoutMonthsUpTo } from '@/lib/utils/debts'

type Person = Database['public']['Tables']['ragazzi']['Row']
type Quote = Database['public']['Tables']['quote_mensili']['Row']
type Event = Database['public']['Tables']['eventi']['Row']
type Participation = Database['public']['Tables']['partecipazioni_eventi']['Row']

export type ReminderItem = { id: string; label: string; kind: 'quota' | 'evento' | 'modulo' }
export type ReminderPerson = {
  id: string
  name: string
  parent1: { name: string; phone: string | null }
  parent2: { name: string; phone: string | null }
  items: ReminderItem[]
}

export function dueMonths(year: string, today: Date) {
  return getScoutMonthsUpTo(today, year)
}

export function buildReminderPeople(people: Person[], quotes: Quote[], events: Event[], participations: Participation[], year: string, today = new Date()): ReminderPerson[] {
  const relevantEvents = new Map(events.filter(event => dateInWorkingYear(event.data_inizio, year)).map(event => [event.id, event]))
  const due = dueMonths(year, today)
  return people.filter(person => person.attivo).map(person => {
    const scoutQuotes = quotes.filter(row => row.ragazzo_id === person.id && normalizeAnnoScout(row.anno_scout) === normalizeAnnoScout(year))
    const items: ReminderItem[] = due.filter(month => !scoutQuotes.some(quote => quote[month] === true)).map(month => ({ id: `quota:${person.id}:${month}`, kind: 'quota' as const, label: `quota di ${month}` }))
    if (person.quota_censimento !== true) items.push({ id: `quota:${person.id}:censimento`, kind: 'quota', label: 'quota censimento' })
    const attendances = participations.filter(row => row.ragazzo_id === person.id && relevantEvents.has(row.evento_id || ''))
    for (const attendance of attendances) {
      const event = relevantEvents.get(attendance.evento_id || '')!
      const present = ['PRESENTE', 'PENDOLARE'].includes((attendance.stato_presenza || '').toUpperCase())
      const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      if (present && !attendance.riscosso && Number(attendance.quota_dovuta) > 0 && event.data_inizio && event.data_inizio <= localDate) {
        items.push({ id: `evento:${attendance.id}`, kind: 'evento', label: `quota ${event.nome_evento}` })
      }
    }
    if (!person.foglio_privacy_firmato) items.push({ id: `modulo:${person.id}:privacy`, kind: 'modulo', label: 'foglio privacy' })
    const hasCamp = (type: 'CI' | 'CE') => attendances.some(row => {
      const event = relevantEvents.get(row.evento_id || '')
      return event?.tipo_evento?.toUpperCase() === type && ['PRESENTE', 'PENDOLARE'].includes((row.stato_presenza || '').toUpperCase())
    })
    if (hasCamp('CI')) {
      if (!person.partecipazione_ci) items.push({ id: `modulo:${person.id}:autorizzazione-ci`, kind: 'modulo', label: 'autorizzazione campo invernale' })
      if (!person.scheda_medica_ci) items.push({ id: `modulo:${person.id}:scheda-ci`, kind: 'modulo', label: 'scheda medica campo invernale' })
    }
    if (hasCamp('CE')) {
      if (!person.partecipazione_ce) items.push({ id: `modulo:${person.id}:autorizzazione-ce`, kind: 'modulo', label: 'autorizzazione campo estivo' })
      if (!person.scheda_medica_ce) items.push({ id: `modulo:${person.id}:scheda-ce`, kind: 'modulo', label: 'scheda medica campo estivo' })
    }
    return {
      id: person.id,
      name: `${person.nome} ${person.cognome}`.trim(),
      parent1: { name: person.genitore_1_nome || 'Genitore 1', phone: person.genitore_1_telefono },
      parent2: { name: person.genitore_2_nome || 'Genitore 2', phone: person.genitore_2_telefono },
      items,
    }
  }).filter(person => person.items.length > 0)
}

export function reminderText(people: ReminderPerson[], selectedItems: Set<string>, single = false) {
  const selected = people.map(person => ({ person, items: person.items.filter(item => selectedItems.has(item.id)) })).filter(row => row.items.length)
  if (!selected.length) return ''
  if (single) {
    const { person, items } = selected[0]
    return `Buongiorno, per ${person.name} vi ricordiamo:\n${items.map(item => `• ${item.label}`).join('\n')}\nGrazie!`
  }
  return `Buongiorno, per favore verificate queste pendenze del reparto:\n\n${selected.map(({ person, items }) => `${person.name}:\n${items.map(item => `• ${item.label}`).join('\n')}`).join('\n\n')}\n\nGrazie!`
}

export function whatsappNumber(value: string | null) {
  if (!value) return null
  const digits = value.replace(/\D/g, '')
  if (!/^\+?39/.test(value.trim()) && /^3\d{9}$/.test(digits)) return `39${digits}`
  return /^\d{11,15}$/.test(digits) ? digits : null
}

export function validWhatsAppGroupLink(value: string) {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' && url.hostname === 'chat.whatsapp.com' && /^\/[A-Za-z0-9_-]{10,}$/.test(url.pathname) ? url.toString() : null
  } catch { return null }
}
