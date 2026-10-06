'use client'

import { staffFileUrl } from '@/lib/staffAdvances/model'
import { reimbursementFileUrl } from '@/lib/reimbursements/model'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { downloadReceipt, receiptFileName, receiptPath, RECEIPT_BUCKET, saveExpenseReceipt, removeExpenseReceipt, deleteExpenseRecord, type ReceiptExpense } from '@/lib/receipts'
import { ReceiptFilePicker } from './ReceiptFilePicker'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Download, ExternalLink, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export function ReceiptDialog({ expense, onClose, onSaved, onDeleted }: {
  expense: ReceiptExpense; onClose: () => void; onSaved: (expense: ReceiptExpense) => void; onDeleted: (id: string) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [markAbsent, setMarkAbsent] = useState(true)
  const [deleteMovement, setDeleteMovement] = useState(false)
  const client = createClient()
  const isReimbursement = !!(expense.rimborso_id || expense.anticipo_capi_id)
  useEffect(() => {
    let active = true
    setSignedUrl(null)
    setError('')
    if (!expense.foto_scontrino_url) return
    const load = async () => {
      try {
        const reimbursementUrl = reimbursementFileUrl(expense.foto_scontrino_url!) || staffFileUrl(expense.foto_scontrino_url!)
        if (reimbursementUrl) { if (active) setSignedUrl(reimbursementUrl); return }
        const path = receiptPath(expense.foto_scontrino_url!, process.env.NEXT_PUBLIC_SUPABASE_URL!)
        const { data, error } = await client.storage.from(RECEIPT_BUCKET).createSignedUrl(path, 600)
        if (error || !data) throw new Error('File non disponibile. Puoi riprovare riaprendo questa finestra.')
        if (active) setSignedUrl(data.signedUrl)
      } catch (err) { if (active) setError(err instanceof Error ? err.message : 'File non disponibile') }
    }
    void load()
    return () => { active = false }
  }, [client, expense.foto_scontrino_url])
  const save = async () => {
    if (!file || busy) return
    setBusy(true)
    try {
      const updated = await saveExpenseReceipt(client, expense, file)
      onSaved(updated)
      toast.success('Allegato salvato e disponibile nell’archivio spese')
      onClose()
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Salvataggio non riuscito') }
    finally { setBusy(false) }
  }
  const download = async () => {
    if (!expense.foto_scontrino_url) return
    setBusy(true)
    try { await downloadReceipt(client, receiptPath(expense.foto_scontrino_url, process.env.NEXT_PUBLIC_SUPABASE_URL!)) }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Download non riuscito') }
    finally { setBusy(false) }
  }
  const remove = async () => {
    if (busy) return
    setBusy(true)
    try {
      if (deleteMovement) {
        const warnings = await deleteExpenseRecord(client, expense, true)
        onDeleted(expense.id)
        if (warnings.length) toast.warning(warnings.join(' '))
        else toast.success('Movimento e allegato eliminati')
        onClose()
        return
      }
      const result = await removeExpenseReceipt(client, expense, markAbsent)
      onSaved(result.expense)
      if (result.warning) toast.warning(result.warning)
      else toast.success('Allegato eliminato. Movimento conservato.')
      onClose()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Eliminazione non riuscita') }
    finally { setBusy(false) }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose() }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto">
      <DialogHeader><DialogTitle>Allegato della spesa</DialogTitle><DialogDescription>{expense.voce_spesa} · {expense.data} · €{expense.importo.toFixed(2)}</DialogDescription></DialogHeader>
      {expense.foto_scontrino_url ? <div className="space-y-3">
        <p className="break-all text-sm">{receiptFileName(expense.foto_scontrino_url)}</p>
        {/* Private signed URLs are displayed directly without an image proxy. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {signedUrl && /\.(jpe?g|png|webp)$/i.test(expense.foto_scontrino_url) && <img src={signedUrl} alt="Scontrino allegato alla spesa" className="max-h-64 w-full rounded border object-contain" />}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex gap-2">
          {signedUrl && <a href={signedUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"><ExternalLink className="h-4 w-4" /> Apri file</a>}
          <Button type="button" variant="outline" disabled={busy} onClick={download}><Download className="mr-2 h-4 w-4" /> Scarica</Button>
        </div>
        <p className="text-xs text-muted-foreground">{isReimbursement ? 'Allegato conservato con il rimborso o la spesa capi collegata.' : <>Puoi sostituire l’allegato collegato a questa voce caricando un nuovo file.</>}</p>
        {!isReimbursement && (!deleting ? <Button type="button" variant="destructive" disabled={busy} onClick={() => setDeleting(true)}>Elimina allegato</Button> : <div className="space-y-3 rounded border p-3">
          <p className="text-sm">Il file verrà eliminato definitivamente.</p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={deleteMovement} onChange={event => setDeleteMovement(event.target.checked)} disabled={busy} /> Elimina anche il movimento collegato</label>
          {deleteMovement ? <p className="text-sm font-medium text-red-700">Il movimento sarà rimosso dal bilancio e il saldo cambierà. Eventuali quote collegate torneranno da saldare.</p> : <><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={markAbsent} onChange={event => setMarkAbsent(event.target.checked)} disabled={busy} /> Segna anche il movimento come “ricevuta assente”</label><p className="text-xs text-muted-foreground">Disattiva se conservi una ricevuta cartacea. Importo, data e saldo restano invariati.</p></>}
          <div className="flex gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setDeleting(false)}>Annulla</Button><Button type="button" variant="destructive" disabled={busy} onClick={remove}>{deleteMovement ? 'Elimina file e movimento' : 'Conferma eliminazione file'}</Button></div>
        </div>)}
      </div> : <p className="text-sm text-muted-foreground">Nessun file allegato a questa voce.</p>}
      {!isReimbursement && <><ReceiptFilePicker file={file} onChange={setFile} disabled={busy} />
      <Button type="button" disabled={!file || busy} onClick={save}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{expense.foto_scontrino_url ? 'Sostituisci allegato' : 'Salva allegato'}</Button></>}
    </DialogContent>
  </Dialog>
}
