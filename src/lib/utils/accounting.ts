import { normalizeAnnoScout, toCanonicalMetodo } from './payment'
import { isIncludedInAccounting } from './censusAccounting'

export type AccountingMovement = {
  importo: number | null
  metodo: string | null
  tipo_movimento: string | null
  riferimento_censimento_anno?: string | null
  voce_spesa?: string | null
}

export type AccountingBalances = {
  entrateContanti: number
  usciteContanti: number
  entrateBanca: number
  usciteBanca: number
  saldoFinaleCassa: number
  saldoFinaleBanca: number
  saldoFinaleTotale: number
  risultatoEsercizio: number
}

export function calculateAccountingBalances(
  movements: AccountingMovement[],
  saldoInizialeCassa = 0,
  saldoInizialeBanca = 0,
  includeCensus = false,
): AccountingBalances {
  let entrateContanti = 0
  let usciteContanti = 0
  let entrateBanca = 0
  let usciteBanca = 0

  for (const movement of movements) {
    if (!isIncludedInAccounting(movement, includeCensus)) continue
    const importo = Number(movement.importo)
    if (!Number.isFinite(importo) || importo < 0) continue

    const isBanca = toCanonicalMetodo(movement.metodo) !== 'Contanti'
    if (movement.tipo_movimento === 'ENTRATA') {
      if (isBanca) entrateBanca += importo
      else entrateContanti += importo
    } else if (movement.tipo_movimento === 'USCITA') {
      if (isBanca) usciteBanca += importo
      else usciteContanti += importo
    }
  }

  const saldoFinaleCassa = saldoInizialeCassa + entrateContanti - usciteContanti
  const saldoFinaleBanca = saldoInizialeBanca + entrateBanca - usciteBanca

  return {
    entrateContanti,
    usciteContanti,
    entrateBanca,
    usciteBanca,
    saldoFinaleCassa,
    saldoFinaleBanca,
    saldoFinaleTotale: saldoFinaleCassa + saldoFinaleBanca,
    risultatoEsercizio: entrateContanti + entrateBanca - usciteContanti - usciteBanca,
  }
}

export function getAccountingPeriod(settings: Map<string, string | null>, fallbackYear: string) {
  const currentYear = normalizeAnnoScout(settings.get('anno_scout_corrente') || fallbackYear)
  const [start, end] = currentYear.split('-')
  const legacyYear = currentYear.replace('-', '/')
  const amount = (keys: string[]) => {
    for (const key of keys) {
      const value = settings.get(key)
      if (value != null && value !== '' && Number.isFinite(Number(value))) return Number(value)
    }
    return 0
  }
  return {
    currentYear, startDate: `${start}-10-01`, endDate: `${end}-09-30`,
    initialCash: amount([`saldo_iniziale_cassa_${currentYear}`, `saldo_iniziale_cassa_${legacyYear}`, 'saldo_iniziale_contanti']),
    initialBank: amount([`saldo_iniziale_banca_${currentYear}`, `saldo_iniziale_banca_${legacyYear}`, 'saldo_iniziale_banca']),
  }
}
