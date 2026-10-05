import { getAnnualBoys } from '@/lib/annualRoster/server'
import { getWorkingYear } from '@/lib/workingYear'
import { createClient } from '@/lib/supabase/server'
import AnagraficaClient from './components/AnagraficaClient'

export default async function AnagraficaPage() {
  const supabase = await createClient()
  const { data: yearSetting } = await supabase.from('impostazioni').select('valore').eq('chiave', 'anno_scout_corrente').maybeSingle()
  const currentYear = await getWorkingYear(yearSetting?.valore)
  
  const ragazzi = await getAnnualBoys(currentYear, false)

  const { data: pattuglie } = await supabase
    .from('pattuglie')
    .select('*')
    .order('nome', { ascending: true })

  return (
    <div className="p-4 md:p-6 w-full max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Anagrafica Reparto</h1>
      </div>
      <AnagraficaClient key={currentYear} currentYear={currentYear} initialData={ragazzi || []} initialPattuglie={pattuglie || []} />
    </div>
  )
}
