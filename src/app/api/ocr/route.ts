import { NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    
    if (!file) {
      return NextResponse.json({ error: 'Nessun file fornito' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const base64Data = Buffer.from(bytes).toString('base64')

    console.log('KEY IN OCR API:', process.env.GEMINI_API_KEY ? 'Present' : 'Missing')
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' })
    
    const supabase = await createClient()
    const { data: catData } = await supabase.from('categorie_spesa').select('nome')
    const categorieNomi = catData && catData.length > 0 ? catData.map(c => c.nome) : ["Materiale da Lavoro", "KAMBU", "Materiale vario attività", "Altro"]
    const catListStr = JSON.stringify(categorieNomi)

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { text: `Sei un assistente per un reparto scout. Analizza questo scontrino ed estrai i seguenti dati: l'importo totale (solo numero), la data dell'operazione (formato YYYY-MM-DD), il nome del fornitore/negozio, e suggerisci una categoria tra ${catListStr}. Se è cibo o spesa alimentare usa preferibilmente KAMBU o alimentari. Se sono attrezzi, legno, ferramenta usa Materiale da Lavoro.` },
        { inlineData: { mimeType: file.type, data: base64Data } }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            importo: { type: "NUMBER" },
            data: { type: "STRING" },
            fornitore: { type: "STRING" },
            voce_spesa: { 
              type: "STRING", 
              enum: categorieNomi 
            }
          },
          required: ["importo", "data", "fornitore", "voce_spesa"]
        }
      }
    })

    if (!response.text) {
      throw new Error('Nessuna risposta dal modello Gemini')
    }

    const data = JSON.parse(response.text)
    return NextResponse.json(data)
  } catch (error: unknown) {
    const err = error as Error
    console.error('Errore OCR:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
