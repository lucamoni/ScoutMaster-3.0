import { normalizeAnnoScout, toCanonicalMetodo } from './payment'
import { isIncludedInAccounting } from './censusAccounting'

export type AccountingMovement = {
  anticipo_capi_id?: string | null
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
  deltaFuoriBilancioCassa: number
  deltaFuoriBilancioBanca: number
  deltaFuoriBilancioTotale: number
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

  let deltaFuoriBilancioCassa = 0
  let deltaFuoriBilancioBanca = 0

  for (const movement of movements) {
    const importo = Number(movement.importo)
    if (!Number.isFinite(importo) || importo < 0) continue

    const isBanca = toCanonicalMetodo(movement.metodo) !== 'Contanti'
    if (movement.anticipo_capi_id) {
      const delta = movement.tipo_movimento === 'ENTRATA' ? importo : movement.tipo_movimento === 'USCITA' ? -importo : 0
      if (isBanca) deltaFuoriBilancioBanca += delta
      else deltaFuoriBilancioCassa += delta
      continue
    }
    if (!isIncludedInAccounting(movement, includeCensus)) continue
    if (movement.tipo_movimento === 'ENTRATA') {
      if (isBanca) entrateBanca += importo
      else entrateContanti += importo
    } else if (movement.tipo_movimento === 'USCITA') {
      if (isBanca) usciteBanca += importo
      else usciteContanti += importo
    }
  }

  const saldoFinaleCassa = saldoInizialeCassa + entrateContanti - usciteContanti + deltaFuoriBilancioCassa
  const saldoFinaleBanca = saldoInizialeBanca + entrateBanca - usciteBanca + deltaFuoriBilancioBanca

  return {
    entrateContanti,
    usciteContanti,
    entrateBanca,
    usciteBanca,
    saldoFinaleCassa,
    saldoFinaleBanca,
    saldoFinaleTotale: saldoFinaleCassa + saldoFinaleBanca,
    deltaFuoriBilancioCassa,
    deltaFuoriBilancioBanca,
    deltaFuoriBilancioTotale: deltaFuoriBilancioCassa + deltaFuoriBilancioBanca,
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
