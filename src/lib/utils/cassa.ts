import { normalizeAnnoScout, toCanonicalMetodo } from './payment'

export type CassaMovement = {
  data?: string | null
  importo?: number | string | null
  tipo_movimento?: string | null
  metodo?: string | null
}

export type CassaBalances = {
  contanti: number
  banca: number
}

export type CassaTotals = {
  entrateContanti: number
  usciteContanti: number
  entrateBanca: number
  usciteBanca: number
}

export function getAnnoScoutDateRange(annoScout: string) {
  const [startYear, endYear] = normalizeAnnoScout(annoScout).split('-').map(Number)
  return {
    startDate: `${startYear}-10-01`,
    endDate: `${endYear}-09-30`,
  }
}

function readNumberSetting(
  settings: ReadonlyMap<string, string | null | undefined>,
  keys: string[]
): number | null {
  for (const key of keys) {
    const raw = settings.get(key)
    if (raw === undefined || raw === null || String(raw).trim() === '') continue

    const value = Number(String(raw).trim().replace(',', '.'))
    if (Number.isFinite(value)) return value
  }
  return null
}

function getSpecificInitialBalance(
  settings: ReadonlyMap<string, string | null | undefined>,
  annoScout: string,
  kind: 'contanti' | 'banca'
) {
  const canonical = normalizeAnnoScout(annoScout)
  const legacy = canonical.replace('-', '/')
  const keys = kind === 'contanti'
    ? [
        `saldo_iniziale_contanti_${canonical}`,
        `saldo_iniziale_contanti_${legacy}`,
        `saldo_iniziale_cassa_${canonical}`,
        `saldo_iniziale_cassa_${legacy}`,
      ]
    : [
        `saldo_iniziale_banca_${canonical}`,
        `saldo_iniziale_banca_${legacy}`,
      ]

  return readNumberSetting(settings, keys)
}

function getPreviousAnnoScout(annoScout: string) {
  const startYear = Number(normalizeAnnoScout(annoScout).split('-')[0])
  return `${startYear - 1}-${startYear}`
}

function belongsToAnnoScout(data: string | null | undefined, annoScout: string) {
  if (!data) return false
  const { startDate, endDate } = getAnnoScoutDateRange(annoScout)
  const date = String(data).slice(0, 10)
  return date >= startDate && date <= endDate
}

export function calculateCassaTotals(movimenti: CassaMovement[]): CassaTotals {
  const totals: CassaTotals = {
    entrateContanti: 0,
    usciteContanti: 0,
    entrateBanca: 0,
    usciteBanca: 0,
  }

  for (const movimento of movimenti) {
    const importo = Number(movimento.importo) || 0
    const isEntrata = movimento.tipo_movimento === 'ENTRATA'
    const isUscita = movimento.tipo_movimento === 'USCITA'
    if (!importo || (!isEntrata && !isUscita)) continue

    const isContanti = toCanonicalMetodo(movimento.metodo) === 'Contanti'
    if (isContanti) {
      if (isEntrata) totals.entrateContanti += importo
      else totals.usciteContanti += importo
    } else {
      if (isEntrata) totals.entrateBanca += importo
      else totals.usciteBanca += importo
    }
  }

  return totals
}

export function resolveInitialBalances(
  settings: ReadonlyMap<string, string | null | undefined>,
  annoScout: string,
  movimenti: CassaMovement[]
): CassaBalances {
  const configuredYear = normalizeAnnoScout(settings.get('anno_scout_corrente') || annoScout)
  const genericBalanceYear = normalizeAnnoScout(settings.get('saldo_iniziale_anno') || configuredYear)
  const memo = new Map<string, CassaBalances>()

  const resolve = (year: string, depth = 0): CassaBalances => {
    const canonicalYear = normalizeAnnoScout(year)
    const cached = memo.get(canonicalYear)
    if (cached) return cached

    if (depth > 30) return { contanti: 0, banca: 0 }

    const specificCash = getSpecificInitialBalance(settings, canonicalYear, 'contanti')
    const specificBank = getSpecificInitialBalance(settings, canonicalYear, 'banca')
    const genericCash = canonicalYear === genericBalanceYear
      ? readNumberSetting(settings, ['saldo_iniziale_contanti'])
      : null
    const genericBank = canonicalYear === genericBalanceYear
      ? readNumberSetting(settings, ['saldo_iniziale_banca'])
      : null

    const explicitCash = specificCash ?? genericCash
    const explicitBank = specificBank ?? genericBank

    if (explicitCash !== null && explicitBank !== null) {
      const result = { contanti: explicitCash, banca: explicitBank }
      memo.set(canonicalYear, result)
      return result
    }

    const previousYear = getPreviousAnnoScout(canonicalYear)
    const previous = resolve(previousYear, depth + 1)
    const previousTotals = calculateCassaTotals(
      movimenti.filter(movimento => belongsToAnnoScout(movimento.data, previousYear))
    )
    const result = {
      contanti: explicitCash ?? previous.contanti + previousTotals.entrateContanti - previousTotals.usciteContanti,
      banca: explicitBank ?? previous.banca + previousTotals.entrateBanca - previousTotals.usciteBanca,
    }
    memo.set(canonicalYear, result)
    return result
  }

  return resolve(annoScout)
}
