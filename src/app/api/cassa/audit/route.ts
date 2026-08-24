import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Database } from '@/types/database.types'
import { toCanonicalMetodo } from '@/lib/utils/payment'

export const dynamic = 'force-dynamic'

const MONTHS_LIST = ['novembre', 'dicembre', 'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno']

export async function POST() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    const supabase = createClient<Database>(supabaseUrl, supabaseKey)

    // 1. Carica impostazioni
    const { data: settingsData } = await supabase.from('impostazioni').select('*')
    const settings: Record<string, string> = {}
    if (settingsData) {
      settingsData.forEach(s => { settings[s.chiave] = s.valore })
    }

    const quotaMensileStandard = Number(settings.quota_mensile_standard || '10') || 10
    const quotaCensimentoStandard = Number(settings.quota_censimento_standard || '45') || 45
    const dateStr = new Date().toISOString().split('T')[0]

    // 2. Fetch di tutte le tabelle rilevanti
    const [
      { data: ragazzi },
      { data: eventi },
      { data: partecipazioni },
      { data: quote },
      { data: spese }
    ] = await Promise.all([
      supabase.from('ragazzi').select('*').eq('attivo', true),
      supabase.from('eventi').select('*'),
      supabase.from('partecipazioni_eventi').select('*'),
      supabase.from('quote_mensili').select('*'),
      supabase.from('registro_spese').select('*')
    ])

    const allRagazzi = ragazzi || []
    const allEventi = eventi || []
    const allPartecipazioni = partecipazioni || []
    const allQuote = quote || []
    let allSpese = spese || []

    let orfaniRicreati = 0
    let duplicatiRimossi = 0

    // --- CHECK 1: ORFANI DI CASSA (Ricrea entrate mancanti) ---

    // 1A. Quote Mensili
    for (const q of allQuote) {
      const rag = allRagazzi.find(r => r.id === q.ragazzo_id)
      for (const m of MONTHS_LIST) {
        const isPaid = (q as Record<string, unknown>)[m] === true
        if (isPaid) {
          const matchSpesa = allSpese.find(s => 
            s.tipo_movimento === 'ENTRATA' &&
            s.ragazzo_id === q.ragazzo_id &&
            (s.quota_mensile_id === q.id || s.riferimento_quota === m || (s.voce_spesa === 'Quota Mensile' && s.note?.toLowerCase().includes(m)))
          )

          if (!matchSpesa) {
            const { data: inserted, error: errIns } = await supabase.from('registro_spese').insert({
              importo: quotaMensileStandard,
              metodo: 'Contanti',
              voce_spesa: 'Quota Mensile',
              tipo_movimento: 'ENTRATA',
              data: dateStr,
              ragazzo_id: q.ragazzo_id,
              quota_mensile_id: q.id,
              riferimento_quota: m,
              note: `Quota ${m.substring(0,3).toUpperCase()} - ${rag?.nome || ''} ${rag?.cognome || ''}`.trim()
            }).select('*').single()

            if (!errIns && inserted) {
              orfaniRicreati++
              allSpese.push(inserted)
            }
          }
        }
      }
    }

    // 1B. Eventi / Uscite
    for (const part of allPartecipazioni) {
      if (part.riscosso && part.evento_id) {
        const ev = allEventi.find(e => e.id === part.evento_id)
        const rag = allRagazzi.find(r => r.id === part.ragazzo_id)
        const nomeEv = ev?.nome_evento || 'Evento'
        const quota = part.quota_dovuta || ev?.quota_standard || 0

        const matchSpesa = allSpese.find(s => 
          s.tipo_movimento === 'ENTRATA' &&
          s.ragazzo_id === part.ragazzo_id &&
          (s.partecipazione_evento_id === part.id || s.voce_spesa === `Evento: ${nomeEv}` || s.note?.includes(nomeEv))
        )

        if (!matchSpesa) {
          const safeMet = toCanonicalMetodo(part.metodo_pagamento || ev?.metodo_pagamento, 'Bonifico')

          const { data: inserted, error: errIns } = await supabase.from('registro_spese').insert({
            importo: quota,
            metodo: safeMet,
            voce_spesa: `Evento: ${nomeEv}`,
            tipo_movimento: 'ENTRATA',
            data: ev?.data_inizio || dateStr,
            ragazzo_id: part.ragazzo_id,
            partecipazione_evento_id: part.id,
            note: `Quota ${nomeEv} - ${rag?.nome || ''} ${rag?.cognome || ''}`.trim()
          }).select('*').single()

          if (!errIns && inserted) {
            orfaniRicreati++
            allSpese.push(inserted)
          }
        }
      }
    }

    // Note: Il censimento non viene registrato in registro_spese (cassa), ma gestito solo nel Bilancio AGESCI.

    // --- CHECK 2: DUPLICATI IN CASSA (Rimuove righe duplicate) ---
    const seenQuoteKeys = new Set<string>()
    const seenEventKeys = new Set<string>()
    const seenCensimentoKeys = new Set<string>()
    const duplicateIdsToDelete: string[] = []

    // Ordiniamo per data o id per conservare la prima entrata registrata
    const sortedSpese = [...allSpese].sort((a, b) => (a.data || a.id).localeCompare(b.data || b.id))

    for (const s of sortedSpese) {
      if (s.tipo_movimento !== 'ENTRATA') continue

      // Duplicate Quote Mensili
      if (s.riferimento_quota && s.ragazzo_id) {
        const key = `quote_${s.ragazzo_id}_${s.riferimento_quota.toLowerCase()}`
        if (seenQuoteKeys.has(key)) {
          duplicateIdsToDelete.push(s.id)
        } else {
          seenQuoteKeys.add(key)
        }
      }

      // Duplicate Eventi
      else if (s.partecipazione_evento_id || (s.voce_spesa && s.voce_spesa.startsWith('Evento: ') && s.ragazzo_id)) {
        const key = `evento_${s.ragazzo_id}_${s.partecipazione_evento_id || s.voce_spesa}`
        if (seenEventKeys.has(key)) {
          duplicateIdsToDelete.push(s.id)
        } else {
          seenEventKeys.add(key)
        }
      }

      // Duplicate Censimento
      else if (s.voce_spesa === 'Censimento' && s.ragazzo_id) {
        const key = `censimento_${s.ragazzo_id}`
        if (seenCensimentoKeys.has(key)) {
          duplicateIdsToDelete.push(s.id)
        } else {
          seenCensimentoKeys.add(key)
        }
      }
    }

    if (duplicateIdsToDelete.length > 0) {
      const { error: errDel } = await supabase.from('registro_spese').delete().in('id', duplicateIdsToDelete)
      if (!errDel) {
        duplicatiRimossi = duplicateIdsToDelete.length
        allSpese = allSpese.filter(s => !duplicateIdsToDelete.includes(s.id))
      }
    }

    // --- CHECK 3: RICONCILIAZIONE SALDI CASSA VS BANCA ---
    let entrateContanti = 0
    let entrateBanca = 0
    let usciteContanti = 0
    let usciteBanca = 0

    allSpese.forEach(spesa => {
      const isEntrata = spesa.tipo_movimento === 'ENTRATA'
      const metUpper = (spesa.metodo || '').toUpperCase()
      const isContanti = metUpper.includes('CONTAN') || (!metUpper.includes('BONIF') && !metUpper.includes('CART') && !metUpper.includes('BANC'))

      if (isContanti) {
        if (isEntrata) entrateContanti += Number(spesa.importo || 0)
        else usciteContanti += Number(spesa.importo || 0)
      } else {
        if (isEntrata) entrateBanca += Number(spesa.importo || 0)
        else usciteBanca += Number(spesa.importo || 0)
      }
    })

    const saldoInizialeContanti = Number(settings.saldo_iniziale_contanti || '0') || 0
    const saldoInizialeBanca = Number(settings.saldo_iniziale_banca || '0') || 0

    const saldoContantiEffettivo = saldoInizialeContanti + entrateContanti - usciteContanti
    const saldoBancaEffettivo = saldoInizialeBanca + entrateBanca - usciteBanca

    return NextResponse.json({
      success: true,
      message: 'Audit e Riconciliazione completati con successo!',
      timestamp: new Date().toISOString(),
      report: {
        orfani_ricreati: orfaniRicreati,
        duplicati_rimossi: duplicatiRimossi,
        totale_movimenti_cassa: allSpese.length,
        saldi: {
          saldo_contanti_effettivo: Number(saldoContantiEffettivo.toFixed(2)),
          saldo_banca_effettivo: Number(saldoBancaEffettivo.toFixed(2)),
          totale_generale_cassa: Number((saldoContantiEffettivo + saldoBancaEffettivo).toFixed(2)),
          dettagli: {
            entrate_contanti: Number(entrateContanti.toFixed(2)),
            uscite_contanti: Number(usciteContanti.toFixed(2)),
            entrate_banca: Number(entrateBanca.toFixed(2)),
            uscite_banca: Number(usciteBanca.toFixed(2))
          }
        }
      }
    })
  } catch (error: unknown) {
    console.error("Errore durante l'audit:", error)
    const msg = error instanceof Error ? error.message : 'Errore sconosciuto'
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
