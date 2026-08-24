import { createClient } from '@/lib/supabase/server'
import CensimentoClient from './components/CensimentoClient'

export const dynamic = 'force-dynamic'

export default async function CensimentoPage() {
  const supabase = await createClient()

  const [
    { data: ragazzi },
    { data: impostazioni }
  ] = await Promise.all([
    supabase.from('ragazzi').select('*').eq('attivo', true).order('cognome', { ascending: true }),
    supabase.from('impostazioni').select('*')
  ])

  const quotaCensimentoStandard = impostazioni?.find(i => i.chiave === 'quota_censimento_standard')?.valore || '45'
  const quotaCensimentoFratelli = impostazioni?.find(i => i.chiave === 'quota_censimento_fratelli')?.valore || '35'

  return (
    <CensimentoClient 
      initialRagazzi={ragazzi || []}
      initialQuotaStandard={quotaCensimentoStandard}
      initialQuotaFratelli={quotaCensimentoFratelli}
    />
  )
}
