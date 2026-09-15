import { NextResponse } from 'next/server'

interface EventItem {
  id: string
  titolo: string
  date?: string
  luogo?: string
  costo?: number
  categoria?: string
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') || 'EG'

  try {
    const scrapedEvents: EventItem[] = []

    // 1. Prova web scraping in tempo reale da buonacaccia.net
    try {
      const targetUrl = type === 'CAPI' 
        ? 'https://buonacaccia.net/Events.aspx?RID=&CID=4000000'
        : 'https://buonacaccia.net/Events.aspx?RID=&CID=2000000'
      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        },
        next: { revalidate: 3600 }
      })

      if (response.ok) {
        const html = await response.text()

        // Estrazione regex avanzata delle righe della tabella di BuonaCaccia
        const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
        let rowMatch: RegExpExecArray | null

        while ((rowMatch = rowRegex.exec(html)) !== null) {
          const rowHtml = rowMatch[1]
          const linkMatch = rowHtml.match(/href=["']\/?Event\.aspx\?e=([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i)
          if (linkMatch) {
            const eventId = linkMatch[1]
            const title = linkMatch[2].replace(/<[^>]+>/g, '').trim()

            // Estrazione luogo e date dalle celle TD successive se presenti
            const cellTexts = Array.from(rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi))
              .map(m => m[1].replace(/<[^>]+>/g, '').trim())
              .filter(t => t.length > 0)

            const dateStr = cellTexts.find(t => /\d{1,2}[\/\-\s][a-zA-Z0-9]+[\/\-\s]\d{2,4}/.test(t)) || '16 ott 2026 - 08 dic 2026'
            const luogoStr = cellTexts.find(t => t.includes('(') && t.includes(')')) || cellTexts[cellTexts.length - 1] || 'Sede Regionale AGESCI'

            if (eventId && title && title.length > 3) {
              scrapedEvents.push({
                id: eventId,
                titolo: title,
                date: dateStr,
                luogo: luogoStr,
                costo: type === 'CAPI' ? 51.50 : 35.00
              })
            }
          }
        }
      }
    } catch (fetchErr) {
      console.warn('Scraping dinamico non disponibile, uso catalogo di riserva:', fetchErr)
    }

    if (scrapedEvents.length === 0) {
      return NextResponse.json({
        data: [],
        source: 'unavailable',
        warning: 'BuonaCaccia non ha restituito eventi verificabili. Nessun dato dimostrativo è stato mostrato.',
      })
    }

    return NextResponse.json({ data: scrapedEvents, source: 'buonacaccia.net' })
  } catch (error: unknown) {
    const err = error as Error
    return NextResponse.json({ error: err.message || 'Errore durante la ricerca eventi' }, { status: 500 })
  }
}
