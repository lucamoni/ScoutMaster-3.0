import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database.types'
import { toCanonicalMetodo } from '@/lib/utils/payment'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { 
      ragazziIds, 
      eventoId, 
      statoPresenza, 
      riscosso, 
      metodoPagamento, 
      quotaDovuta 
    } = body as {
      ragazziIds: string[]
      eventoId: string
      statoPresenza?: string
      riscosso?: boolean
      metodoPagamento?: string
      quotaDovuta?: number | null
    }

    if (!eventoId || !ragazziIds || !Array.isArray(ragazziIds) || ragazziIds.length === 0) {
      return NextResponse.json({ error: 'Dati mancanti (eventoId o ragazziIds)' }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    const supabase = createClient<Database>(supabaseUrl, supabaseKey)

    // 1. Recupera l'evento target
    const { data: evento } = await supabase
      .from('eventi')
      .select('*')
      .eq('id', eventoId)
      .maybeSingle()

    if (!evento) {
      return NextResponse.json({ error: 'Evento non trovato' }, { status: 404 })
    }

    // 2. Se metodoPagamento è specificato dall'utente, aggiorna l'evento
    let targetEventoMetodo = toCanonicalMetodo(evento.metodo_pagamento, 'Bonifico')
    if (metodoPagamento !== undefined && metodoPagamento !== null) {
      const canonicalMet = toCanonicalMetodo(metodoPagamento, 'Bonifico')
      targetEventoMetodo = canonicalMet
      await supabase.from('eventi').update({ metodo_pagamento: canonicalMet }).eq('id', eventoId)
    }

    // 3. Batch Fetch: Ragazzi & Partecipazioni Esistenti
    const [{ data: ragazziList }, { data: existingParts }] = await Promise.all([
      supabase.from('ragazzi').select('id, nome, cognome').in('id', ragazziIds),
      supabase.from('partecipazioni_eventi').select('*').eq('evento_id', eventoId).in('ragazzo_id', ragazziIds)
    ])

    const ragazziMap = new Map((ragazziList || []).map(r => [r.id, r]))
    const existingPartsMap = new Map((existingParts || []).map(p => [p.ragazzo_id, p]))

    // 4. Prepara payload batch per partecipazioni_eventi
    const partPayloads = ragazziIds.map(rId => {
      const existingPart = existingPartsMap.get(rId)
      const newStato = statoPresenza !== undefined ? statoPresenza : (existingPart?.stato_presenza || 'Presente')
      const newRiscosso = riscosso !== undefined ? riscosso : (existingPart?.riscosso || false)
      const newMetodo = toCanonicalMetodo(
        metodoPagamento !== undefined 
          ? metodoPagamento 
          : (existingPart?.metodo_pagamento || targetEventoMetodo),
        'Bonifico'
      )
      const newQuota = quotaDovuta !== undefined ? quotaDovuta : (existingPart?.quota_dovuta ?? null)

      return {
        ...(existingPart?.id ? { id: existingPart.id } : {}),
        ragazzo_id: rId,
        evento_id: eventoId,
        stato_presenza: newStato,
        riscosso: newRiscosso,
        metodo_pagamento: newMetodo,
        quota_dovuta: newQuota
      }
    })

    // Upsert batch partecipazioni
    let { data: savedPartecipazioni, error: partErr } = await supabase
      .from('partecipazioni_eventi')
      .upsert(partPayloads, { onConflict: 'ragazzo_id, evento_id' })
      .select('*')

    if (partErr) {
      console.error('[SYNC BULK ERROR] Upsert partecipazioni fallito, tentando fallback uppercase:', partErr)
      const uppercasePartPayloads = partPayloads.map(p => ({
        ...p,
        stato_presenza: (p.stato_presenza || 'Presente').toUpperCase(),
        metodo_pagamento: (p.metodo_pagamento || 'Bonifico').toUpperCase()
      }))
      const retry = await supabase
        .from('partecipazioni_eventi')
        .upsert(uppercasePartPayloads, { onConflict: 'ragazzo_id, evento_id' })
        .select('*')
      savedPartecipazioni = retry.data
    }

    const finalParts = savedPartecipazioni || []
    const finalPartsMap = new Map(finalParts.map(p => [p.ragazzo_id, p]))

    // 5. Batch gestisci Registro Spese (Cassa)
    const partIds = finalParts.map(p => p.id).filter(Boolean)
    let existingSpeseMap = new Map<string, any>()

    if (partIds.length > 0) {
      const { data: existingSpese } = await supabase
        .from('registro_spese')
        .select('*')
        .in('partecipazione_evento_id', partIds)

      existingSpeseMap = new Map((existingSpese || []).map(s => [s.partecipazione_evento_id || '', s]))
    }

    const dateStr = new Date().toISOString().split('T')[0]
    const speseToUpsert: any[] = []
    const speseIdsToDelete: string[] = []

    for (const rId of ragazziIds) {
      const part = finalPartsMap.get(rId)
      if (!part) continue

      const existingSpesa = existingSpeseMap.get(part.id)
      const isRiscosso = part.riscosso === true
      const effectiveQuota = (part.quota_dovuta !== null && part.quota_dovuta !== undefined)
        ? Number(part.quota_dovuta)
        : Number(evento.quota_standard || 0)
      const canonicalMetodo = toCanonicalMetodo(part.metodo_pagamento || targetEventoMetodo, 'Bonifico')
      const rag = ragazziMap.get(rId)

      if (isRiscosso) {
        speseToUpsert.push({
          ...(existingSpesa?.id ? { id: existingSpesa.id } : {}),
          importo: effectiveQuota,
          metodo: canonicalMetodo,
          voce_spesa: `Evento: ${evento.nome_evento}`,
          tipo_movimento: 'ENTRATA',
          data: dateStr,
          ragazzo_id: rId,
          partecipazione_evento_id: part.id,
          note: `Pagamento ${evento.nome_evento} - ${rag?.nome || ''} ${rag?.cognome || ''}`.trim()
        })
      } else {
        if (existingSpesa?.id) {
          speseIdsToDelete.push(existingSpesa.id)
        }
      }
    }

    // Exec batch upsert spese & batch delete
    if (speseToUpsert.length > 0) {
      const { error: spesaErr } = await supabase.from('registro_spese').upsert(speseToUpsert).select()
      if (spesaErr) {
        const upperSpese = speseToUpsert.map(s => ({ ...s, metodo: String(s.metodo).toUpperCase() }))
        await supabase.from('registro_spese').upsert(upperSpese)
      }
    }

    if (speseIdsToDelete.length > 0) {
      await supabase.from('registro_spese').delete().in('id', speseIdsToDelete)
    }

    return NextResponse.json({
      success: true,
      updatedPartecipazioni: finalParts,
      updatedEventoMetodo: targetEventoMetodo,
      count: finalParts.length
    })

  } catch (error: unknown) {
    const err = error as Error
    console.error('Errore API sync uscite:', err)
    return NextResponse.json({ error: err.message || 'Errore interno server' }, { status: 500 })
  }
}
