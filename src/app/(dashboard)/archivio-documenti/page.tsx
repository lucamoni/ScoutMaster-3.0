import { ArchivioDocumentiClient } from './components/ArchivioDocumentiClient'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Archivio Documenti Digitali | ScoutMaster 3.0',
}

export default async function ArchivioDocumentiPage() {
  const supabase = await createClient()
  const { data: ragazzi } = await supabase.from('ragazzi').select('*').eq('attivo', true).order('nome')

  return <ArchivioDocumentiClient initialRagazzi={ragazzi || []} />
}
