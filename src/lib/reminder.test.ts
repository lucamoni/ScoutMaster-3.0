import { expect, it } from 'vitest'
import { buildReminderPeople, dueMonths, reminderText, validWhatsAppGroupLink, whatsappNumber } from './reminder'
import type { Database } from '@/types/database.types'

type Person = Database['public']['Tables']['ragazzi']['Row']
type Quote = Database['public']['Tables']['quote_mensili']['Row']
type Event = Database['public']['Tables']['eventi']['Row']
type Participation = Database['public']['Tables']['partecipazioni_eventi']['Row']

const person = { id: 'r1', nome: 'Ada', cognome: 'Rossi', attivo: true, quota_censimento: true, foglio_privacy_firmato: true, partecipazione_ci: true, scheda_medica_ci: false, partecipazione_ce: true, scheda_medica_ce: true, genitore_1_nome: 'Maria', genitore_1_telefono: '333 1234567' } as Person
const event = { id: 'e1', nome_evento: 'Campo invernale', tipo_evento: 'CI', data_inizio: '2026-12-01', quota_standard: 100 } as Event

it('mostra solo le mensilità maturate nell’anno scelto', () => {
  expect(dueMonths('2026-2027', new Date(2026, 9, 1))).toEqual([])
  expect(dueMonths('2026-2027', new Date(2026, 11, 1))).toEqual(['novembre', 'dicembre'])
  expect(dueMonths('2025-2026', new Date(2026, 9, 1))).toHaveLength(8)
})

it('unisce quote legacy e mostra evento non pagato e modulo CI mancante', () => {
  const result = buildReminderPeople(
    [person],
    [{ ragazzo_id: 'r1', anno_scout: '2026/2027', novembre: true } as Quote, { ragazzo_id: 'r1', anno_scout: '2026-2027', dicembre: false } as Quote],
    [event, { ...event, id: 'old', data_inizio: '2025-12-01' } as Event],
    [{ id: 'p1', ragazzo_id: 'r1', evento_id: 'e1', stato_presenza: 'Presente', riscosso: false, quota_dovuta: 100 } as Participation,
      { id: 'p2', ragazzo_id: 'r1', evento_id: 'old', stato_presenza: 'Presente', riscosso: false, quota_dovuta: 100 } as Participation],
    '2026-2027', new Date(2027, 0, 1),
  )
  expect(result).toHaveLength(1)
  expect(result[0].items.map(item => item.label)).toEqual(['quota di dicembre', 'quota di gennaio', 'quota Campo invernale', 'scheda medica campo invernale'])
  expect(reminderText(result, new Set([result[0].items[0].id, result[0].items[3].id]), true)).toContain('Ada Rossi')
  expect(reminderText(result, new Set([result[0].items[0].id]), false)).not.toContain('scheda medica')
})

it('non chiede la quota evento a chi è assente o non deve pagare', () => {
  const result = buildReminderPeople([person], [], [event], [{ id: 'p1', ragazzo_id: 'r1', evento_id: 'e1', stato_presenza: 'Assente', riscosso: false, quota_dovuta: 100 } as Participation], '2026-2027', new Date(2026, 9, 1))
  expect(result).toEqual([])
})

it('normalizza numeri e accetta solo inviti WhatsApp del gruppo', () => {
  expect(whatsappNumber('333 1234567')).toBe('393331234567')
  expect(whatsappNumber('+39 333 1234567')).toBe('393331234567')
  expect(whatsappNumber('123')).toBeNull()
  expect(validWhatsAppGroupLink('https://chat.whatsapp.com/ABCDEFGHIJKLMNO123')).toBe('https://chat.whatsapp.com/ABCDEFGHIJKLMNO123')
  expect(validWhatsAppGroupLink('https://evil.example/ABCDEFGHIJKLMNO123')).toBeNull()
})
