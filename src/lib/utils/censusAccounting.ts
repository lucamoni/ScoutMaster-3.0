export const CENSUS_INCOME_SETTING = 'censimento_includi_entrate'

type CensusMovement = {
  anticipo_capi_id?: string | null
  tipo_movimento: string | null
  riferimento_censimento_anno?: string | null
  voce_spesa?: string | null
}

export function isIncludedInAccounting(movement: CensusMovement, includeCensus = false): boolean {
  if (movement.anticipo_capi_id) return false
  if (includeCensus || movement.tipo_movimento !== 'ENTRATA') return true
  // Keep ledger records intact. Legacy census entries may lack the structured reference.
  const census = Boolean(movement.riferimento_censimento_anno)
    || /^(quota\s+)?censimento$/i.test((movement.voce_spesa ?? '').trim())
  return !census
}
