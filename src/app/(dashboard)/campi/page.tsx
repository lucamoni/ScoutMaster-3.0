import { createClient } from '@/lib/supabase/server'
import UsciteClient from '../uscite/components/UsciteClient'

export const dynamic = 'force-dynamic'

const CAMPI_TYPES = ['CI', 'CE', 'CAMPO_INVERNALE', 'CAMPO_ESTIVO']

export default async function CampiPage() {
  const supabase = await createClient()

  const [{ data: eventiTutti }, { data: ragazzi }, { data: partecipazioni }] = await Promise.all([
    supabase.from('eventi').select('*').order('data_inizio', { ascending: false }),
    supabase.from('ragazzi').select('*').eq('attivo', true).order('pattuglia', { ascending: true }),
    supabase.from('partecipazioni_eventi').select('*'),
  ])

  const eventi = (eventiTutti || []).filter(evento =>
    CAMPI_TYPES.includes(String(evento.tipo_evento || '').toUpperCase())
  )

  return (
    <div className="p-4 md:p-6 w-full max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Campi CI / CE</h1>
      </div>
      <UsciteClient
        initialEventi={eventi}
        ragazzi={ragazzi || []}
        initialPartecipazioni={partecipazioni || []}
        campiOnly
      />
    </div>
  )
}
