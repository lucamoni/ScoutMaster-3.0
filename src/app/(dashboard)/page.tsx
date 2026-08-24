import { createClient } from '@/lib/supabase/server'
import AnagraficaClient from './components/AnagraficaClient'

export default async function AnagraficaPage() {
  const supabase = await createClient()
  
  const { data: ragazzi, error } = await supabase
    .from('ragazzi')
    .select('*')
    .eq('attivo', true)
    .order('pattuglia', { ascending: true })

  const { data: pattuglie } = await supabase
    .from('pattuglie')
    .select('*')
    .order('nome', { ascending: true })

  if (error) {
    return <div>Errore nel caricamento dei dati: {error.message}</div>
  }

  return (
    <div className="p-4 md:p-6 w-full max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Anagrafica Reparto</h1>
      </div>
      <AnagraficaClient initialData={ragazzi || []} initialPattuglie={pattuglie || []} />
    </div>
  )
}
