import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { google } from 'googleapis'
import { Database } from '@/types/database.types'
import { fetchPublicSheetValues, fetchPublicSheetTitles } from '@/lib/googleSheetsPublic'

async function getActiveGroqChatModels(apiKey: string): Promise<string[]> {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    })
    if (res.ok) {
      const data = await res.json()
      if (data.data && Array.isArray(data.data)) {
        const chatModels = data.data
          .map((m: { id: string }) => m.id)
          .filter((id: string) => 
            id &&
            !id.includes('whisper') && 
            !id.includes('guard') && 
            !id.includes('orpheus') && 
            !id.includes('compound') &&
            !id.includes('vision')
          )
        
        if (chatModels.length > 0) {
          return chatModels.sort((a: string, b: string) => {
            const score = (id: string) => {
              if (id.includes('llama-3.3')) return 10
              if (id.includes('llama-3.1-70b')) return 9
              if (id.includes('llama-3.1-8b')) return 8
              if (id.includes('llama3-70b')) return 7
              if (id.includes('llama3-8b')) return 6
              if (id.includes('qwen')) return 5
              if (id.includes('gemma')) return 4
              return 1
            }
            return score(b) - score(a)
          })
        }
      }
    }
  } catch (err) {
    console.warn('Impossibile recuperare lista dinamica modelli Groq:', err)
  }
  return ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'llama3-70b-8192', 'llama3-8b-8192']
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    const supabase = createClient<Database>(supabaseUrl, supabaseKey)

    // Recupera impostazioni dal DB
    const { data: settingsData } = await supabase.from('impostazioni').select('*')
    const settings: Record<string, string> = {}
    settingsData?.forEach(r => { settings[r.chiave] = r.valore })

    let spreadsheetId = searchParams.get('spreadsheetId') || settings.spreadsheet_id
    if (!spreadsheetId) {
      return NextResponse.json({ error: 'Nessun Spreadsheet ID inserito. Inserisci l\'ID del foglio prima di analizzare.' }, { status: 400 })
    }

    // Estrai l'ID puro da qualsiasi formato: URL completa, URL parziale o ID diretto
    const idMatch = spreadsheetId.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
      || spreadsheetId.match(/\/d\/([a-zA-Z0-9-_]+)/)
    if (idMatch) spreadsheetId = idMatch[1]
    // Rimuovi eventuali query string o hash rimasti
    spreadsheetId = spreadsheetId.split('?')[0].split('#')[0].trim()

    const rawSheetsData: Record<string, unknown[][]> = {}
    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
    let key = process.env.GOOGLE_PRIVATE_KEY
    if (key && key.includes('\\n')) key = key.replace(/\\n/g, '\n')

    let fetchedWithServiceAccount = false

    // 1. Prova con Google Service Account se configurato
    if (email && key) {
      try {
        const auth = new google.auth.JWT({
          email,
          key,
          scopes: ['https://www.googleapis.com/auth/spreadsheets']
        })
        const sheets = google.sheets({ version: 'v4', auth })
        const spreadsheetInfo = await sheets.spreadsheets.get({ spreadsheetId })
        const sheetTitles = spreadsheetInfo.data.sheets?.map(s => s.properties?.title) || []

        for (const title of sheetTitles) {
          if (!title) continue
          const res = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `'${title}'!A1:AZ4`
          })
          if (res.data.values && res.data.values.length > 0) {
            rawSheetsData[title] = res.data.values
          }
        }
        fetchedWithServiceAccount = true
      } catch (authErr) {
        console.warn('Lettura con Service Account non riuscita, provo la lettura pubblica:', authErr)
      }
    }

    // 2. Fallback: Lettura pubblica con gviz/tq
    if (!fetchedWithServiceAccount) {
      try {
        const sheetTitles = await fetchPublicSheetTitles(spreadsheetId)
        for (const title of sheetTitles) {
          try {
            const values = await fetchPublicSheetValues(spreadsheetId, title)
            if (values && values.length > 0) {
              rawSheetsData[title] = values.slice(0, 4)
            }
          } catch (tErr) {
            console.warn(`Impossibile leggere foglio ${title} in modalità pubblica:`, tErr)
          }
        }
        
        if (Object.keys(rawSheetsData).length === 0) {
          const mainValues = await fetchPublicSheetValues(spreadsheetId)
          if (mainValues && mainValues.length > 0) {
            rawSheetsData['Foglio1'] = mainValues.slice(0, 4)
          }
        }
      } catch (pubErr: unknown) {
        const err = pubErr as Error
        return NextResponse.json({ error: err.message || 'Impossibile accedere al foglio Google. Verifica la condivisione del link.' }, { status: 400 })
      }
    }

    if (Object.keys(rawSheetsData).length === 0) {
      return NextResponse.json({ error: 'Nessun dato o foglio leggibile trovato nel Google Spreadsheet.' }, { status: 400 })
    }

    // Compattazione dei dati per non eccedere il contesto dell'LLM
    const compactSheetsData: Record<string, string[][]> = {}
    for (const [sheetTitle, rows] of Object.entries(rawSheetsData)) {
      const slicedRows = rows.slice(0, 3)
      compactSheetsData[sheetTitle] = slicedRows.map(row => 
        (row || []).slice(0, 25).map(cell => {
          const str = String(cell || '').trim()
          return str.length > 30 ? str.substring(0, 30) + '...' : str
        })
      )
    }

    // Usa Gemini se disponibile, altrimenti Groq come fallback
    const geminiApiKey = process.env.GEMINI_API_KEY
    const groqApiKey = process.env.GROQ_API_KEY

    if (!geminiApiKey && !groqApiKey) {
      return NextResponse.json({ error: 'Nessuna chiave AI configurata. Aggiungi GEMINI_API_KEY o GROQ_API_KEY in .env.local' }, { status: 400 })
    }

    const dbSchema = {
      ragazzi: [
        "id", "nome", "cognome", "nome_cognome_ragazzo", "sesso", "pattuglia",
        "data_nascita", "codice_censimento", "residenza", "telefono_ragazzo",
        "genitore_1_nome", "genitore_1_telefono", "genitore_2_nome", "genitore_2_telefono",
        "note_sanitarie", "quota_censimento", "ricevuta_censimento", "foglio_privacy_firmato", "attivo"
      ],
      registro_spese: [
        "id", "data", "importo", "voce_spesa", "momento_anno", "metodo", "numero_operazione", "ricevuta_presente", "note"
      ],
      quote_mensili: [
        "id", "nome_cognome_ragazzo", "ragazzo_id", "anno_scout", "ottobre", "novembre", "dicembre", "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno"
      ],
      eventi: [
        "id", "nome_evento", "quota_standard", "metodo_pagamento", "tipo_evento", "data_inizio"
      ],
      partecipazioni_eventi: [
        "id", "nome_cognome_ragazzo", "ragazzo_id", "evento:NOME_DELL_EVENTO", "quota_dovuta", "riscosso", "metodo_pagamento", "stato_presenza"
      ]
    }

    const prompt = `Sei un assistente esperto in database scout e data mapping.
Ho un database Supabase con la seguente struttura:
${JSON.stringify(dbSchema, null, 2)}

Ho estratto le intestazioni e i primi dati di esempio dal file Google Sheets:
${JSON.stringify(compactSheetsData, null, 2)}

Mappa ogni foglio del Google Sheet alla tabella Supabase corretta.
Restituisci SOLO UN OGGETTO JSON con la seguente struttura:

{
  "mappings": [
    {
      "sheetName": "Nome Foglio Originale",
      "tableName": "ragazzi | registro_spese | quote_mensili | eventi | partecipazioni_eventi",
      "columnsMap": {
        "Intestazione Foglio": "nome_colonna_supabase"
      }
    }
  ]
}

REGOLE TASSATIVE E MANDATORIE DI MAPPATURA:
1. DEDUPLICAZIONE FOGLI (SOLO TAB PRINCIPALI):
   - Mappa l'Anagrafica SOLO dal foglio "Anagrafica" per ragazzi.
   - Mappa le Quote Mensili ESCLUSIVAMENTE dal foglio "Quote" per quote_mensili. NON mappare MAI "Foglio1", "Cassa", "Foglio Gestione" o "Entrate e Saldi" a quote_mensili!
   - Mappa le Presenze Eventi ESCLUSIVAMENTE dal foglio "Uscite" per partecipazioni_eventi.
   - Mappa le Spese ESCLUSIVAMENTE dal foglio "Spese", "SPESE", "Cassa" o "Uscite Cassa" per registro_spese.
2. NESSUNA MAPPATURA SU ID FITTIZI:
   - NON mappare MAI le colonne del foglio di tipo "ID", "N°", "Num", "Numero" su "id" o "ragazzo_id". Quelle colonne contengono numeri progressivi del foglio, NON UUID.
   - Mappa SEMPRE la colonna con il nome del ragazzo a "nome_cognome_ragazzo" o "nome" e "cognome". Supabase risolverà l'UUID tramite il nome.
3. ESECUZIONE UNPIVOT QUOTE ED EVENTI:
   - Per "quote_mensili": mappa "nome_cognome_ragazzo" e le colonne dei mesi ("ottobre", "novembre", "dicembre", "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno").
   - Per "partecipazioni_eventi": mappa "nome_cognome_ragazzo" e le colonne degli eventi usando il prefisso "evento:NOME_DELL_EVENTO" (es. "evento:San Giorgio", "evento:CON.CA.").
`

    let text = ''

    // ── 1. Prova con Gemini ──────────────────────────────────────────────────
    if (geminiApiKey && !text) {
      const geminiModels = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro']
      for (const model of geminiModels) {
        try {
          const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                  temperature: 0.1,
                  maxOutputTokens: 3000,
                  responseMimeType: 'application/json'
                }
              })
            }
          )

          if (!geminiRes.ok) {
            const errData = await geminiRes.json()
            console.warn(`Gemini ${model} fallito:`, errData.error?.message)
            continue
          }

          const geminiData = await geminiRes.json()
          const rawContent = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || ''
          if (rawContent) {
            text = rawContent
            break
          }
        } catch (err) {
          console.warn(`Eccezione con Gemini ${model}:`, err)
        }
      }
    }

    // ── 2. Fallback Groq ─────────────────────────────────────────────────────
    if (groqApiKey && !text) {
      const candidateModels = await getActiveGroqChatModels(groqApiKey)
      let lastError: Error | null = null

      for (const model of candidateModels) {
        try {
          const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${groqApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model,
              messages: [
                { role: 'system', content: 'Sei un assistente esperto in database scout e data mapping che risponde rigorosamente in formato JSON.' },
                { role: 'user', content: prompt }
              ],
              temperature: 0.1,
              max_tokens: 3000,
              response_format: { type: 'json_object' }
            })
          })

          if (!groqRes.ok) {
            const errData = await groqRes.json()
            const msg = errData.error?.message || `Errore Groq API HTTP ${groqRes.status}`
            console.warn(`Groq modello ${model} fallito: ${msg}`)
            lastError = new Error(msg)
            continue
          }

          const groqData = await groqRes.json()
          const rawContent = groqData.choices?.[0]?.message?.content?.trim() || ''
          if (rawContent) {
            text = rawContent
            break
          }
        } catch (err) {
          lastError = err as Error
          console.warn(`Eccezione con Groq modello ${model}:`, err)
        }
      }

      if (!text && lastError) throw lastError
    }

    if (!text) {
      throw new Error('Nessuna risposta ricevuta dal modello AI. Verifica la configurazione delle chiavi API.')
    }

    // Rimuovi tag di reasoning e formattazione markdown
    text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
    if (text.startsWith('```json')) {
      text = text.replace(/^```json\n?/, '').replace(/\n?```$/, '')
    } else if (text.startsWith('```')) {
      text = text.replace(/^```\n?/, '').replace(/\n?```$/, '')
    }

    const mappingResult = JSON.parse(text)
    if (!mappingResult.mappings || !Array.isArray(mappingResult.mappings)) {
      mappingResult.mappings = []
    }

    // GARANZIA SPESE: Se esiste un foglio Spese/SPESE/Cassa, assicurati che sia mappato su registro_spese
    const detectedSheetTitles = Object.keys(compactSheetsData)
    for (const sheetTitle of detectedSheetTitles) {
      const sUpper = sheetTitle.toUpperCase().trim()
      if (sUpper.includes('SPES') || sUpper === 'CASSA' || sUpper.includes('USCITE CASSA') || sUpper.includes('REGISTRO')) {
        const hasMappingForSheet = mappingResult.mappings.some((m: { sheetName?: string }) => 
          m && m.sheetName && String(m.sheetName).toUpperCase().trim() === sUpper
        )
        if (!hasMappingForSheet) {
          const firstRow = compactSheetsData[sheetTitle]?.[0] || []
          const colsMap: Record<string, string> = {}
          firstRow.forEach(h => {
            const hUpper = String(h || '').toUpperCase().trim()
            if (hUpper.includes('DATA')) colsMap[h] = 'data'
            else if (hUpper.includes('VOCE') || hUpper.includes('DESCRIZ') || hUpper.includes('CAUSALE') || hUpper.includes('ARTICOLO')) colsMap[h] = 'voce_spesa'
            else if (hUpper.includes('IMPORTO') || hUpper.includes('USCITA') || hUpper.includes('COSTO') || hUpper.includes('SPESA')) colsMap[h] = 'importo'
            else if (hUpper.includes('METODO') || hUpper.includes('PAGAMENTO')) colsMap[h] = 'metodo'
            else if (hUpper.includes('CATEGOR') || hUpper.includes('TIPO')) colsMap[h] = 'categoria'
          })

          mappingResult.mappings.push({
            sheetName: sheetTitle,
            tableName: 'registro_spese',
            columnsMap: Object.keys(colsMap).length > 0 ? colsMap : { Data: 'data', Voce: 'voce_spesa', Importo: 'importo', Metodo: 'metodo' }
          })
        }
      }
    }

    // Salva il mapping in supabase
    await supabase
      .from('impostazioni')
      .upsert({ chiave: 'ai_sheets_mapping', valore: JSON.stringify(mappingResult.mappings) })

    return NextResponse.json({ success: true, mappings: mappingResult.mappings, sheetsData: compactSheetsData })
  } catch (error: unknown) {
    const err = error as Error
    console.error('Errore AI map:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
