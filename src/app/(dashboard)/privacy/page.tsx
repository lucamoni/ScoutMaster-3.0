import { createClient } from '@/lib/supabase/server'
import { PrivacyClient } from './components/PrivacyClient'

export default async function PrivacyPage() {
  const supabase = await createClient()
  const { data: ragazzi } = await supabase
    .from('ragazzi')
    .select('*')
    .eq('attivo', true)
    .order('pattuglia', { ascending: true })
    .order('cognome', { ascending: true })

  return <PrivacyClient ragazzi={ragazzi || []} />
}
