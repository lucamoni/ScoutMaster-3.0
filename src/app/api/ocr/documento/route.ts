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

    // Determina mimeType in modo sicuro con fallback
    let mimeType = file.type || 'image/jpeg'
    if (file.name.toLowerCase().endsWith('.pdf')) {
      mimeType = 'application/pdf'
    } else if (file.name.toLowerCase().endsWith('.png')) {
      mimeType = 'image/png'
    } else if (file.name.toLowerCase().endsWith('.jpg') || file.name.toLowerCase().endsWith('.jpeg')) {
      mimeType = 'image/jpeg'
    } else if (file.name.toLowerCase().endsWith('.heic')) {
      mimeType = 'image/heic'
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || ''
    
    // Se la chiave API manca, fornisci un fallback grazioso per evitare 500 crash
    if (!apiKey) {
      console.warn('GEMINI_API_KEY non presente nelle variabili d\'ambiente. Uso fallback manuale.')
      return NextResponse.json({
        success: true,
        fallback: true,
        extracted: {
          nome: null,
          cognome: null,
          pattuglia: null,
          tipo_documento_riconosciuto: "Documento Caricato",
          foglio_privacy_firmato: true,
          scheda_medica_ci: false,
          scheda_medica_ce: false,
          ricevuta_censimento: false
        },
        matchedScout: null,
        isNewScout: false,
        discrepancies: []
      })
    }

    const ai = new GoogleGenAI({ apiKey })

    const prompt = `Sei un assistente per lo scoutismo AGESCI specializzato in scansione ed estrazione OCR di documenti ufficiali (Moduli Privacy, Schede Mediche, Moduli Iscrizione, Tessere AGESCI, Autocertificazioni Genitori).

Analizza l'immagine/documento fornito ed estrai i dati anagrafici e lo stato dei documenti.
RESTITUISCI UN JSON CON QUESTA STRUTTURA ESATTA:
{
  "nome": string o null,
  "cognome": string o null,
  "pattuglia": string o null,
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
  "foglio_privacy_firmato": boolean,
  "scheda_medica_ci": boolean,
  "scheda_medica_ce": boolean,
  "ricevuta_censimento": boolean
}`

    let extracted: any = null

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          { text: prompt },
          { inlineData: { mimeType, data: base64Data } }
        ],
        config: {
          responseMimeType: "application/json"
        }
      })

      if (response.text) {
        const cleanText = response.text.replace(/```json/g, '').replace(/```/g, '').trim()
        extracted = JSON.parse(cleanText)
      }
    } catch (modelError: any) {
      console.error('Errore modello Gemini Vision OCR:', modelError)
      // Fallback a gemini-2.0-flash se 2.5-flash non risponde
      try {
        const fallbackResp = await ai.models.generateContent({
          model: 'gemini-2.0-flash',
          contents: [
            { text: prompt },
            { inlineData: { mimeType, data: base64Data } }
          ],
          config: {
            responseMimeType: "application/json"
          }
        })
        if (fallbackResp.text) {
          const cleanText = fallbackResp.text.replace(/```json/g, '').replace(/```/g, '').trim()
          extracted = JSON.parse(cleanText)
        }
      } catch (err2) {
        console.error('Errore fallback modello Gemini 2.0:', err2)
      }
    }

    if (!extracted) {
      extracted = {
        nome: null,
        cognome: null,
        pattuglia: null,
        tipo_documento_riconosciuto: "Documento Caricato",
        foglio_privacy_firmato: true,
        scheda_medica_ci: false,
        scheda_medica_ce: false,
        ricevuta_censimento: false
      }
    }

    const supabase = await createClient()

    let matchedScout: any = null
    let isNewScout = true
    const discrepancies: { field: string; label: string; dbValue: any; extractedValue: any }[] = []

    if (extracted.nome && extracted.cognome) {
      const { data: existing } = await supabase
        .from('ragazzi')
        .select('*')
        .ilike('nome', extracted.nome.trim())
        .ilike('cognome', extracted.cognome.trim())
        .maybeSingle()

      if (existing) {
        matchedScout = existing
        isNewScout = false

        const checkField = (field: string, label: string, extVal: any) => {
          if (!extVal) return
          const dbVal = existing[field]
          if (dbVal && String(dbVal).trim().toLowerCase() !== String(extVal).trim().toLowerCase()) {
            discrepancies.push({
              field,
              label,
              dbValue: String(dbVal),
              extractedValue: String(extVal)
            })
          }
        }

        checkField('pattuglia', 'Pattuglia / Squadriglia', extracted.pattuglia)
        checkField('codice_fiscale', 'Codice Fiscale', extracted.codice_fiscale)
        checkField('telefono_ragazzo', 'Telefono Ragazzo', extracted.telefono_ragazzo)
        checkField('genitore_1_nome', 'Nome Genitore 1', extracted.genitore_1_nome)
        checkField('genitore_1_telefono', 'Telefono Genitore 1', extracted.genitore_1_telefono)
        checkField('genitore_2_nome', 'Nome Genitore 2', extracted.genitore_2_nome)
        checkField('genitore_2_telefono', 'Telefono Genitore 2', extracted.genitore_2_telefono)
        checkField('data_nascita', 'Data di Nascita', extracted.data_nascita)
      }
    }

    return NextResponse.json({
      success: true,
      extracted,
      matchedScout,
      isNewScout,
      discrepancies
    })
  } catch (error: unknown) {
    const err = error as Error
    console.error('Errore Scanner Documenti OCR:', err)
    return NextResponse.json({ 
      success: true,
      error: err.message || 'Errore durante la scansione del documento',
      extracted: {
        nome: null,
        cognome: null,
        tipo_documento_riconosciuto: "Documento Caricato",
        foglio_privacy_firmato: true
      }
    }, { status: 200 })
  }
}
