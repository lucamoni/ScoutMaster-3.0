import { createClient } from '@/lib/supabase/server'
import { PanoramicaClient } from './components/PanoramicaClient'

export const dynamic = 'force-dynamic'

export default async function PanoramicaPage() {
  const supabase = await createClient()
  
  const defaultCurrentYear = new Date().getMonth() >= 8 
    ? `${new Date().getFullYear()}-${new Date().getFullYear() + 1}` 
    : `${new Date().getFullYear() - 1}-${new Date().getFullYear()}`

  const [
    { data: ragazzi },
    { data: eventi },
    { data: partecipazioni },
    { data: pattuglie },
    { data: impostazioni }
  ] = await Promise.all([
    supabase.from('ragazzi').select('*').eq('attivo', true).order('pattuglia', { ascending: true }),
    supabase.from('eventi').select('*').order('data_inizio', { ascending: false }),
    supabase.from('partecipazioni_eventi').select('*'),
    supabase.from('pattuglie').select('*'),
    supabase.from('impostazioni').select('*')
  ])

  const quotaMensileStandard = impostazioni?.find(i => i.chiave === 'quota_mensile_standard')?.valore || '10'
  const quotaCensimentoStandard = impostazioni?.find(i => i.chiave === 'quota_censimento_standard')?.valore || '45'
  const quotaCensimentoFratelli = impostazioni?.find(i => i.chiave === 'quota_censimento_fratelli')?.valore || '35'
  const currentYear = impostazioni?.find(i => i.chiave === 'anno_scout_corrente')?.valore || defaultCurrentYear

  const { data: quote } = await supabase
    .from('quote_mensili')
    .select('*')
    .eq('anno_scout', currentYear)

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6">
      <PanoramicaClient 
        initialRagazzi={ragazzi || []}
        eventi={eventi || []}
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
