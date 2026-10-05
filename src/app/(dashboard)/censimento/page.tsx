import { getAnnualBoys } from '@/lib/annualRoster/server'
import { getWorkingYear } from '@/lib/workingYear'
import { requireAuthenticatedUser, getUserRole } from '@/lib/security/auth'
import { canManageSystem } from '@/lib/security/roles'
import { createClient } from '@/lib/supabase/server'
import CensimentoClient from './components/CensimentoClient'
import { getCurrentAnnoScout } from '@/lib/utils/payment'
import { CENSUS_INCOME_SETTING } from '@/lib/utils/censusAccounting'

export const dynamic = 'force-dynamic'

export default async function CensimentoPage() {
  const user = await requireAuthenticatedUser()
  const supabase = await createClient()

  const { data: impostazioni } = await supabase.from('impostazioni').select('*')

  const quotaCensimentoStandard = impostazioni?.find(i => i.chiave === 'quota_censimento_standard')?.valore || '45'
  const quotaCensimentoFratelli = impostazioni?.find(i => i.chiave === 'quota_censimento_fratelli')?.valore || '35'
  const currentYear = await getWorkingYear(impostazioni?.find(i => i.chiave === 'anno_scout_corrente')?.valore || getCurrentAnnoScout())
  const ragazzi = await getAnnualBoys(currentYear, false)

  return (
    <CensimentoClient 
      key={currentYear}
      canManageSettings={canManageSystem(getUserRole(user))}
      initialRagazzi={ragazzi || []}
      initialQuotaStandard={quotaCensimentoStandard}
      initialQuotaFratelli={quotaCensimentoFratelli}
      currentYear={currentYear}
      initialIncludeCensus={impostazioni?.find(item => item.chiave === CENSUS_INCOME_SETTING)?.valore === 'true'}
    />
  )
}
