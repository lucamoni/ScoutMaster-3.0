import { toCanonicalMetodo } from './payment'

export type AccountingMovement = {
  importo: number | null
  metodo: string | null
  tipo_movimento: string | null
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
  saldoInizialeBanca = 0
): AccountingBalances {
  let entrateContanti = 0
  let usciteContanti = 0
  let entrateBanca = 0
  let usciteBanca = 0

  for (const movement of movements) {
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
