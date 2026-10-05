import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveAnnualYear } from '@/lib/annualRoster/server'
import { sameOrigin } from '@/lib/issuedReceipts/server'
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
    sameOrigin(request)

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

    const year = await resolveAnnualYear(body.year)
    const { error } = await createAdminClient().rpc('reset_year_data', { p_year: year, p_target: target })
    if (error) return NextResponse.json({ error: error.code === 'P0001' ? error.message : 'Reset non eseguito: nessun dato è stato eliminato' }, { status: 409 })
    return NextResponse.json({success:true, message:`Dati ${year} svuotati. Gli altri anni sono conservati.`})

  } catch (error: unknown) {
    const authResponse = authorizationErrorResponse(error)
    if (authResponse) return authResponse

    console.error('Errore reset dati:', error)
    return NextResponse.json({ error: 'Errore interno durante il reset' }, { status: 500 })
  }
}
