import { createClient } from '@/lib/supabase/server'
import { getCurrentAnnoScout, normalizeAnnoScout } from '@/lib/utils/payment'
import { resolveInitialBalances } from '@/lib/utils/cassa'
import CassaClient from './components/CassaClient'

export const dynamic = 'force-dynamic'

export default async function CassaPage() {
  const supabase = await createClient()

  const [{ data: impostazioni }, { data: categorie }] = await Promise.all([
    supabase.from('impostazioni').select('*'),
    supabase.from('categorie_spesa').select('*').order('nome', { ascending: true }),
  ])

  const settings = new Map((impostazioni || []).map(item => [item.chiave, item.valore]))
  const currentYear = normalizeAnnoScout(settings.get('anno_scout_corrente') || getCurrentAnnoScout())
  const [startYear, endYear] = currentYear.split('-').map(Number)
  const startDate = `${startYear}-10-01`
  const endDate = `${endYear}-09-30`

  const [{ data: spese, error }, { data: saldiMovimenti, error: saldiError }] = await Promise.all([
    supabase
      .from('registro_spese')
      .select('*')
      .gte('data', startDate)
      .lte('data', endDate)
      .order('data', { ascending: false }),
    supabase
      .from('registro_spese')
      .select('importo, tipo_movimento, metodo, data'),
  ])

  if (error || saldiError) {
    return <div>Errore nel caricamento della prima nota.</div>
  }

  const initialBalances = resolveInitialBalances(
    settings,
    currentYear,
    saldiMovimenti || []
  )

  return (
    <div className="p-4 md:p-6 w-full max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cassa & Saldi</h1>
          <p className="text-sm text-muted-foreground">Prima nota {currentYear} · 1 ottobre – 30 settembre</p>
        </div>
      </div>
      <CassaClient
        initialSpese={spese || []}
        initialCategorie={categorie || []}
        initialBalances={initialBalances}
      />
    </div>
  )
}
