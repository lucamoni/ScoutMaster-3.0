import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calculateCassaTotals, getAnnoScoutDateRange, resolveInitialBalances } from '@/lib/utils/cassa'
import { getCurrentAnnoScout, normalizeAnnoScout } from '@/lib/utils/payment'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: impostazioni, error: settingsError } = await supabase
      .from('impostazioni')
      .select('chiave, valore')
    if (settingsError) throw settingsError

    const settings = new Map((impostazioni || []).map(item => [item.chiave, item.valore]))
    const currentYear = normalizeAnnoScout(settings.get('anno_scout_corrente') || getCurrentAnnoScout())
    const { startDate, endDate } = getAnnoScoutDateRange(currentYear)

    const { data: movimenti, error: movimentiError } = await supabase
      .from('registro_spese')
      .select('importo, tipo_movimento, metodo, data')
    if (movimentiError) throw movimentiError

    const movimentiAnno = (movimenti || []).filter((movimento) => {
      const date = String(movimento.data || '').slice(0, 10)
      return date >= startDate && date <= endDate
    })
    const totals = calculateCassaTotals(movimentiAnno)
    const initialBalances = resolveInitialBalances(settings, currentYear, movimenti || [])
    const cassa = initialBalances.contanti + totals.entrateContanti - totals.usciteContanti
    const banca = initialBalances.banca + totals.entrateBanca - totals.usciteBanca

    return NextResponse.json({
      success: true,
      annoScout: currentYear.replace('-', '/'),
      cassa: Number(cassa.toFixed(2)),
      banca: Number(banca.toFixed(2)),
      totale: Number((cassa + banca).toFixed(2)),
    })
  } catch (error) {
    console.error('[api/cassa/summary] failed', error)
    return NextResponse.json(
      { success: false, error: 'Impossibile calcolare i saldi' },
      { status: 500 }
    )
  }
}
