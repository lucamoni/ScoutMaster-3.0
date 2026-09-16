import { createClient } from '@/lib/supabase/server'
import { annoScoutVariants, getCurrentAnnoScout, normalizeAnnoScout } from '@/lib/utils/payment'
import { ReportClient } from './components/ReportClient'

export const dynamic = 'force-dynamic'

export default async function ReportPage() {
  const supabase = await createClient()
  const { data: impostazioni } = await supabase.from('impostazioni').select('*')
  const currentYear = normalizeAnnoScout(
    impostazioni?.find(item => item.chiave === 'anno_scout_corrente')?.valore || getCurrentAnnoScout()
  )
  const [startYear, endYear] = currentYear.split('-').map(Number)

  const [ragazziRes, eventiRes, partecipazioniRes, cassaRes, quoteRes] = await Promise.all([
    supabase.from('ragazzi').select('*').eq('attivo', true).order('cognome'),
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
      ragazzi={ragazziRes.data || []}
      eventi={eventiRes.data || []}
      partecipazioni={partecipazioniRes.data || []}
      cassa={cassaRes.data || []}
      quote={quoteRes.data || []}
      currentYear={currentYear}
    />
  )
}
