import { createClient } from '@/lib/supabase/server'
import { BuonacacciaClient } from './components/BuonacacciaClient'

export default async function BuonacacciaPage() {
  const supabase = await createClient()

  const [eventiRes, candRes, ragazziRes] = await Promise.all([
    supabase.from('eventi_buonacaccia' as any).select('*').order('data_inizio', { ascending: true }),
    supabase.from('candidature_buonacaccia' as any).select('*, ragazzi(nome, cognome, telefono_ragazzo, genitore_1_telefono, genitore_2_telefono)'),
    supabase.from('ragazzi').select('*').eq('attivo', true).order('pattuglia', { ascending: true })
  ])

  return (
    <div className="p-4 md:p-6 w-full max-w-7xl mx-auto space-y-4">
      <BuonacacciaClient
        initialEventi={(eventiRes.data as any) || []}
        initialCandidature={(candRes.data as any) || []}
        ragazzi={(ragazziRes.data as any) || []}
      />
    </div>
  )
}
