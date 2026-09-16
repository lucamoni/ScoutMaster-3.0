import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authorizationErrorResponse, requireRole } from '@/lib/security/auth'
import { toCanonicalMetodo } from '@/lib/utils/payment'

export async function POST(request: Request) {
  try {
    await requireRole(['admin', 'capo', 'tesoriere'])
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
    if (quotaDovuta != null && (!Number.isFinite(Number(quotaDovuta)) || Number(quotaDovuta) < 0)) {
      return NextResponse.json({ error: 'La quota dovuta deve essere un importo valido e non negativo' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // 1. Recupera l'evento target
    const { data: evento, error: eventoError } = await supabase
      .from('eventi')
      .select('*')
      .eq('id', eventoId)
      .maybeSingle()

    if (eventoError) throw eventoError
    if (!evento) {
      return NextResponse.json({ error: 'Evento non trovato' }, { status: 404 })
    }

    // 2. Se metodoPagamento è specificato dall'utente, aggiorna l'evento
    let targetEventoMetodo = toCanonicalMetodo(evento.metodo_pagamento, 'Bonifico')
    if (metodoPagamento !== undefined && metodoPagamento !== null) {
      const canonicalMet = toCanonicalMetodo(metodoPagamento, 'Bonifico')
      targetEventoMetodo = canonicalMet
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
    const { data: initialSavedPartecipazioni, error: partErr } = await supabase
      .from('partecipazioni_eventi')
      .upsert(partPayloads, { onConflict: 'ragazzo_id, evento_id' })
      .select('*')

    let savedPartecipazioni = initialSavedPartecipazioni
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

      if (retry.error) throw retry.error
      savedPartecipazioni = retry.data
    }

    const finalParts = savedPartecipazioni || []
    if (finalParts.length !== ragazziIds.length) {
      throw new Error('Non tutte le partecipazioni sono state salvate')
    }
    const finalPartsMap = new Map(finalParts.map(p => [p.ragazzo_id, p]))
    const rollbackPaymentStates = async () => {
      await Promise.all(finalParts.map(part => {
        const previous = existingPartsMap.get(part.ragazzo_id)
        return supabase
          .from('partecipazioni_eventi')
          .update({ riscosso: previous?.riscosso === true })
          .eq('id', part.id)
      }))
    }

    // 5. Batch gestisci Registro Spese (Cassa)
    const partIds = finalParts.map(p => p.id).filter(Boolean)
    let existingSpeseMap = new Map<string, any>()

    if (partIds.length > 0) {
      const { data: existingSpese, error: existingSpeseError } = await supabase
        .from('registro_spese')
        .select('*')
        .in('partecipazione_evento_id', partIds)

      if (existingSpeseError) throw existingSpeseError
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
      if (!Number.isFinite(effectiveQuota) || effectiveQuota < 0) {
        await rollbackPaymentStates()
        throw new Error(`Quota non valida per il ragazzo ${rId}`)
      }
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

    // Exec batch upsert spese & batch delete. Never report success if the
    // ledger rejected a movement (for example because the year is closed).
    if (speseToUpsert.length > 0) {
      let { error: spesaErr } = await supabase.from('registro_spese').upsert(speseToUpsert).select()
      if (spesaErr && (spesaErr.code === '23514' || spesaErr.message?.includes('metodo'))) {
        const upperSpese = speseToUpsert.map(s => ({ ...s, metodo: String(s.metodo).toUpperCase() }))
        const retry = await supabase.from('registro_spese').upsert(upperSpese)
        spesaErr = retry.error
      }

      if (spesaErr) {
        await rollbackPaymentStates()
        throw spesaErr
      }
    }

    if (speseIdsToDelete.length > 0) {
      const { error: deleteError } = await supabase
        .from('registro_spese')
        .delete()
        .in('id', speseIdsToDelete)

      if (deleteError) {
        await rollbackPaymentStates()
        throw deleteError
      }
    }

    if (metodoPagamento !== undefined && metodoPagamento !== null) {
      const { error: methodError } = await supabase
        .from('eventi')
        .update({ metodo_pagamento: targetEventoMetodo })
        .eq('id', eventoId)
      if (methodError) throw methodError
    }

    return NextResponse.json({
      success: true,
      updatedPartecipazioni: finalParts,
      updatedEventoMetodo: targetEventoMetodo,
      count: finalParts.length
    })

  } catch (error: unknown) {
    const authResponse = authorizationErrorResponse(error)
    if (authResponse) return authResponse

    const err = error as Error
    console.error('Errore API sync uscite:', err)
    return NextResponse.json({ error: err.message || 'Errore interno server' }, { status: 500 })
  }
}
