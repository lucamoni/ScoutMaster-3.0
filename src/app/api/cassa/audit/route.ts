import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authorizationErrorResponse, requireRole } from '@/lib/security/auth'
import { annoScoutVariants, toCanonicalMetodo } from '@/lib/utils/payment'
import { getAnnualBoys } from '@/lib/annualRoster/server'
import { getWorkingYear } from '@/lib/workingYear'
import { calculateAccountingBalances, getAccountingPeriod } from '@/lib/utils/accounting'
import { CENSUS_INCOME_SETTING } from '@/lib/utils/censusAccounting'
import { AUDIT_MONTHS, auditDuplicateMovements, hasMonthlyMovement, validAuditDate } from '@/lib/cassaAudit'

export const dynamic = 'force-dynamic'

async function allRows<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, label: string) {
  const rows: T[] = []
  for (let from = 0; ; from += 500) {
    const { data, error } = await page(from, from + 499)
    if (error || !data) throw new Error(`Audit interrotto: lettura ${label} non riuscita`)
    rows.push(...data)
    if (data.length < 500) return rows
  }
}

export async function POST(request: Request) {
  try {
    await requireRole(['admin', 'tesoriere'])
    if (request.headers.get('sec-fetch-site') === 'cross-site'
      || (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin)) {
      return NextResponse.json({ success: false, error: 'Richiesta non consentita' }, { status: 403 })
    }
    const supabase = createAdminClient()
    const settingsData = await allRows((from, to) => supabase.from('impostazioni').select('*').order('chiave').range(from, to), 'impostazioni')
    const settings = new Map(settingsData.map(setting => [setting.chiave, setting.valore]))
    const year = await getWorkingYear(settings.get('anno_scout_corrente'))
    const period = getAccountingPeriod(new Map([...settings, ['anno_scout_corrente', year]]), year)
    const [ragazzi, eventi, quote, spese] = await Promise.all([
      getAnnualBoys(year, true),
      allRows((from, to) => supabase.from('eventi').select('*').gte('data_inizio', period.startDate).lte('data_inizio', period.endDate).order('id').range(from, to), 'eventi'),
      allRows((from, to) => supabase.from('quote_mensili').select('*').in('anno_scout', annoScoutVariants(year)).order('id').range(from, to), 'quote'),
      allRows((from, to) => supabase.from('registro_spese').select('*').gte('data', period.startDate).lte('data', period.endDate).order('id').range(from, to), 'movimenti'),
    ])
    const partecipazioni = []
    for (let start = 0; start < eventi.length; start += 500) {
      const ids = eventi.slice(start, start + 500).map(evento => evento.id)
      partecipazioni.push(...await allRows((from, to) => supabase.from('partecipazioni_eventi').select('*').in('evento_id', ids).order('id').range(from, to), 'partecipazioni'))
    }
    // Read every protection before mutating anything: a failed read must never permit a deletion.
    const protectedIds = new Set<string>()
    for (let start = 0; start < spese.length; start += 500) {
      const ids = spese.slice(start, start + 500).map(spesa => spesa.id)
      const [issued, proofs] = await Promise.all([
        allRows((from, to) => supabase.from('ricevute_movimenti').select('movimento_id').in('movimento_id', ids).order('movimento_id').range(from, to), 'ricevute emesse'),
        allRows((from, to) => supabase.from('prove_bonifico').select('movimento_id').in('movimento_id', ids).order('movimento_id').range(from, to), 'prove di bonifico'),
      ])
      for (const row of [...issued, ...proofs]) protectedIds.add(row.movimento_id)
    }

    let orfaniRicreati = 0
    const warning: string[] = []
    const tariff = annoScoutVariants(year).map(variant => settings.get(`quota_mensile_standard_${variant}`)).find(value => value != null && value !== '') ?? settings.get('quota_mensile_standard') ?? '10'
    const ragazziMap = new Map(ragazzi.map(ragazzo => [ragazzo.id, ragazzo]))
    let allSpese = [...spese]
    for (const quota of quote) {
      const metadata = quota as typeof quota & { importo_mensile?: number | null; data_contabile?: string | null }
      const amount = metadata.importo_mensile ?? Number(tariff)
      for (const month of AUDIT_MONTHS) {
        if (quota[month] !== true || hasMonthlyMovement(allSpese, quota, month, period)) continue
        if (!quota.ragazzo_id || !Number.isFinite(amount) || amount < 0 || !validAuditDate(metadata.data_contabile, period)) {
          warning.push(`Quota ${month} (${quota.id}): importo o data contabile da verificare`)
          continue
        }
        if (amount === 0) continue
        const ragazzo = ragazziMap.get(quota.ragazzo_id)
        const { data: inserted, error } = await supabase.from('registro_spese').insert({
          importo: amount, metodo: 'Contanti', voce_spesa: 'Quota Mensile', tipo_movimento: 'ENTRATA',
          data: metadata.data_contabile, ragazzo_id: quota.ragazzo_id, quota_mensile_id: quota.id,
          riferimento_quota: month, momento_anno: 'ANNO',
          note: `Quota ${month.slice(0, 3).toUpperCase()} - ${ragazzo?.nome || ''} ${ragazzo?.cognome || ''}`.trim(),
        }).select('*').single()
        if (error || !inserted) throw new Error(`Audit interrotto: quota ${month} non ricreata`)
        orfaniRicreati++; allSpese.push(inserted)
      }
    }

    const eventiMap = new Map(eventi.map(evento => [evento.id, evento]))
    for (const part of partecipazioni) {
      if (!part.riscosso || !part.evento_id || !part.ragazzo_id) continue
      const evento = eventiMap.get(part.evento_id)
      if (!evento || !validAuditDate(evento.data_inizio, period)) continue
      const amount = part.quota_dovuta ?? evento.quota_standard
      // A zero individual quota means an exemption, never the standard camp fee.
      if (amount === 0) continue
      if (amount == null || !Number.isFinite(amount) || amount < 0) {
        warning.push(`Evento ${evento.nome_evento} (${part.id}): quota da verificare`); continue
      }
      const existing = allSpese.some(spesa => spesa.tipo_movimento === 'ENTRATA' && spesa.ragazzo_id === part.ragazzo_id
        && (spesa.partecipazione_evento_id === part.id || (!spesa.partecipazione_evento_id && !spesa.quota_mensile_id
          && spesa.voce_spesa === `Evento: ${evento.nome_evento}`)))
      if (existing) continue
      const rawMethod = part.metodo_pagamento || evento.metodo_pagamento
      if (!rawMethod || !/CONTANT|CASH|BONIF|BANC|TRANSFER|CART|POS|^BB$/i.test(rawMethod)) {
        warning.push(`Evento ${evento.nome_evento} (${part.id}): metodo di pagamento da verificare`); continue
      }
      const ragazzo = ragazziMap.get(part.ragazzo_id)
      const { data: inserted, error } = await supabase.from('registro_spese').insert({
        importo: amount, metodo: toCanonicalMetodo(rawMethod), voce_spesa: `Evento: ${evento.nome_evento}`,
        tipo_movimento: 'ENTRATA', data: evento.data_inizio, ragazzo_id: part.ragazzo_id,
        partecipazione_evento_id: part.id,
        momento_anno: ['CI', 'CE'].includes(evento.tipo_evento || '') ? evento.tipo_evento : 'ANNO',
        note: `Quota ${evento.nome_evento} - ${ragazzo?.nome || ''} ${ragazzo?.cognome || ''}`.trim(),
      }).select('*').single()
      if (error || !inserted) throw new Error(`Audit interrotto: pagamento ${evento.nome_evento} non ricreato`)
      orfaniRicreati++; allSpese.push(inserted)
    }

    const duplicates = auditDuplicateMovements(allSpese, protectedIds)
    if (duplicates.ids.length) {
      const { error } = await supabase.from('registro_spese').delete().in('id', duplicates.ids)
      if (error) throw new Error('Audit interrotto: duplicati non rimossi')
      allSpese = allSpese.filter(spesa => !duplicates.ids.includes(spesa.id))
    }
    if (duplicates.review) warning.push(`${duplicates.review} duplicati con documenti o importi/metodi diversi conservati: verifica manuale necessaria`)
    const balances = calculateAccountingBalances(allSpese, period.initialCash, period.initialBank, settings.get(CENSUS_INCOME_SETTING) === 'true')
    const rounded = (amount: number) => Number(amount.toFixed(2))
    return NextResponse.json({
      success: true, message: warning.length ? 'Audit completato con voci da verificare' : 'Audit e riconciliazione completati',
      timestamp: new Date().toISOString(), anno_scout: year, warning,
      report: {
        orfani_ricreati: orfaniRicreati, duplicati_rimossi: duplicates.ids.length, duplicati_da_verificare: duplicates.review,
        totale_movimenti_cassa: allSpese.length,
        saldi: {
          saldo_contanti_effettivo: rounded(balances.saldoFinaleCassa), saldo_banca_effettivo: rounded(balances.saldoFinaleBanca),
          totale_generale_cassa: rounded(balances.saldoFinaleTotale),
          dettagli: { entrate_contanti: rounded(balances.entrateContanti), uscite_contanti: rounded(balances.usciteContanti),
            entrate_banca: rounded(balances.entrateBanca), uscite_banca: rounded(balances.usciteBanca) },
        },
      },
    })
  } catch (error: unknown) {
    const authResponse = authorizationErrorResponse(error)
    if (authResponse) return authResponse
    console.error("Errore durante l'audit:", error)
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Audit non riuscito' }, { status: 500 })
  }
}
