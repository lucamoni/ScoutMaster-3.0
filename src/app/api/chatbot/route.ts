import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { Database } from '@/types/database.types'

async function getActiveGroqChatModels(apiKey: string): Promise<string[]> {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    })
    if (res.ok) {
      const data = await res.json()
      if (data.data && Array.isArray(data.data)) {
        // Escludi modelli non chat (whisper, guard, orpheus, compound)
        const chatModels = data.data
          .map((m: { id: string }) => m.id)
          .filter((id: string) => 
            !id.includes('whisper') && 
            !id.includes('guard') && 
            !id.includes('orpheus') && 
            !id.includes('compound')
          )
        
        if (chatModels.length > 0) {
          return chatModels.sort((a: any, b: any) => {
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

export async function POST(request: Request) {
  try {
    const { message } = await request.json()

    if (!message) {
      return NextResponse.json({ error: "Messaggio mancante" }, { status: 400 })
    }

    const cookieStore = await cookies()
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {}
          },
        },
      }
    )

    // Query sintetica per mantenere il payload sotto i 1.500 token
    const { data: ragazzi } = await supabase.from('ragazzi').select('id, nome, cognome, sesso, pattuglia').limit(40)
    const { data: eventi } = await supabase.from('eventi').select('id, nome_evento, quota_standard').limit(20)
    const { data: spese } = await supabase.from('registro_spese').select('importo, tipo_movimento, voce_spesa, data').order('data', { ascending: false }).limit(25)
    const { data: quote } = await supabase.from('quote_mensili').select('ragazzo_id, gennaio, febbraio, marzo, aprile, maggio, giugno, novembre, dicembre').limit(25)
    const { data: partecipazioni } = await supabase.from('partecipazioni_eventi').select('ragazzo_id, evento_id, riscosso, quota_dovuta').limit(25)

    let totaleEntrate = 0
    let totaleUscite = 0
    spese?.forEach(s => {
      if (s.tipo_movimento === 'ENTRATA') totaleEntrate += (s.importo || 0)
      else totaleUscite += (s.importo || 0)
    })
    const saldoAttuale = totaleEntrate - totaleUscite

    const dbContext = {
      riassunto_cassa: {
        totale_entrate: totaleEntrate,
        totale_uscite: totaleUscite,
        saldo_attuale: saldoAttuale,
        totale_ragazzi: ragazzi?.length || 0
      },
      ragazzi,
      eventi,
      ultime_spese: spese,
      quote_mensili: quote,
      partecipazioni_eventi: partecipazioni
    }

    const groqApiKey = process.env.GROQ_API_KEY || ''
    if (!groqApiKey) {
      return NextResponse.json({ 
        reply: "🔑 **Configurazione Groq Richiesta**:\nPer usare CassaBot con Groq (14.400 messaggi/giorno gratis), aggiungi la tua chiave `GROQ_API_KEY` nel file `.env.local`.\nPuoi generarla gratuitamente su [console.groq.com/keys](https://console.groq.com/keys)." 
      })
    }

    const systemPrompt = `Sei "CassaBot", l'assistente virtuale del Reparto Scout per la gestione della Cassa e delle presenze.
Rispondi alle domande dei Capi Reparto utilizzando ESCLUSIVAMENTE i seguenti dati sintetizzati dal database JSON:
${JSON.stringify(dbContext)}

Regole:
- Sii conciso e diretto.
- Se la risposta richiede un calcolo (es. totale cassa o saldo), usa i valori in 'riassunto_cassa'.
- Se ti chiedono un nome, cerca l'ID in 'ragazzi' e rispondi col nome.
- Se non trovi i dati per rispondere, dillo chiaramente. Non inventare.
- Il tuo tono deve essere professionale e amichevole, a tema scout.`

    // Filtra ed ottieni solo modelli di testo chat validi su Groq
    const models = await getActiveGroqChatModels(groqApiKey)
    let replyText = ''
    let lastError: Error | null = null

    for (const model of models) {
      try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${groqApiKey}`
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: message }
            ],
            temperature: 0.2
          })
        })

        const data = await response.json()
        if (!response.ok) {
          throw new Error(data.error?.message || `Groq API Error HTTP ${response.status}`)
        }

        if (data.choices && data.choices[0]?.message?.content) {
          let rawText = data.choices[0].message.content
          // Rimuovi eventuali blocchi di pensiero <think>...</think> restituiti dai modelli di reasoning (es. DeepSeek)
          rawText = rawText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
          if (rawText) {
            replyText = rawText
            break
          }
        }
      } catch (err: unknown) {
        lastError = err as Error
        console.warn(`Tentativo Groq modello ${model} non riuscito:`, err)
      }
    }

    if (!replyText) {
      throw lastError || new Error('Impossibile ottenere una risposta da Groq API.')
    }

    return NextResponse.json({ reply: replyText })
  } catch (error: unknown) {
    const err = error as Error
    console.error('Errore CassaBot Groq:', err)
    return NextResponse.json({ error: err.message || 'Errore elaborazione CassaBot Groq' }, { status: 500 })
  }
}
