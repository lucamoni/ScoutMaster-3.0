import { AppShell } from '@/components/layout/AppShell'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getWorkingYear } from '@/lib/workingYear'
import { getCurrentAnnoScout } from '@/lib/utils/payment'
import { validWorkingYear } from '@/lib/utils/workingYear'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [{ data: settings }, { data: oldestMovement }, { data: oldestQuote }, { data: oldestEvent }] = await Promise.all([
    supabase.from('impostazioni').select('chiave,valore'),
    supabase.from('registro_spese').select('data').not('data', 'is', null).order('data').limit(1),
    supabase.from('quote_mensili').select('anno_scout').order('anno_scout').limit(1),
    supabase.from('eventi').select('data_inizio').not('data_inizio', 'is', null).order('data_inizio').limit(1),
  ])
  const selectedYear = await getWorkingYear(settings?.find(row => row.chiave === 'anno_scout_corrente')?.valore)
  const candidates = [getCurrentAnnoScout(), selectedYear, oldestQuote?.[0]?.anno_scout]
  for (const date of [oldestMovement?.[0]?.data, oldestEvent?.[0]?.data_inizio]) {
    if (date) candidates.push(getCurrentAnnoScout(new Date(`${date}T12:00:00`)))
  }
  for (const setting of settings || []) {
    candidates.push(setting.chiave.match(/\d{4}[-/]\d{4}$/)?.[0])
  }
  const starts = candidates.map(value => validWorkingYear(value)).filter((value): value is string => !!value).map(value => Number(value.slice(0, 4)))
  const first = Math.min(...starts)
  const last = Math.max(...starts)
  const availableYears = Array.from({ length: last - first + 1 }, (_, index) => `${last - index}-${last - index + 1}`)

  return (
    <AppShell selectedYear={selectedYear} availableYears={availableYears}>
      {children}
    </AppShell>
  )
}
