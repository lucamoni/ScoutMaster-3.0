import { createClient } from '@/lib/supabase/server'
import { getCurrentAnnoScout } from '@/lib/utils/payment'
import { getAccountingPeriod } from '@/lib/utils/accounting'
import CassaClient from './components/CassaClient'

export const dynamic = 'force-dynamic'

export default async function CassaPage() {
  const supabase = await createClient()

  const [{ data: impostazioni }, { data: categorie }] = await Promise.all([
    supabase.from('impostazioni').select('*'),
    supabase.from('categorie_spesa').select('*').order('nome', { ascending: true }),
  ])

  const settings = new Map((impostazioni || []).map(item => [item.chiave, item.valore]))
  const { currentYear, startDate, endDate, initialCash, initialBank } = getAccountingPeriod(settings, getCurrentAnnoScout())

  const { data: spese, error } = await supabase
    .from('registro_spese')
    .select('*')
    .gte('data', startDate)
    .lte('data', endDate)
    .order('data', { ascending: false })

  if (error) {
    return <div>Errore nel caricamento della prima nota.</div>
  }

  return (
    <div className="p-4 md:p-6 w-full max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cassa & Saldi</h1>
          <p className="text-sm text-muted-foreground">Prima nota {currentYear} · 1 ottobre – 30 settembre</p>
        </div>
      </div>
      <CassaClient
        startDate={startDate}
        endDate={endDate}
        initialSpese={spese || []}
        initialCategorie={categorie || []}
        initialBalances={{ contanti: initialCash, banca: initialBank }}
      />
    </div>
  )
}
