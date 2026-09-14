import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authorizationErrorResponse, requireRole } from '@/lib/security/auth'

type ResetTarget =
  | 'ragazzi'
  | 'eventi'
  | 'registro_spese'
  | 'quote_mensili'
  | 'buonacaccia'
  | 'all'

const VALID_TARGETS = new Set<ResetTarget>([
  'ragazzi',
  'eventi',
  'registro_spese',
  'quote_mensili',
  'buonacaccia',
  'all',
])

export async function POST(request: Request) {
  try {
    await requireRole(['admin'])

    const body = await request.json()
    const target = body?.target as ResetTarget
    const confirmation = body?.confirmation

    if (!VALID_TARGETS.has(target)) {
      return NextResponse.json({ error: 'Target eliminazione non valido' }, { status: 400 })
    }

    if (confirmation !== `RESET ${target}`) {
      return NextResponse.json(
        { error: `Conferma non valida. Inserire "RESET ${target}"` },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()
    const errors: string[] = []
    let deletedSummary = ''

    const run = async (label: string, operation: PromiseLike<{ error: { message: string } | null }>) => {
      const { error } = await operation
      if (error) errors.push(`${label}: ${error.message}`)
    }

    if (target === 'ragazzi' || target === 'all') {
      await run('candidature BuonaCaccia', supabase.from('candidature_buonacaccia' as any).delete().neq('id', '00000000-0000-0000-0000-000000000000'))
      await run('partecipazioni eventi', supabase.from('partecipazioni_eventi').delete().neq('id', '00000000-0000-0000-0000-000000000000'))
      await run('quote mensili', supabase.from('quote_mensili').delete().neq('id', '00000000-0000-0000-0000-000000000000'))
      await run('riferimenti ragazzi in cassa', supabase.from('registro_spese').update({ ragazzo_id: null } as any).neq('id', '00000000-0000-0000-0000-000000000000'))
      await run('ragazzi', supabase.from('ragazzi').delete().neq('id', '00000000-0000-0000-0000-000000000000'))
      await run('pattuglie', supabase.from('pattuglie').delete().neq('id', '00000000-0000-0000-0000-000000000000'))
      deletedSummary += 'Anagrafica e Squadriglie svuotate. '
    }

    if (target === 'eventi' || target === 'all') {
      await run('partecipazioni eventi', supabase.from('partecipazioni_eventi').delete().neq('id', '00000000-0000-0000-0000-000000000000'))
      await run('eventi', supabase.from('eventi').delete().neq('id', '00000000-0000-0000-0000-000000000000'))
      deletedSummary += 'Eventi e Presenze svuotati. '
    }

    if (target === 'registro_spese' || target === 'all') {
      await run('registro spese', supabase.from('registro_spese').delete().neq('id', '00000000-0000-0000-0000-000000000000'))
      deletedSummary += 'Registro Spese e Cassa svuotati. '
    }

    if (target === 'quote_mensili' || target === 'all') {
      await run('quote mensili', supabase.from('quote_mensili').delete().neq('id', '00000000-0000-0000-0000-000000000000'))
      deletedSummary += 'Quote Mensili svuotate. '
    }

    if (target === 'buonacaccia' || target === 'all') {
      await run('candidature BuonaCaccia', supabase.from('candidature_buonacaccia' as any).delete().neq('id', '00000000-0000-0000-0000-000000000000'))
      await run('eventi BuonaCaccia', supabase.from('eventi_buonacaccia' as any).delete().neq('id', '00000000-0000-0000-0000-000000000000'))
      deletedSummary += 'BuonaCaccia svuotato. '
    }

    if (errors.length > 0) {
      console.error('Reset dati incompleto:', errors)
      return NextResponse.json(
        { error: 'Reset incompleto: alcune operazioni non sono riuscite' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: deletedSummary || 'Eliminazione completata.',
    })
  } catch (error: unknown) {
    const authResponse = authorizationErrorResponse(error)
    if (authResponse) return authResponse

    console.error('Errore reset dati:', error)
    return NextResponse.json({ error: 'Errore interno durante il reset' }, { status: 500 })
  }
}
