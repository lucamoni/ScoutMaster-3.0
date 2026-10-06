import { getAnnualBoys } from '@/lib/annualRoster/server'
import { getWorkingYear } from '@/lib/workingYear'
import { workingYearSettings } from '@/lib/utils/workingYear'
import { createClient } from '@/lib/supabase/server'
import BilancioAgesciClient from './components/BilancioAgesciClient'

export const dynamic = 'force-dynamic'

export default async function BilancioAgesciPage() {
  const supabase = await createClient()

  // Fetch dei movimenti di cassa
  const { data: registroSpese } = await supabase
    .from('registro_spese')
    .select('*')
    .order('data', { ascending: true })

  // Fetch delle impostazioni (saldi iniziali e stati di chiusura)
  const { data: impostazioni } = await supabase
    .from('impostazioni')
    .select('*')

  const currentYear = await getWorkingYear(impostazioni?.find(i => i.chiave === 'anno_scout_corrente')?.valore)
  const ragazzi = await getAnnualBoys(currentYear, false)

  const settingsMap: Record<string, string> = {}
  impostazioni?.forEach(i => {
    settingsMap[i.chiave] = i.valore
  })

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      <BilancioAgesciClient 
        key={currentYear}
        initialSpese={registroSpese || []}
        initialRagazzi={ragazzi || []}
        initialSettings={Object.fromEntries(workingYearSettings(new Map(Object.entries(settingsMap)), currentYear)) as Record<string, string>}
      />
    </div>
  )
}
