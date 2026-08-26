import { NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'

export async function POST(req: Request) {
  try {
    const { url } = await req.json()
    if (!url) {
      return NextResponse.json({ error: 'URL mancante' }, { status: 400 })
    }

    let rawHtml = ''
    let cleanText = url

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
        }
      })
      
      if (response.ok) {
        rawHtml = await response.text()
        cleanText = rawHtml
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .substring(0, 30000)
      }
    } catch (fetchErr) {
      console.warn('Impossibile scaricare direttamente l\'URL, procedo con l\'analisi del testo:', fetchErr)
    }

    // Direct regex extraction fallback from HTML
    let extractedTitle: string | null = null
    if (rawHtml) {
      const titleMatch = rawHtml.match(/<title>([^<]+)<\/title>/i) || rawHtml.match(/<h[12][^>]*>([^<]+)<\/h[12]>/i)
      if (titleMatch && titleMatch[1]) {
        let t = titleMatch[1].replace(/- Buona\s?Caccia/i, '').replace(/BuonaCaccia/i, '').trim()
        if (t.length > 3) extractedTitle = t
      }
    }

    let eventData = {
      titolo: extractedTitle || 'Evento BuonaCaccia',
      categoria: 'Specialita',
      branca: 'EG',
      regione: null,
      luogo: null,
      data_inizio: new Date().toISOString().split('T')[0],
      data_fine: null,
      apertura_iscrizioni: null,
      chiusura_iscrizioni: null,
      costo_evento: 0,
      note: null
    }

    if (process.env.GEMINI_API_KEY) {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
        const response = await ai.models.generateContent({
          model: 'gemini-2.0-flash',
          contents: [
            {
              text: `Sei un assistente per lo scoutismo AGESCI. Analizza il seguente testo dell'evento BuonaCaccia ed estrai i dati richiesti.
RESTITUISCI SOLO UN OGGETTO JSON.
Se non trovi un'informazione, imposta il valore a null.
Le date devono essere nel formato YYYY-MM-DD.
Le date di iscrizione se presenti devono essere nel formato YYYY-MM-DDTHH:mm:00Z.

I campi JSON attesi sono:
{
  "titolo": string, (titolo completo dell'evento compreso di regione e tipo se presente, es. '[Campania] CFM L/C - Ottobre - Dicembre mod. B')
  "categoria": string, (uno tra: 'Specialita', 'Competenza', 'CFT', 'CFM', 'CFA', 'Piccole Orme', 'Altro')
  "branca": string, (uno tra: 'EG', 'CAPI')
  "regione": string, (regione dell'evento se specificata)
  "luogo": string, (località/indirizzo esatto dell'evento, es. 'Aiello del Sabato (AV)')
  "data_inizio": string, (YYYY-MM-DD)
  "data_fine": string, (YYYY-MM-DD)
  "apertura_iscrizioni": string, (ISO string)
  "chiusura_iscrizioni": string, (ISO string)
  "costo_evento": number, (il costo in euro come numero decimale, es. 51.50)
  "note": string
}

Testo da analizzare:
${cleanText}`
            }
          ],
          config: {
            responseMimeType: 'application/json'
          }
        })

        if (response.text) {
          let jsonStr = response.text.trim()
          if (jsonStr.startsWith('```json')) {
            jsonStr = jsonStr.replace(/^```json\n?/, '').replace(/\n?```$/, '')
          } else if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/^```\n?/, '').replace(/\n?```$/, '')
          }
          const aiParsed = JSON.parse(jsonStr)
          eventData = { ...eventData, ...aiParsed }
        }
      } catch (geminiErr) {
        console.warn('Fallback Gemini per evento BuonaCaccia:', geminiErr)
      }
    }

    return NextResponse.json({ data: eventData })
  } catch (error: unknown) {
    const err = error as Error
    console.error('Errore analisi evento:', err)
    return NextResponse.json({ error: 'Impossibile estrarre i dati con l\'IA: ' + err.message }, { status: 500 })
  }
}
