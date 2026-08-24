import { NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const debitori = body.debitori

    if (!debitori || debitori.length === 0) {
      return NextResponse.json({ message: "Nessun sospeso da segnalare." })
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

    const prompt = `Sei un Capo Scout. Devi scrivere un messaggio per il gruppo WhatsApp dei genitori per ricordare gentilmente di saldare le quote arretrate o consegnare i documenti mancanti.
Ecco la lista dei ragazzi e cosa manca a ciascuno:
${JSON.stringify(debitori, null, 2)}

Scrivi un messaggio amichevole ma chiaro. Saluta i genitori, inserisci l'elenco dei ragazzi in formato puntato con specificato chiaramente cosa devono saldare o consegnare, e ringrazia alla fine. Usa emoji appropriate a tema scout.`

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    })

    return NextResponse.json({ message: response.text })
  } catch (error: unknown) {
    const err = error as Error
    console.error('Errore Reminder API:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
