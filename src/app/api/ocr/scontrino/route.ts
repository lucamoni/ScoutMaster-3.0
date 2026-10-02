import { GoogleGenAI } from '@google/genai'
import { NextResponse } from 'next/server'
import { authorizationErrorResponse, requireAuthenticatedUser } from '@/lib/security/auth'
import type { ReceiptOcrResult } from '@/lib/ocr/receipt'

export const maxDuration = 30

function dateOrNull(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null
}

function textOrNull(value: unknown, length: number): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, length) : null
}

export async function POST(request: Request) {
  try {
    await requireAuthenticatedUser()
    if (!process.env.GEMINI_API_KEY) return NextResponse.json({ error: 'Lettura scontrini da telefono non configurata. Puoi compilare i dati manualmente.' }, { status: 503 })
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File) || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return NextResponse.json({ error: 'Carica una foto JPEG, PNG o WebP.' }, { status: 415 })
    if (file.size === 0 || file.size > 4 * 1024 * 1024) return NextResponse.json({ error: 'Foto troppo grande: riprova con una foto più piccola.' }, { status: 413 })
    let categories: string[] = []
    try {
      const parsed: unknown = JSON.parse(String(form.get('categories') || '[]'))
      if (Array.isArray(parsed)) categories = parsed.filter((item): item is string => typeof item === 'string').slice(0, 100).map(item => item.slice(0, 80))
    } catch { /* Categoria facoltativa */ }
    const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { text: `Leggi questo scontrino italiano. Restituisci solo JSON con importo (numero totale effettivamente pagato, non subtotale/IVA/resto), data (YYYY-MM-DD o null), fornitore (stringa o null), voce_spesa (una delle categorie indicate o null), raw_text (testo breve leggibile sullo scontrino). Non inventare valori non visibili. Categorie: ${JSON.stringify(categories)}.` },
        { inlineData: { mimeType: file.type, data: base64 } },
      ],
      config: { responseMimeType: 'application/json', httpOptions: { timeout: 25_000 } },
    })
    const parsed: unknown = JSON.parse(response.text || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Risposta OCR non valida')
    const value = parsed as Record<string, unknown>
    const amount = typeof value.importo === 'number' ? value.importo : Number(String(value.importo ?? '').replace(',', '.'))
    const category = textOrNull(value.voce_spesa, 80)
    const result: ReceiptOcrResult = {
      provider: 'gemini-server',
      importo: Number.isFinite(amount) && amount > 0 && amount < 100000 ? Math.round(amount * 100) / 100 : null,
      data: dateOrNull(value.data),
      fornitore: textOrNull(value.fornitore, 120),
      voce_spesa: category && categories.includes(category) ? category : null,
      confidence: 0,
      raw_text: textOrNull(value.raw_text, 12000) || '',
    }
    return NextResponse.json(result)
  } catch (error) {
    const unauthorized = authorizationErrorResponse(error)
    if (unauthorized) return unauthorized
    const message = error instanceof Error ? error.message : 'Errore sconosciuto'
    console.error('Receipt OCR failed', message.replace(/AIza[\w-]+/g, '[redacted]').slice(0, 2000))
    let publicError = 'Lettura automatica non riuscita. Controlla la foto o compila la spesa manualmente.'
    if (/429|RESOURCE_EXHAUSTED|quota/i.test(message)) publicError = 'Il servizio OCR ha raggiunto il limite di utilizzo. Riprova più tardi o compila i dati manualmente.'
    else if (/API.?key|401|403|PERMISSION_DENIED|UNAUTHENTICATED/i.test(message)) publicError = 'La configurazione del servizio OCR non è valida. Compila i dati manualmente mentre viene ripristinata.'
    else if (/404|NOT_FOUND|not found/i.test(message)) publicError = 'Il modello per la lettura degli scontrini non è disponibile. Compila i dati manualmente.'
    else if (/timeout|abort|deadline/i.test(message)) publicError = 'Il servizio OCR non ha risposto in tempo. Riprova o compila i dati manualmente.'
    return NextResponse.json({ error: publicError }, { status: 502 })
  }
}
