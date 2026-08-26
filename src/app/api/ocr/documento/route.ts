import { NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'Nessun file o documento fornito' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const base64Data = Buffer.from(bytes).toString('base64')

    const apiKey = process.env.GEMINI_API_KEY || ''
    if (!apiKey) {
      return NextResponse.json({ error: 'Chiave GEMINI_API_KEY non configurata' }, { status: 500 })
    }

    const ai = new GoogleGenAI({ apiKey })

    const prompt = `Sei un assistente per lo scoutismo AGESCI specializzato in scansione ed estrazione OCR di documenti ufficiali (Moduli Privacy, Schede Mediche, Moduli Iscrizione, Tessere AGESCI, Autocertificazioni Genitori).

Analizza l'immagine/documento fornito ed estrai con estrema precisione i dati anagrafici e lo stato dei documenti.
RESTITUISCI UN JSON CON QUESTA STRUTTURA ESATTA:
{
  "nome": string o null,
  "cognome": string o null,
  "pattuglia": string o null, (es. Aquile, Volpi, Leoni, Castori, ecc.)
  "sesso": string o null, ("M" o "F")
  "data_nascita": string o null, (formato YYYY-MM-DD)
  "codice_fiscale": string o null,
  "telefono_ragazzo": string o null,
  "genitore_1_nome": string o null,
  "genitore_1_telefono": string o null,
  "genitore_2_nome": string o null,
  "genitore_2_telefono": string o null,
  "email": string o null,
  "indirizzo": string o null,
  "tipo_documento_riconosciuto": string, (es. "Modulo Privacy AGESCI", "Scheda Medica", "Censimento", "Tessera AGESCI", "Altro")
  "foglio_privacy_firmato": boolean, (true se il documento è un modulo privacy firmato)
  "scheda_medica_ci": boolean, (true se è la scheda medica per Campo Invernale)
  "scheda_medica_ce": boolean, (true se è la scheda medica per Campo Estivo)
  "ricevuta_censimento": boolean (true se è la ricevuta o modulo di censimento)
}`

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { text: prompt },
        { inlineData: { mimeType: file.type, data: base64Data } }
      ],
      config: {
        responseMimeType: "application/json"
      }
    })

    if (!response.text) {
      throw new Error('Nessuna risposta dal modello Gemini OCR Documenti')
    }

    let extractedData = JSON.parse(response.text)

    // Se troviamo Nome e Cognome, proviamo ad aggiornare/sincronizzare subito il database Supabase
    if (extractedData.nome && extractedData.cognome) {
      const supabase = await createClient()

      // Cerca se il ragazzo esiste già in anagrafica
      const { data: existing } = await supabase
        .from('ragazzi')
        .select('*')
        .ilike('nome', extractedData.nome.trim())
        .ilike('cognome', extractedData.cognome.trim())
        .maybeSingle()

      const updatePayload: Record<string, any> = {}

      if (extractedData.pattuglia) updatePayload.pattuglia = extractedData.pattuglia
      if (extractedData.sesso) updatePayload.sesso = extractedData.sesso
      if (extractedData.data_nascita) updatePayload.data_nascita = extractedData.data_nascita
      if (extractedData.codice_fiscale) updatePayload.codice_fiscale = extractedData.codice_fiscale
      if (extractedData.telefono_ragazzo) updatePayload.telefono_ragazzo = extractedData.telefono_ragazzo
      if (extractedData.genitore_1_nome) updatePayload.genitore_1_nome = extractedData.genitore_1_nome
      if (extractedData.genitore_1_telefono) updatePayload.genitore_1_telefono = extractedData.genitore_1_telefono
      if (extractedData.genitore_2_nome) updatePayload.genitore_2_nome = extractedData.genitore_2_nome
      if (extractedData.genitore_2_telefono) updatePayload.genitore_2_telefono = extractedData.genitore_2_telefono

      if (extractedData.foglio_privacy_firmato) updatePayload.foglio_privacy_firmato = true
      if (extractedData.scheda_medica_ci) updatePayload.scheda_medica_ci = true
      if (extractedData.scheda_medica_ce) updatePayload.scheda_medica_ce = true
      if (extractedData.ricevuta_censimento) updatePayload.ricevuta_censimento = true

      if (existing) {
        await supabase.from('ragazzi').update(updatePayload).eq('id', existing.id)
        extractedData.db_status = 'updated'
        extractedData.ragazzo_id = existing.id
      } else {
        const { data: inserted } = await supabase.from('ragazzi').insert({
          nome: extractedData.nome.trim(),
          cognome: extractedData.cognome.trim(),
          attivo: true,
          ...updatePayload
        }).select().maybeSingle()

        if (inserted) {
          extractedData.db_status = 'created'
          extractedData.ragazzo_id = inserted.id
        }
      }
    }

    return NextResponse.json({ success: true, data: extractedData })
  } catch (error: unknown) {
    const err = error as Error
    console.error('Errore Scanner Documenti OCR:', err)
    return NextResponse.json({ error: err.message || 'Errore durante la scansione del documento' }, { status: 500 })
  }
}
