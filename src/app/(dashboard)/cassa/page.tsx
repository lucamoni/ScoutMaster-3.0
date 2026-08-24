import { createClient } from '@/lib/supabase/server'
import CassaClient from './components/CassaClient'

export const dynamic = 'force-dynamic'

export default async function CassaPage() {
  const supabase = await createClient()
  
  const { data: spese } = await supabase
    .from('registro_spese')
    .select('*')
    .order('data', { ascending: false })

  const { data: categorie } = await supabase
    .from('categorie_spesa')
    .select('*')
    .order('nome', { ascending: true })

  // Calcolo Saldi
  let entrateContanti = 0
  let entrateBanca = 0
  let usciteContanti = 0
  let usciteBanca = 0

  spese?.forEach((spesa) => {
    const isEntrata = spesa.tipo_movimento === 'ENTRATA'
    const s = (spesa.metodo || '').trim().toUpperCase()
    const isBanca = s.includes('BONIF') || s.includes('BANC') || s.includes('CART') || s.includes('POS')
    if (!isBanca) {
      if (isEntrata) entrateContanti += Number(spesa.importo)
      else usciteContanti += Number(spesa.importo)
    } else {
      if (isEntrata) entrateBanca += Number(spesa.importo)
      else usciteBanca += Number(spesa.importo)
    }
  })

  return (
    <div className="p-4 md:p-6 w-full max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Cassa & Saldi (Doppia Tasca)</h1>
      </div>
      <CassaClient 
        initialSpese={spese || []} 
        initialCategorie={categorie || []}
        saldi={{ entrateContanti, entrateBanca, usciteContanti, usciteBanca }}
      />
    </div>
  )
}
