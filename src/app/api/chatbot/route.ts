import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { Database } from '@/types/database.types'
import { GoogleGenAI } from '@google/genai'

export async function POST(request: Request) {
  try {
    const { message } = await request.json()

    if (!message) {
      return NextResponse.json({ error: "Messaggio mancante" }, { status: 400 })
    }

    const cookieStore = await cookies()
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'

    const supabase = createServerClient<Database>(url, key, {
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
    })

    const [ragazziRes, eventiRes, speseRes, quoteRes, partecipazioniRes] = await Promise.all([
      supabase.from('ragazzi').select('id, nome, cognome, sesso, pattuglia, attivo').eq('attivo', true).limit(50),
      supabase.from('eventi').select('id, nome_evento, quota_standard, data_inizio').limit(20),
      supabase.from('registro_spese').select('importo, tipo_movimento, voce_spesa, data').order('data', { ascending: false }).limit(30),
      supabase.from('quote_mensili').select('ragazzo_id, gennaio, febbraio, marzo, aprile, maggio, giugno, luglio, agosto, settembre, ottobre, novembre, dicembre').limit(50),
      supabase.from('partecipazioni_eventi').select('ragazzo_id, evento_id, riscosso, quota_dovuta').limit(50)
    ])

    const ragazzi = ragazziRes.data || []
    const eventi = eventiRes.data || []
    const spese = speseRes.data || []
    const quote = quoteRes.data || []
    const partecipazioni = partecipazioniRes.data || []

    let totaleEntrate = 0
    let totaleUscite = 0
    spese.forEach(s => {
      if (s.tipo_movimento === 'ENTRATA') totaleEntrate += (s.importo || 0)
      else totaleUscite += (s.importo || 0)
    })
    const saldoAttuale = totaleEntrate - totaleUscite

    const dbContext = {
      riassunto_cassa: {
        totale_entrate: totaleEntrate,
        totale_uscite: totaleUscite,
        saldo_attuale: saldoAttuale,
        totale_ragazzi: ragazzi.length
      },
      ragazzi,
      eventi,
      ultime_spese: spese,
      quote_mensili: quote,
      partecipazioni_eventi: partecipazioni
    }

    const systemPrompt = `Sei "ScoutBot", l'assistente IA ufficiale del Reparto Scout per ScoutMaster 3.0.
Rispondi alle domande dei Capi Reparto utilizzando le seguenti informazioni estratte in tempo reale dal database:
${JSON.stringify(dbContext)}

Regole di risposta:
- Sii chiaro, sintetico e amichevole, a tema scoutismo AGESCI.
- Rispondi in italiano preciso.
- Se ti chiedono del saldo o della cassa, usa 'riassunto_cassa'.
- Se ti chiedono dei ragazzi o presenze/quote, consulta 'ragazzi', 'quote_mensili' o 'partecipazioni_eventi'.
- Se non conosci una risposta non inventare dati.`

    // 1. Prova prima con Gemini API (se presente GEMINI_API_KEY)
    if (process.env.GEMINI_API_KEY) {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [
            {
              text: `${systemPrompt}\n\nDomanda utente: ${message}`
            }
          ]
        })
        if (response.text) {
          return NextResponse.json({ reply: response.text.trim() })
        }
      } catch (geminiErr) {
        console.warn('Fallback Gemini per ScoutBot fallito, provo Groq:', geminiErr)
      }
    }

    // 2. Prova con Groq API (se presente GROQ_API_KEY)
    if (process.env.GROQ_API_KEY) {
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: message }
            ],
            temperature: 0.2
          })
        })

        if (res.ok) {
          const data = await res.json()
          let rawText = data.choices?.[0]?.message?.content || ''
          rawText = rawText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
          if (rawText) {
            return NextResponse.json({ reply: rawText })
          }
        }
      } catch (groqErr) {
        console.warn('Fallback Groq per ScoutBot fallito:', groqErr)
      }
    }

    // 3. Fallback intelligente locale se nessuna API key è configurata o se le API esterne sono offline
    const lowerMsg = message.toLowerCase()
    let fallbackReply = ''

    if (lowerMsg.includes('cassa') || lowerMsg.includes('saldo') || lowerMsg.includes('totale') || lowerMsg.includes('bilancio')) {
      fallbackReply = `⚜️ **Stato Cassa ScoutMaster**:\n- **Saldo Attuale**: €${saldoAttuale.toFixed(2)}\n- **Totale Entrate**: €${totaleEntrate.toFixed(2)}\n- **Totale Uscite**: €${totaleUscite.toFixed(2)}\n- **Ragazzi iscritti**: ${ragazzi.length}`
    } else if (lowerMsg.includes('ragazz') || lowerMsg.includes('quanti') || lowerMsg.includes('iscritt')) {
      fallbackReply = `⚜️ Nel Reparto ci sono attualmente **${ragazzi.length} ragazzi attivi** censiti su ScoutMaster.`
    } else {
      fallbackReply = `⚜️ **ScoutBot**: Ciao! Il Reparto ha un saldo cassa di **€${saldoAttuale.toFixed(2)}** con **${ragazzi.length} ragazzi attivi**.\nPer risposte IA avanzate, configura \`GEMINI_API_KEY\` o \`GROQ_API_KEY\` nelle variabili di ambiente.`
    }

    return NextResponse.json({ reply: fallbackReply })
  } catch (error: unknown) {
    const err = error as Error
    console.error('Errore ScoutBot:', err)
    return NextResponse.json({ error: err.message || 'Errore elaborazione ScoutBot' }, { status: 500 })
  }
}
