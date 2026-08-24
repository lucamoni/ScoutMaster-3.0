import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database.types'

export async function POST(request: Request) {
  try {
    const { target } = await request.json()

    if (!target) {
      return NextResponse.json({ error: 'Target eliminazione mancante' }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    const supabase = createClient<Database>(supabaseUrl, supabaseKey)

    let deletedSummary = ''

    if (target === 'ragazzi' || target === 'all') {
      await supabase.from('candidature_buonacaccia' as any).delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('partecipazioni_eventi').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('quote_mensili').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('registro_spese').update({ ragazzo_id: null } as any).neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('ragazzi').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('pattuglie').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      deletedSummary += 'Anagrafica e Squadriglie svuotate. '
    }

    if (target === 'eventi' || target === 'all') {
      await supabase.from('partecipazioni_eventi').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('eventi').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      deletedSummary += 'Eventi e Presenze svuotati. '
    }

    if (target === 'registro_spese' || target === 'all') {
      await supabase.from('registro_spese').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      deletedSummary += 'Registro Spese e Cassa svuotati. '
    }

    if (target === 'quote_mensili' || target === 'all') {
      await supabase.from('quote_mensili').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      deletedSummary += 'Quote Mensili svuotate. '
    }

    if (target === 'buonacaccia' || target === 'all') {
      await supabase.from('candidature_buonacaccia' as any).delete().neq('id', '00000000-0000-0000-0000-000000000000')
      await supabase.from('eventi_buonacaccia' as any).delete().neq('id', '00000000-0000-0000-0000-000000000000')
      deletedSummary += 'BuonaCaccia svuotato. '
    }

    return NextResponse.json({
      success: true,
      message: deletedSummary || 'Eliminazione completata.'
    })
  } catch (error: unknown) {
    const err = error as Error
    console.error('Errore reset dati:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
