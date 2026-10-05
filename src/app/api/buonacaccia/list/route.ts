import { NextResponse } from 'next/server'
import { authorizationErrorResponse, requireAuthenticatedUser } from '@/lib/security/auth'
import { fetchBuonaCacciaHtml } from '@/lib/security/safeFetch'
import { BUONACACCIA_ORIGIN, parseEventCatalog } from '@/lib/buonacaccia'

export async function GET(req: Request) {
  try {
    await requireAuthenticatedUser()
    const type = new URL(req.url).searchParams.get('type') || 'EG'
    if (!['EG', 'CAPI'].includes(type)) return NextResponse.json({ error: 'Categoria non valida' }, { status: 400 })
    const html = await fetchBuonaCacciaHtml(`${BUONACACCIA_ORIGIN}/Events.aspx?RID=&CID=${type === 'CAPI' ? '4000000' : '2000000'}`)
    const data = parseEventCatalog(html)
    return NextResponse.json({ data, source: 'buonacaccia.agesci.it' })
  } catch (error) {
    return authorizationErrorResponse(error) ?? NextResponse.json({ error: 'Impossibile leggere il catalogo BuonaCaccia. Riprova tra poco.' }, { status: 502 })
  }
}
