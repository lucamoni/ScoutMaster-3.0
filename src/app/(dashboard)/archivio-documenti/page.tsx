import Link from 'next/link'
import { ArchivioDocumentiClient } from './components/ArchivioDocumentiClient'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Archivio Documenti Digitali | ScoutMaster 3.0',
}

export default async function ArchivioDocumentiPage() {
  const supabase = await createClient()
  const { data: ragazzi } = await supabase.from('ragazzi').select('*').eq('attivo', true).order('nome')

  return <>
    <div className="mx-auto max-w-7xl px-4 pt-4 md:px-6"><Link href="/cassa/archivio" className="inline-flex rounded-md border bg-white px-4 py-2 text-sm font-medium">Vai all’archivio scontrini e file delle spese →</Link></div>
    <ArchivioDocumentiClient initialRagazzi={ragazzi || []} />
  </>
}
