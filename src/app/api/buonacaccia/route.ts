import { NextResponse } from 'next/server'
import { authorizationErrorResponse, requireAuthenticatedUser } from '@/lib/security/auth'
import { fetchBuonaCacciaHtml } from '@/lib/security/safeFetch'
import { parseEventDetail } from '@/lib/buonacaccia'

export async function POST(req: Request) {
  try {
    await requireAuthenticatedUser()
    const { url } = await req.json()
    if (typeof url !== 'string' || !url) return NextResponse.json({ error: 'URL mancante' }, { status: 400 })
    const html = await fetchBuonaCacciaHtml(url)
    return NextResponse.json({ data: parseEventDetail(html) })
  } catch (error) {
    return authorizationErrorResponse(error) ?? NextResponse.json({ error: 'Impossibile leggere i dettagli ufficiali dell’evento. Controlla il link e riprova.' }, { status: 502 })
  }
}
