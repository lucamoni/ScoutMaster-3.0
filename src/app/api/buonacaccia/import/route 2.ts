import { NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const { input } = await request.json()

    if (!input || !input.trim()) {
      return NextResponse.json({ error: 'Fornire un link o testo da BuonaCaccia' }, { status: 400 })
    }

    let contentToAnalyze = input.trim()

    // Se l'input è un URL, scarica il contenuto HTML
    if (contentToAnalyze.startsWith('http://') || contentToAnalyze.startsWith('https://')) {
      try {
        const res = await fetch(contentToAnalyze, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7'
          }
        })
        if (res.ok) {
          const html = await res.text()
          contentToAnalyze = html
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
            .substring(0, 15000)
        }
      } catch (err) {
        console.warn('Impossibile scaricare l\'URL, procedo con l\'analisi del testo:', err)
      }
    }

    const parsedData = {
      nome_evento: input.trim(),
      quota_standard: 0,
      tipo_evento: 'USCITA',
      data_inizio: new Date().toISOString().split('T')[0]
    }

    // Tenta l'estrazione intelligente con Gemini 3.6 Flash
    if (process.env.GEMINI_API_KEY) {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
        const response = await ai.models.generateContent({
          model: 'gemini-3.6-flash',
          contents: [
            {
              text: `Sei un assistente per la gestione di un Reparto Scout. Estrai i dati dell'evento BuonaCaccia dal seguente contenuto:
${contentToAnalyze}

Restituisci i dati con la seguente struttura:
- nome_evento: Nome sintetico dell'evento (es. "San Giorgio 2026", "Campo Invernale 2026").
- quota_standard: Quota in euro (solo numero, es. 25 o 40). Se non specificato usa 0.
- tipo_evento: Uno tra: "CI", "CE", "USCITA", "ALTRO".
- data_inizio: Data nel formato YYYY-MM-DD o null.`
            }
          ],
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                nome_evento: { type: 'STRING' },
                quota_standard: { type: 'NUMBER' },
                tipo_evento: { type: 'STRING', enum: ['CI', 'CE', 'USCITA', 'ALTRO'] },
                data_inizio: { type: 'STRING', nullable: true }
              },
              required: ['nome_evento', 'quota_standard', 'tipo_evento']
            }
          }
        })

        if (response.text) {
          const aiParsed = JSON.parse(response.text)
          if (aiParsed.nome_evento) parsedData.nome_evento = aiParsed.nome_evento
          if (aiParsed.quota_standard !== undefined) parsedData.quota_standard = Number(aiParsed.quota_standard) || 0
          if (aiParsed.tipo_evento) parsedData.tipo_evento = aiParsed.tipo_evento
          if (aiParsed.data_inizio) parsedData.data_inizio = aiParsed.data_inizio
        }
      } catch (geminiErr) {
        console.warn('Fallback estrazione Gemini:', geminiErr)
      }
    }

    // RegEx fallback per la quota se 0
    if (parsedData.quota_standard === 0) {
      const matchEuro = input.match(/(?:€|euro)\s*(\d+(?:[.,]\d+)?)/i) || input.match(/(\d+(?:[.,]\d+)?)\s*(?:€|euro)/i)
      if (matchEuro) {
        parsedData.quota_standard = parseFloat(matchEuro[1].replace(',', '.'))
      }
    }

    const supabase = await createClient()

    // 1. Controlla se l'evento esiste già per evitare duplicati o errori
    const { data: eventoEsistente } = await supabase
      .from('eventi')
      .select('*')
      .ilike('nome_evento', parsedData.nome_evento)
      .maybeSingle()

    let targetEvento = eventoEsistente

    if (!targetEvento) {
      const { data: nuovoEvento, error: errEvento } = await supabase
        .from('eventi')
        .insert({
          nome_evento: parsedData.nome_evento,
          quota_standard: parsedData.quota_standard,
          tipo_evento: parsedData.tipo_evento,
          data_inizio: parsedData.data_inizio,
          metodo_pagamento: 'Contanti'
        })
        .select()
        .single()

      if (errEvento) {
        throw new Error(`Errore durante il salvataggio dell'evento: ${errEvento.message}`)
      }
      targetEvento = nuovoEvento

      // Inserisci categoria di spesa per la cassa
      await supabase.from('categorie_spesa').insert({
        nome: `Evento: ${targetEvento.nome_evento}`,
        tipo_movimento: 'ENTRATA'
      })
    }

    // 2. Assicura che tutti gli esploratori abbiano la riga di partecipazione per questo evento
    const { data: ragazzi } = await supabase.from('ragazzi').select('id').eq('attivo', true)

    if (ragazzi && ragazzi.length > 0) {
      const partecRows = ragazzi.map(r => ({
        ragazzo_id: r.id,
        evento_id: targetEvento.id,
        stato_presenza: 'Assente',
        riscosso: false,
        quota_dovuta: targetEvento.quota_standard,
        metodo_pagamento: 'Contanti'
      }))

      await supabase
        .from('partecipazioni_eventi')
        .upsert(partecRows, { onConflict: 'ragazzo_id,evento_id', ignoreDuplicates: true })
    }

    // 3. Ritorna l'evento e le partecipazioni popolate
    const { data: partecipazioni } = await supabase
      .from('partecipazioni_eventi')
      .select('*')
      .eq('evento_id', targetEvento.id)

    return NextResponse.json({
      success: true,
      evento: targetEvento,
      partecipazioni: partecipazioni || []
    })
  } catch (error: unknown) {
    const err = error as Error
    console.error('Errore Importazione BuonaCaccia:', err)
    return NextResponse.json({ error: err.message || 'Errore durante l\'importazione dell\'evento' }, { status: 500 })
  }
}
