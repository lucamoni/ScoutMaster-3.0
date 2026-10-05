import { getAnnualBoys } from '@/lib/annualRoster/server'
import { getWorkingYear } from '@/lib/workingYear'
import { createClient } from '@/lib/supabase/server'
import { PrivacyClient } from './components/PrivacyClient'

export default async function PrivacyPage() {
  const supabase = await createClient()
  const { data: yearSetting } = await supabase.from('impostazioni').select('valore').eq('chiave', 'anno_scout_corrente').maybeSingle()
  const currentYear = await getWorkingYear(yearSetting?.valore)
  const ragazzi = await getAnnualBoys(currentYear, false)

  return <PrivacyClient key={currentYear} currentYear={currentYear} ragazzi={ragazzi || []} />
}
