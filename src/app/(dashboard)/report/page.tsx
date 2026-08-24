import { createClient } from '@/lib/supabase/server'
import { ReportClient } from './components/ReportClient'

export default async function ReportPage() {
  const supabase = await createClient()
  
  const [ragazziRes, eventiRes, partecipazioniRes, cassaRes, quoteRes] = await Promise.all([
    supabase.from('ragazzi').select('*').eq('attivo', true).order('cognome'),
    supabase.from('eventi').select('*').order('data_inizio'),
    supabase.from('partecipazioni_eventi').select('*'),
    supabase.from('registro_spese').select('*').order('data'),
    supabase.from('quote_mensili').select('*')
  ])

  return (
    <ReportClient 
      ragazzi={ragazziRes.data || []}
      eventi={eventiRes.data || []}
      partecipazioni={partecipazioniRes.data || []}
      cassa={cassaRes.data || []}
      quote={quoteRes.data || []}
    />
  )
}
