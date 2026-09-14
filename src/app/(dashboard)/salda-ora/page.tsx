import { createClient } from '@/lib/supabase/server'
import { annoScoutVariants, getCurrentAnnoScout, normalizeAnnoScout } from '@/lib/utils/payment'
import SaldaOraClient from './components/SaldaOraClient'

export const dynamic = 'force-dynamic'

export default async function SaldaOraPage() {
  const supabase = await createClient()

  const defaultCurrentYear = getCurrentAnnoScout()

  const [
    { data: ragazzi },
    { data: eventi },
    { data: partecipazioni },
    { data: pattuglie },
    { data: impostazioni }
  ] = await Promise.all([
    supabase.from('ragazzi').select('*').eq('attivo', true).order('cognome'),
    supabase.from('eventi').select('*').order('data_inizio', { ascending: false }),
    supabase.from('partecipazioni_eventi').select('*'),
    supabase.from('pattuglie').select('*'),
    supabase.from('impostazioni').select('*')
  ])

  const quotaMensileStandard = impostazioni?.find(i => i.chiave === 'quota_mensile_standard')?.valore || '10'
  const quotaCensimentoStandard = impostazioni?.find(i => i.chiave === 'quota_censimento_standard')?.valore || '45'
  const quotaCensimentoFratelli = impostazioni?.find(i => i.chiave === 'quota_censimento_fratelli')?.valore || '35'
  const currentYear = normalizeAnnoScout(impostazioni?.find(i => i.chiave === 'anno_scout_corrente')?.valore || defaultCurrentYear)

  const { data: quote } = await supabase
    .from('quote_mensili')
    .select('*')
    .in('anno_scout', annoScoutVariants(currentYear))

  return (
    <SaldaOraClient 
      initialRagazzi={ragazzi || []}
      eventi={eventi || []}
      partecipazioni={partecipazioni || []}
      quote={quote || []}
      pattuglie={pattuglie || []}
      quotaMensileStandard={quotaMensileStandard}
      quotaCensimentoStandard={quotaCensimentoStandard}
      quotaCensimentoFratelli={quotaCensimentoFratelli}
      currentYear={currentYear}
    />
  )
}
