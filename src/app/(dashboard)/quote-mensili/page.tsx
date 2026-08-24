import { createClient } from '@/lib/supabase/server'
import QuoteClient from './components/QuoteClient'

export default async function QuotePage() {
  const supabase = await createClient()
  
  const { data: ragazzi } = await supabase
    .from('ragazzi')
    .select('*')
    .eq('attivo', true)
    .order('pattuglia', { ascending: true })

  // Current scout year (e.g., 2026-2027)
  const currentYear = new Date().getMonth() >= 8 
    ? `${new Date().getFullYear()}-${new Date().getFullYear() + 1}` 
    : `${new Date().getFullYear() - 1}-${new Date().getFullYear()}`

  let { data: quote } = await supabase
    .from('quote_mensili')
    .select('*')
    .eq('anno_scout', currentYear)

  const { data: impostazioni } = await (supabase as unknown as { from: (t: string) => { select: (s: string) => { eq: (k: string, v: string) => { single: () => Promise<{ data: { valore: string } | null }> } } } })
    .from('impostazioni')
    .select('*')
    .eq('chiave', 'quota_mensile_standard')
    .single()
    
  const initialQuotaStandard = impostazioni?.valore ? Number(impostazioni.valore) : 15

  // Auto-initialize rows for missing kids
  if (ragazzi) {
    const missingQuote = ragazzi
      .filter(r => !quote?.find(q => q.ragazzo_id === r.id))
      .map(r => ({
        ragazzo_id: r.id,
        anno_scout: currentYear,
      }))

    if (missingQuote.length > 0) {
      await supabase.from('quote_mensili').insert(missingQuote)
      // Re-fetch
      const { data: updatedQuote } = await supabase
        .from('quote_mensili')
        .select('*')
        .eq('anno_scout', currentYear)
      
      quote = updatedQuote
    }
  }

  return (
    <div className="p-4 md:p-6 w-full max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Quote Mensili ({currentYear})</h1>
      </div>
      <QuoteClient ragazzi={ragazzi || []} initialQuote={quote || []} currentYear={currentYear} initialQuotaStandard={initialQuotaStandard} />
    </div>
  )
}
