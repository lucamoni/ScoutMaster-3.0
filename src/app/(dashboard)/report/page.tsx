import { getAnnualBoys } from '@/lib/annualRoster/server'
import { dateInWorkingYear } from '@/lib/utils/workingYear'
import { getWorkingYear } from '@/lib/workingYear'
import { createClient } from '@/lib/supabase/server'
import { annoScoutVariants, getCurrentAnnoScout } from '@/lib/utils/payment'
import { ReportClient } from './components/ReportClient'
import { CENSUS_INCOME_SETTING, isIncludedInAccounting } from '@/lib/utils/censusAccounting'

export const dynamic = 'force-dynamic'

export default async function ReportPage() {
  const supabase = await createClient()
  const { data: impostazioni } = await supabase.from('impostazioni').select('*')
  const currentYear = await getWorkingYear(
    impostazioni?.find(item => item.chiave === 'anno_scout_corrente')?.valore || getCurrentAnnoScout()
  )
  const [startYear, endYear] = currentYear.split('-').map(Number)

  const [ragazziRes, eventiRes, partecipazioniRes, cassaRes, quoteRes] = await Promise.all([
    getAnnualBoys(currentYear, false).then(data => ({ data })),
    supabase.from('eventi').select('*').order('data_inizio'),
    supabase.from('partecipazioni_eventi').select('*'),
    supabase
      .from('registro_spese')
      .select('*')
      .gte('data', `${startYear}-10-01`)
      .lte('data', `${endYear}-09-30`)
      .order('data'),
    supabase.from('quote_mensili').select('*').in('anno_scout', annoScoutVariants(currentYear)),
  ])

  return (
    <ReportClient
      key={currentYear}
      ragazzi={ragazziRes.data || []}
      eventi={(eventiRes.data || []).filter(event => dateInWorkingYear(event.data_inizio, currentYear))}
      partecipazioni={partecipazioniRes.data || []}
      cassa={(cassaRes.data || []).filter(movement => isIncludedInAccounting(movement, impostazioni?.find(item => item.chiave === CENSUS_INCOME_SETTING)?.valore === 'true'))}
      rawCassa={cassaRes.data || []}
      quote={quoteRes.data || []}
      currentYear={currentYear}
    />
  )
}
