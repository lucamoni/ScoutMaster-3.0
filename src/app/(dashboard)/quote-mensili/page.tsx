import { getAnnualBoys } from '@/lib/annualRoster/server'
import { getWorkingYear } from '@/lib/workingYear'
import { createClient } from '@/lib/supabase/server'
import { annoScoutVariants, getCurrentAnnoScout, normalizeAnnoScout } from '@/lib/utils/payment'
import QuoteClient from './components/QuoteClient'
import { getMonthlyQuotaAmount } from '@/lib/utils/monthlyQuota'

export const dynamic = 'force-dynamic'

export default async function QuotePage() {
  const supabase = await createClient()

  const { data: impostazioni, error: settingsError } = await supabase.from('impostazioni').select('*')

  if (settingsError) {
    return <div>Errore nel caricamento delle quote mensili.</div>
  }

  const settings = new Map((impostazioni || []).map(item => [item.chiave, item.valore]))
  const currentYear = await getWorkingYear(settings.get('anno_scout_corrente') || getCurrentAnnoScout())
  const initialQuotaStandard = getMonthlyQuotaAmount(settings, currentYear)
  const ragazzi = await getAnnualBoys(currentYear, false)

  const { data: initialQuote, error: quoteError } = await supabase
    .from('quote_mensili')
    .select('*')
    .in('anno_scout', annoScoutVariants(currentYear))

  if (quoteError) {
    return <div>Errore nel caricamento delle quote mensili.</div>
  }

  let quote = initialQuote

  const activeRagazzi = ragazzi || []
  const existingRagazzoIds = new Set((quote || []).map(item => item.ragazzo_id))
  const missingQuote = activeRagazzi
    .filter(ragazzo => !existingRagazzoIds.has(ragazzo.id))
    .map(ragazzo => ({
      ragazzo_id: ragazzo.id,
      anno_scout: currentYear,
    }))

  if (missingQuote.length > 0 && currentYear === normalizeAnnoScout(settings.get('anno_scout_corrente') || getCurrentAnnoScout())) {
    const { error: insertError } = await supabase.from('quote_mensili').insert(missingQuote)

    if (!insertError) {
      const { data: updatedQuote } = await supabase
        .from('quote_mensili')
        .select('*')
        .in('anno_scout', annoScoutVariants(currentYear))
      quote = updatedQuote || quote
    }
  }

  return (
    <div className="p-4 md:p-6 w-full max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Quote Mensili ({currentYear})</h1>
      </div>
      <QuoteClient
        key={currentYear}
        ragazzi={activeRagazzi}
        initialQuote={quote || []}
        currentYear={currentYear}
        initialQuotaStandard={initialQuotaStandard}
      />
    </div>
  )
}
