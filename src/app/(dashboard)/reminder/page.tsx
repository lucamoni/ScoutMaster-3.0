import { createClient } from '@/lib/supabase/server'
import ReminderClient from './components/ReminderClient'

export const dynamic = 'force-dynamic'

export default async function ReminderPage() {
  const supabase = await createClient()

  // Fetch solo ragazzi attivi
  const { data: ragazzi } = await supabase.from('ragazzi').select('*').eq('attivo', true)
  const { data: eventi } = await supabase.from('eventi').select('*')
  const { data: partecipazioni } = await supabase.from('partecipazioni_eventi').select('*')
  const { data: quote } = await supabase.from('quote_mensili').select('*')

  if (!ragazzi) return <div>Errore caricamento dati</div>

  // Analisi debitori (solo ragazzi attivi)
  const analysis = ragazzi.map(ragazzo => {
    const quoteRagazzo = quote?.find(q => q.ragazzo_id === ragazzo.id)
    const partecipazioniRagazzo = partecipazioni?.filter(p => p.ragazzo_id === ragazzo.id) || []
    
    // Trova le quote mensili non pagate
    const mesi = ['novembre', 'dicembre', 'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno']
    const quoteArretrate = quoteRagazzo 
      ? mesi.filter(m => !(quoteRagazzo as Record<string, unknown>)[m]) 
      : mesi

    // Trova le uscite non pagate (ma era presente o pendolare)
    const usciteNonPagate = partecipazioniRagazzo
      .filter(p => !p.riscosso && p.stato_presenza !== 'Assente')
      .map(p => eventi?.find(e => e.id === p.evento_id)?.nome_evento)
      .filter(Boolean) as string[]

    const privacyMancante = !ragazzo.foglio_privacy_firmato

    return {
      ragazzo,
      quoteArretrate,
      usciteNonPagate,
      privacyMancante
    }
  }).filter(r => r.quoteArretrate.length > 0 || r.usciteNonPagate.length > 0 || r.privacyMancante)

  return (
    <div className="p-4 md:p-6 w-full max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Generatore Reminder AI</h1>
      </div>
      <ReminderClient data={analysis} />
    </div>
  )
}
