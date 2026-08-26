import { createClient } from '@/lib/supabase/server'
import { BuonacacciaClient } from './components/BuonacacciaClient'

export default async function BuonacacciaPage() {
  const supabase = await createClient()

  const [eventiRes, candRes, ragazziRes] = await Promise.all([
    supabase.from('eventi_buonacaccia' as any).select('*').order('data_inizio', { ascending: true }),
    supabase.from('candidature_buonacaccia' as any).select('*'),
    supabase.from('ragazzi').select('*').eq('attivo', true).order('pattuglia', { ascending: true })
  ])

  const ragazziMap = new Map((ragazziRes.data || []).map((r: any) => [r.id, r]))

  const mappedCandidature = (candRes.data || []).map((c: any) => {
    const rag = ragazziMap.get(c.ragazzo_id)
    return {
      ...c,
      ragazzi: rag ? {
        nome: rag.nome,
        cognome: rag.cognome,
        telefono_ragazzo: rag.telefono_ragazzo,
        genitore_1_telefono: rag.genitore_1_telefono,
        genitore_2_telefono: rag.genitore_2_telefono
      } : null
    }
  })

  return (
    <div className="p-4 md:p-6 w-full max-w-7xl mx-auto space-y-4">
      <BuonacacciaClient
        initialEventi={(eventiRes.data as any) || []}
        initialCandidature={mappedCandidature}
        ragazzi={(ragazziRes.data as any) || []}
      />
    </div>
  )
}
