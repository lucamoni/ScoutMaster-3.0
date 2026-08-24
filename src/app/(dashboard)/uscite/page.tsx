import { createClient } from '@/lib/supabase/server'
import UsciteClient from './components/UsciteClient'

export default async function UscitePage() {
  const supabase = await createClient()
  
  const { data: eventi } = await supabase
    .from('eventi')
    .select('*')
    .order('data_inizio', { ascending: false })

  const { data: ragazzi } = await supabase
    .from('ragazzi')
    .select('*')
    .eq('attivo', true)
    .order('pattuglia', { ascending: true })

  const { data: partecipazioni } = await supabase
    .from('partecipazioni_eventi')
    .select('*')

  return (
    <div className="p-4 md:p-6 w-full max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Presenze e Quote Uscite</h1>
      </div>
      <UsciteClient 
        initialEventi={eventi || []} 
        ragazzi={ragazzi || []} 
        initialPartecipazioni={partecipazioni || []} 
      />
    </div>
  )
}
