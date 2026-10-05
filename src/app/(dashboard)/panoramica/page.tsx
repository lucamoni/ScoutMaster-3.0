import { getAnnualBoys } from '@/lib/annualRoster/server'
import { dateInWorkingYear } from '@/lib/utils/workingYear'
import { getWorkingYear } from '@/lib/workingYear'
import { createClient } from '@/lib/supabase/server'
import { annoScoutVariants, getCurrentAnnoScout } from '@/lib/utils/payment'
import { PanoramicaClient } from './components/PanoramicaClient'
import { getMonthlyQuotaAmount } from '@/lib/utils/monthlyQuota'

export const dynamic = 'force-dynamic'

export default async function PanoramicaPage() {
  const supabase = await createClient()
  
  const defaultCurrentYear = getCurrentAnnoScout()
  const { data: impostazioni } = await supabase.from('impostazioni').select('*')
  const currentYear = await getWorkingYear(impostazioni?.find(i => i.chiave === 'anno_scout_corrente')?.valore || defaultCurrentYear)

  const [
    { data: ragazzi },
    { data: eventi },
    { data: partecipazioni },
    { data: pattuglie }
  ] = await Promise.all([
    getAnnualBoys(currentYear, false).then(data => ({ data })),
    supabase.from('eventi').select('*').order('data_inizio', { ascending: false }),
    supabase.from('partecipazioni_eventi').select('*'),
    supabase.from('pattuglie').select('*')
  ])

  const quotaCensimentoStandard = impostazioni?.find(i => i.chiave === 'quota_censimento_standard')?.valore || '45'
  const quotaCensimentoFratelli = impostazioni?.find(i => i.chiave === 'quota_censimento_fratelli')?.valore || '35'
  const quotaMensileStandard = String(getMonthlyQuotaAmount(new Map((impostazioni || []).map(i => [i.chiave, i.valore])), currentYear))

  const { data: quote } = await supabase
    .from('quote_mensili')
    .select('*')
    .in('anno_scout', annoScoutVariants(currentYear))

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      <PanoramicaClient 
        key={currentYear}
        initialRagazzi={ragazzi || []}
        eventi={(eventi || []).filter(event => dateInWorkingYear(event.data_inizio, currentYear))}
        partecipazioni={partecipazioni || []}
        quote={quote || []}
        pattuglie={pattuglie || []}
        quotaMensileStandard={quotaMensileStandard}
        initialQuotaCensimento={quotaCensimentoStandard}
        quotaCensimentoFratelli={quotaCensimentoFratelli}
        currentYear={currentYear}
      />
    </div>
  )
}
