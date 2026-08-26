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

  // Fetch dei ragazzi per calcolo censimento AGESCI
  const { data: ragazzi } = await supabase
    .from('ragazzi')
    .select('*')
    .eq('attivo', true)

  // Fetch delle impostazioni (saldi iniziali e stati di chiusura)
  const { data: impostazioni } = await supabase
    .from('impostazioni')
    .select('*')

  const settingsMap: Record<string, string> = {}
  impostazioni?.forEach(i => {
    settingsMap[i.chiave] = i.valore
  })

  return (
    <div className="p-4 md:p-6 w-full max-w-7xl mx-auto space-y-6">
      <BilancioAgesciClient 
        initialSpese={registroSpese || []}
        initialRagazzi={ragazzi || []}
        initialSettings={settingsMap}
      />
    </div>
  )
}
