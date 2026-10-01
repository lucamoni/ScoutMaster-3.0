'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { downloadReceipt, receiptFileName, removeUnlinkedReceipt } from '@/lib/receipts'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

export function UnlinkedReceipts({ files }: { files: { path: string; createdAt: string | null }[] }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmPath, setConfirmPath] = useState<string | null>(null)
  const router = useRouter()
  const act = async (path: string, remove: boolean) => {
    if (busy) return
    setBusy(path)
    try {
      const client = createClient()
      if (remove) { await removeUnlinkedReceipt(client, path); setConfirmPath(null); toast.success('File eliminato'); router.refresh() }
      else await downloadReceipt(client, path)
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Operazione non riuscita') }
    finally { setBusy(null) }
  }
  return <section className="space-y-3"><h2 className="text-lg font-semibold">File senza movimento collegato ({files.length})</h2><p className="text-sm text-muted-foreground">File conservati dopo eliminazioni o sostituzioni. La loro eliminazione non modifica il bilancio.</p>
    {files.map(file => <div key={file.path} className="space-y-2 rounded border p-3"><p className="break-all">{receiptFileName(file.path)}</p><p className="text-xs text-muted-foreground">Caricato: {file.createdAt?.slice(0, 10) || 'Data non disponibile'}</p><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={!!busy} onClick={() => act(file.path, false)}>Scarica</Button><Button variant="destructive" disabled={!!busy} onClick={() => setConfirmPath(file.path)}>Elimina file</Button></div>
      {confirmPath === file.path && <div role="alert" className="space-y-2"><p>Eliminare definitivamente questo file?</p><Button variant="outline" disabled={!!busy} onClick={() => setConfirmPath(null)}>Annulla</Button> <Button variant="destructive" disabled={!!busy} onClick={() => act(file.path, true)}>Conferma eliminazione</Button></div>}
    </div>)}
  </section>
}
