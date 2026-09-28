import { createClient } from '@/lib/supabase/server'
import ReceiptArchive from './ReceiptArchive'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Archivio scontrini e file | ScoutMaster 3.0' }
const PAGE_SIZE = 50

export default async function ReceiptArchivePage({ searchParams }: {
  searchParams: Promise<{ q?: string; from?: string; to?: string; page?: string }>
}) {
  const params = await searchParams
  const q = typeof params.q === 'string' ? params.q.trim().slice(0, 120) : ''
  const validDate = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) ? value : ''
  const from = validDate(params.from)
  const to = validDate(params.to)
  const page = Math.min(100_000, Math.max(1, Math.floor(Number(params.page) || 1)))
  const supabase = await createClient()
  let query = supabase.from('registro_spese').select('*', { count: 'exact' })
    .not('foto_scontrino_url', 'is', null).neq('foto_scontrino_url', '')
  if (q) query = query.ilike('voce_spesa', `%${q.replace(/[\\%_]/g, '\\$&')}%`)
  if (from) query = query.gte('data', from)
  if (to) query = query.lte('data', to)
  const { data, count, error } = await query.order('data', { ascending: false, nullsFirst: false }).order('id')
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)
  if (error) throw new Error('Impossibile caricare l’archivio allegati. Riprova tra poco.')
  return <ReceiptArchive initialExpenses={data || []} total={count || 0} page={page} pageSize={PAGE_SIZE} filters={{ q, from, to }} />
}
