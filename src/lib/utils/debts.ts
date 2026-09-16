import { normalizeAnnoScout } from './payment'

export const SCOUT_FEE_MONTHS = [
  'novembre',
  'dicembre',
  'gennaio',
  'febbraio',
  'marzo',
  'aprile',
  'maggio',
  'giugno',
] as const

export type ScoutFeeMonth = (typeof SCOUT_FEE_MONTHS)[number]

type DebtScout = {
  id: string
  quota_censimento: boolean | null
  importo_censimento: number | null
}

type DebtQuota = {
  ragazzo_id: string | null
  anno_scout: string
} & Partial<Record<ScoutFeeMonth, boolean | null>>

type DebtEvent = {
  id: string
  nome_evento: string
  quota_standard: number | null
}

type DebtParticipation = {
  ragazzo_id: string | null
  evento_id: string | null
  riscosso: boolean | null
  quota_dovuta: number | null
}

const validAmount = (value: unknown, fallback = 0) => {
  const amount = Number(value)
  return Number.isFinite(amount) && amount >= 0 ? amount : fallback
}

export function getScoutMonthsUpTo(referenceDate = new Date()): ScoutFeeMonth[] {
  const month = referenceDate.getMonth()
  if (month === 8 || month === 9) return []
  if (month === 10) return SCOUT_FEE_MONTHS.slice(0, 1)
  if (month === 11) return SCOUT_FEE_MONTHS.slice(0, 2)
  if (month >= 0 && month <= 5) return SCOUT_FEE_MONTHS.slice(0, month + 3)
  return [...SCOUT_FEE_MONTHS]
}

export function calculateScoutDebt({
  scout,
  quote,
  events,
  participations,
  currentYear,
  activeMonths,
  monthlyFee,
  censusFee,
}: {
  scout: DebtScout
  quote: DebtQuota[]
  events: DebtEvent[]
  participations: DebtParticipation[]
  currentYear: string
  activeMonths: ScoutFeeMonth[]
  monthlyFee: number
  censusFee: number
}) {
  const normalizedYear = normalizeAnnoScout(currentYear)
  const scoutQuote = quote.find(item =>
    item.ragazzo_id === scout.id && normalizeAnnoScout(item.anno_scout) === normalizedYear
  )
  const unpaidMonths = activeMonths.filter(month => scoutQuote?.[month] !== true)
  const quoteDebt = unpaidMonths.length * validAmount(monthlyFee)

  const unpaidEventDetails = participations
    .filter(item => item.ragazzo_id === scout.id && item.riscosso !== true)
    .map(item => {
      const event = events.find(candidate => candidate.id === item.evento_id)
      const eventFee = validAmount(event?.quota_standard)
      return {
        eventoId: item.evento_id,
        nome: event?.nome_evento || 'Evento Reparto',
        cost: item.quota_dovuta == null ? eventFee : validAmount(item.quota_dovuta, eventFee),
      }
    })
  const eventiDebt = unpaidEventDetails.reduce((total, item) => total + item.cost, 0)

  const censimentoDue = scout.quota_censimento !== true
  const defaultCensusFee = validAmount(censusFee)
  const censimentoCost = scout.importo_censimento == null
    ? defaultCensusFee
    : validAmount(scout.importo_censimento, defaultCensusFee)
  const censimentoDebt = censimentoDue ? censimentoCost : 0

  return {
    unpaidMonths,
    quoteDebt,
    unpaidEventDetails,
    eventiDebt,
    censimentoDue,
    censimentoCost,
    censimentoDebt,
    totalDebt: quoteDebt + eventiDebt + censimentoDebt,
    pendenzeCount: unpaidMonths.length + unpaidEventDetails.length + (censimentoDue ? 1 : 0),
  }
}
