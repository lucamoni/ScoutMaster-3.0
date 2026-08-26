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

    // Fetch completo di ragazzi, eventi, partecipazioni (con join ragazzi), spese, quote e Buonacaccia
    const [ragazziRes, eventiRes, partecipazioniRes, speseRes, quoteRes, bcEventiRes, bcCandRes] = await Promise.all([
      supabase.from('ragazzi').select('id, nome, cognome, sesso, pattuglia, attivo').limit(100),
      supabase.from('eventi').select('id, nome_evento, quota_standard, data_inizio, tipo_evento').limit(50),
      supabase.from('partecipazioni_eventi').select('id, evento_id, ragazzo_id, presente, riscosso, quota_dovuta, ragazzi(nome, cognome, pattuglia)').limit(200),
      supabase.from('registro_spese').select('importo, tipo_movimento, voce_spesa, data, descrizione').order('data', { ascending: false }).limit(50),
      supabase.from('quote_mensili').select('ragazzo_id, gennaio, febbraio, marzo, aprile, maggio, giugno, luglio, agosto, settembre, ottobre, novembre, dicembre').limit(100),
      supabase.from('eventi_buonacaccia' as any).select('id, titolo, categoria, branca, data_inizio, luogo, costo_evento').limit(50),
      supabase.from('candidature_buonacaccia' as any).select('id, evento_id, ragazzo_id, stato_iscrizione, quota_pagata, ragazzi(nome, cognome, pattuglia)').limit(200)
    ])

    const allRagazzi = ragazziRes.data || []
    const ragazzi = allRagazzi.filter(r => r.attivo !== false)
    const eventi = eventiRes.data || []
    const partecipazioni = partecipazioniRes.data || []
    const spese = speseRes.data || []
    const quote = quoteRes.data || []
    const bcEventi = bcEventiRes.data || []
    const bcCandidature = bcCandRes.data || []

    let totaleEntrate = 0
    let totaleUscite = 0
    spese.forEach(s => {
      if (s.tipo_movimento === 'ENTRATA') totaleEntrate += (s.importo || 0)
      else totaleUscite += (s.importo || 0)
    })
    const saldoAttuale = totaleEntrate - totaleUscite

    // Mappa eventi con il conteggio e lista nomi dei presenti
    const eventiDettaglio = eventi.map(e => {
      const partEv = partecipazioni.filter(p => p.evento_id === e.id)
      const presenti = partEv.filter(p => p.presente !== false)
      const nomiPresenti = presenti.map((p: any) => `${p.ragazzi?.nome || ''} ${p.ragazzi?.cognome || ''} (${p.ragazzi?.pattuglia || 'Senza Sq.'})`).filter(Boolean)
      return {
        id: e.id,
        nome_evento: e.nome_evento,
        data_inizio: e.data_inizio,
        totale_iscritti: partEv.length,
        totale_presenti: presenti.length,
        nomi_presenti: nomiPresenti
      }
    })

    const dbContext = {
      riassunto_cassa: {
        totale_entrate: totaleEntrate,
        totale_uscite: totaleUscite,
        saldo_attuale: saldoAttuale,
        totale_ragazzi: ragazzi.length
      },
      ragazzi,
      eventi: eventiDettaglio,
      eventi_buonacaccia: bcEventi,
      candidature_buonacaccia: bcCandidature,
      ultime_spese: spese,
      quote_mensili: quote
    }

    const systemPrompt = `Sei "ScoutBot", l'assistente IA ufficiale del Reparto Scout per ScoutMaster 3.0.
Rispondi alle domande dei Capi Reparto utilizzando le seguenti informazioni estratte in tempo reale dal database:
${JSON.stringify(dbContext)}

Regole di risposta:
- Usa sempre formattazione Markdown pulita (es. **grassetto** per numeri e nomi, elenchi con - o *).
- Sii chiaro, sintetico e amichevole, a tema scoutismo AGESCI.
- Se ti chiedono delle presenze ad un evento (es. campo estivo, campo invernale, uscita), indica il numero esatto dei presenti ed elenca i nomi se disponibili.
- Se ti chiedono del saldo o della cassa, usa 'riassunto_cassa'.
- Se non trovi i dati per rispondere dillo con cortesia senza inventare.`

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

    // 3. Fallback locale intelligente se le API esterne non sono ancora configurate su Vercel
    const lowerMsg = message.toLowerCase()
    let fallbackReply = ''

    // Cerca corrispondenza su eventi o presenze
    const eventMatch = eventiDettaglio.find(e => lowerMsg.includes(e.nome_evento.toLowerCase()) || (lowerMsg.includes('estivo') && e.nome_evento.toLowerCase().includes('estivo')) || (lowerMsg.includes('invernale') && e.nome_evento.toLowerCase().includes('invernale')) || (lowerMsg.includes('uscita') && e.nome_evento.toLowerCase().includes('uscita')))

    if (eventMatch) {
      if (eventMatch.totale_presenti > 0) {
        const lista = eventMatch.nomi_presenti.slice(0, 15).map(n => `- **${n}**`).join('\n')
        fallbackReply = `⚜️ **Presenze per ${eventMatch.nome_evento}**:\nRisultano **${eventMatch.totale_presenti} ragazzi presenti** su ${eventMatch.totale_iscritti} iscritti.\n\n${lista}${eventMatch.nomi_presenti.length > 15 ? '\n- ...ed altri' : ''}`
      } else {
        fallbackReply = `⚜️ **${eventMatch.nome_evento}**: Risultano **${eventMatch.totale_iscritti} ragazzi iscritti** al momento.`
      }
    } else if (lowerMsg.includes('cassa') || lowerMsg.includes('saldo') || lowerMsg.includes('totale') || lowerMsg.includes('bilancio')) {
      fallbackReply = `⚜️ **Stato Cassa ScoutMaster**:\n- **Saldo Attuale**: **€${saldoAttuale.toFixed(2)}**\n- **Totale Entrate**: €${totaleEntrate.toFixed(2)}\n- **Totale Uscite**: €${totaleUscite.toFixed(2)}\n- **Ragazzi iscritti**: **${ragazzi.length}**`
    } else if (lowerMsg.includes('ragazz') || lowerMsg.includes('quanti') || lowerMsg.includes('iscritt') || lowerMsg.includes('presenti')) {
      fallbackReply = `⚜️ Nel Reparto ci sono attualmente **${ragazzi.length} ragazzi attivi** censiti. Per gli eventi specifica il nome dell'uscita (es. *"quanti al Campo Invernale?"*).`
    } else {
      fallbackReply = `⚜️ **ScoutBot**: Ciao! Il Reparto ha **${ragazzi.length} ragazzi attivi** ed un saldo cassa attuale di **€${saldoAttuale.toFixed(2)}**.`
    }

    return NextResponse.json({ reply: fallbackReply })
  } catch (error: unknown) {
    const err = error as Error
    console.error('Errore ScoutBot:', err)
    return NextResponse.json({ error: err.message || 'Errore elaborazione ScoutBot' }, { status: 500 })
  }
}
