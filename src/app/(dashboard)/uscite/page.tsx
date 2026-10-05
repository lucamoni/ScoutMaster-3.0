import { getAnnualBoys } from '@/lib/annualRoster/server'
import { getWorkingYear } from '@/lib/workingYear'
import { dateInWorkingYear } from '@/lib/utils/workingYear'
import { createClient } from '@/lib/supabase/server'
import UsciteClient from './components/UsciteClient'

export const dynamic = 'force-dynamic'

export default async function UscitePage() {
  const supabase = await createClient()
  
  const { data: eventi } = await supabase
    .from('eventi')
    .select('*')
    .order('data_inizio', { ascending: false })

  const { data: partecipazioni } = await supabase
    .from('partecipazioni_eventi')
    .select('*')

  const { data: settings } = await supabase.from('impostazioni').select('valore').eq('chiave', 'anno_scout_corrente').maybeSingle()
  const currentYear = await getWorkingYear(settings?.valore)
  const ragazzi = await getAnnualBoys(currentYear, false)

  return (
    <div className="p-4 md:p-6 w-full max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Presenze e Quote Uscite</h1>
      </div>
      <UsciteClient 
        key={currentYear}
        currentYear={currentYear}
        initialEventi={(eventi || []).filter(event => dateInWorkingYear(event.data_inizio, currentYear))}
        ragazzi={ragazzi || []} 
        initialPartecipazioni={partecipazioni || []} 
      />
    </div>
  )
}
