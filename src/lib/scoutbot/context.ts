import { getAnnualBoys } from '@/lib/annualRoster/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables } from '@/types/database.types'
import { calculateAccountingBalances, getAccountingPeriod } from '@/lib/utils/accounting'
import { CENSUS_INCOME_SETTING, isIncludedInAccounting } from '@/lib/utils/censusAccounting'
import { annoScoutVariants, toCanonicalMetodo } from '@/lib/utils/payment'
import { SCOUT_FEE_MONTHS, getScoutMonthsUpTo } from '@/lib/utils/debts'
import { workingYearSettings } from '@/lib/utils/workingYear'
import { getIndividualMonthlyQuotaAmount, getMonthlyQuotaAmount } from '@/lib/utils/monthlyQuota'

type Person = Pick<Tables<'ragazzi'>, 'id' | 'nome' | 'cognome' | 'attivo' | 'pattuglia' | 'quota_censimento' | 'importo_censimento' | 'foglio_privacy_firmato' | 'partecipazione_ci' | 'partecipazione_ce' | 'scheda_medica_ci' | 'scheda_medica_ce'>
type Movement = Pick<Tables<'registro_spese'>, 'id' | 'data' | 'importo' | 'metodo' | 'tipo_movimento' | 'voce_spesa' | 'momento_anno' | 'note' | 'riferimento_censimento_anno'>
type BcEvent = { id: string; titolo: string; categoria: string | null; data_inizio: string | null; luogo: string | null; costo_evento: number | null }
type BcEntry = { id: string; evento_id: string; ragazzo_id: string; stato_iscrizione: string | null; quota_pagata: boolean | null }

export async function readAllRows<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = []
  for (let offset = 0; offset < 50_000; offset += 500) {
    const result = await read(offset, offset + 499)
    if (result.error || !result.data) throw new Error('ScoutBot: lettura database non riuscita')
    rows.push(...result.data)
    if (result.data.length < 500) return rows
  }
  throw new Error('ScoutBot: archivio troppo grande per una lettura completa')
}

export function buildScoutBotContext({ year, settings, people, events, participations, movements, quotes, bcEvents = [], bcEntries = [], today = new Date() }: {
  year: string; settings: Map<string, string | null>; people: Person[]; events: Tables<'eventi'>[];
  participations: Tables<'partecipazioni_eventi'>[]; movements: Movement[]; quotes: Tables<'quote_mensili'>[];
  bcEvents?: BcEvent[]; bcEntries?: BcEntry[]; today?: Date
}) {
  const period = getAccountingPeriod(workingYearSettings(settings, year), year)
  const inYear = (date: string | null) => !!date && date >= period.startDate && date <= period.endDate
  const includeCensus = settings.get(CENSUS_INCOME_SETTING) === 'true'
  const yearMovements = movements.filter(m => inYear(m.data))
  const included = yearMovements.filter(m => isIncludedInAccounting(m, includeCensus))
  const balances = calculateAccountingBalances(yearMovements, period.initialCash, period.initialBank, includeCensus)
  const personMap = new Map(people.map(p => [p.id, p]))
  const name = (id: string | null) => { const p = personMap.get(id || ''); return p ? `${p.nome} ${p.cognome}`.trim() : 'Anagrafica non disponibile' }
  const amount = (value: number | null, fallback = 0) => value == null ? fallback : Number(value)
  const eventFacts = events.filter(e => inYear(e.data_inizio)).map(event => {
    const entries = participations.filter(p => p.evento_id === event.id)
    const present = entries.filter(p => ['PRESENTE', 'PENDOLARE'].includes((p.stato_presenza || '').toUpperCase()))
    const details = present.map(p => ({ nome: name(p.ragazzo_id), quota: amount(p.quota_dovuta, amount(event.quota_standard)), pagato: p.riscosso === true, metodo: toCanonicalMetodo(p.metodo_pagamento), scheda_consegnata: p.scheda_medica_consegnata === true }))
    return { nome: event.nome_evento, tipo: event.tipo_evento, data: event.data_inizio, registrazioni: entries.length, presenti: details.length, partecipanti: details,
      incassato: details.filter(p => p.pagato).reduce((sum, p) => sum + p.quota, 0),
      da_incassare: details.filter(p => !p.pagato).reduce((sum, p) => sum + p.quota, 0),
      gratuiti: details.filter(p => p.quota === 0).length }
  })
  const dueMonths = getScoutMonthsUpTo(today, year)
  const monthlyFee = getMonthlyQuotaAmount(settings, year)
  const censusFee = Number(settings.get('quota_censimento_standard') || 45)
  const scoutFacts = people.filter(p => p.attivo === true).map(person => {
    const records = quotes.filter(q => q.ragazzo_id === person.id && annoScoutVariants(year).includes(q.anno_scout))
    const individualMonthlyFee = getIndividualMonthlyQuotaAmount(records, monthlyFee)
    const months = SCOUT_FEE_MONTHS.map(m => ({ mese: m, pagato: records.some(q => q[m] === true), scaduto: dueMonths.includes(m) }))
    return { nome: name(person.id), squadriglia: person.pattuglia, quote_mensili: months, quota_mensile: individualMonthlyFee,
      mensili_da_pagare: months.filter(m => m.scaduto && !m.pagato).length * individualMonthlyFee,
      censimento_pagato: person.quota_censimento === true, quota_censimento: amount(person.importo_censimento, censusFee),
      moduli: { privacy: person.foglio_privacy_firmato === true, autorizzazione_ci: person.partecipazione_ci === true, autorizzazione_ce: person.partecipazione_ce === true, scheda_ci: person.scheda_medica_ci === true, scheda_ce: person.scheda_medica_ce === true } }
  })
  const categories = [...new Set(included.map(m => m.voce_spesa || 'Senza categoria'))].map(category => ({ categoria: category, ...calculateAccountingBalances(included.filter(m => (m.voce_spesa || 'Senza categoria') === category), 0, 0, includeCensus) }))
  return {
    anno_scout: year, aggiornato_al: today.toISOString(), periodo: period,
    cassa: { ...balances, entrate: balances.entrateContanti + balances.entrateBanca, uscite: balances.usciteContanti + balances.usciteBanca, censimento_incluso: includeCensus, movimenti: included.length, per_categoria: categories },
    ragazzi: scoutFacts, eventi: eventFacts,
    movimenti: included.map(m => ({ data: m.data, tipo: m.tipo_movimento, importo: m.importo, metodo: toCanonicalMetodo(m.metodo), categoria: m.voce_spesa, momento: m.momento_anno, descrizione: m.note })).sort((a, b) => (a.data || '').localeCompare(b.data || '')),
    dati_da_verificare: { movimenti_senza_data: movements.filter(m => !m.data).length, eventi_senza_data: events.filter(e => !e.data_inizio).length },
    buonacaccia: bcEvents.filter(e => inYear(e.data_inizio)).map(e => ({ titolo: e.titolo, categoria: e.categoria, data: e.data_inizio, luogo: e.luogo, costo: e.costo_evento, candidature: bcEntries.filter(c => c.evento_id === e.id).map(c => ({ nome: name(c.ragazzo_id), stato: c.stato_iscrizione, quota_pagata: c.quota_pagata })) })),
    ambito: 'Anagrafica, censimento, documenti, presenze, quote mensili e movimenti si riferiscono all’anno selezionato. Gli allegati non sono stati letti; i moduli sono gli stati registrati nell’app. BuonaCaccia comprende solo eventi salvati nell’app, non il catalogo online completo.',
  }
}
export type ScoutBotContext = ReturnType<typeof buildScoutBotContext>

export async function loadScoutBotContext(client: SupabaseClient<Database>, year: string, settings: Map<string, string | null>) {
  const rawClient = client as SupabaseClient
  const [people, events, participations, movements, quotes, bcEvents, bcEntries] = await Promise.all([
    getAnnualBoys(year,true),
    readAllRows((from, to) => client.from('eventi').select('*').order('id').range(from, to)),
    readAllRows((from, to) => client.from('partecipazioni_eventi').select('*').order('id').range(from, to)),
    readAllRows((from, to) => client.from('registro_spese').select('id,data,importo,metodo,tipo_movimento,voce_spesa,momento_anno,note,riferimento_censimento_anno').order('id').range(from, to)),
    readAllRows((from, to) => client.from('quote_mensili').select('*').in('anno_scout', annoScoutVariants(year)).order('id').range(from, to)),
    readAllRows<BcEvent>((from, to) => rawClient.from('eventi_buonacaccia').select('id,titolo,categoria,data_inizio,luogo,costo_evento').order('id').range(from, to)),
    readAllRows<BcEntry>((from, to) => rawClient.from('candidature_buonacaccia').select('id,evento_id,ragazzo_id,stato_iscrizione,quota_pagata').order('id').range(from, to)),
  ])
  return buildScoutBotContext({ year, settings, people, events, participations, movements, quotes, bcEvents, bcEntries })
}
