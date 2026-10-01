import { createClient } from '@/lib/supabase/server'
import { getWorkingYear } from '@/lib/workingYear'
import { annoScoutVariants } from '@/lib/utils/payment'
import { buildReminderPeople } from '@/lib/reminder'
import ReminderClient from './components/ReminderClient'

export const dynamic = 'force-dynamic'

export default async function ReminderPage() {
  const client = await createClient()
  const { data: settings, error: settingsError } = await client.from('impostazioni').select('chiave,valore')
  if (settingsError) return <p role="alert">Impossibile caricare le impostazioni dei reminder.</p>
  const year = await getWorkingYear(settings?.find(row => row.chiave === 'anno_scout_corrente')?.valore)
  const [people, events, participations, quotes] = await Promise.all([
    client.from('ragazzi').select('*').eq('attivo', true).order('cognome'),
    client.from('eventi').select('*'),
    client.from('partecipazioni_eventi').select('*'),
    client.from('quote_mensili').select('*').in('anno_scout', annoScoutVariants(year)),
  ])
  if (people.error || events.error || participations.error || quotes.error) return <p role="alert">Impossibile caricare quote, uscite o moduli. Riprova.</p>
  const data = buildReminderPeople(people.data || [], quotes.data || [], events.data || [], participations.data || [], year)
  return <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6"><div><h1 className="text-2xl font-bold">Reminder</h1><p className="text-sm text-muted-foreground">Anno scout {year.replace('-', '/')} · scegli le voci, modifica il testo e apri WhatsApp.</p></div><ReminderClient data={data} initialGroupLink={settings?.find(row => row.chiave === 'reminder_link_gruppo')?.valore || ''} /></div>
}
