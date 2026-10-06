'use client'

import { useId } from 'react'
import { RECEIPT_ACCEPT, validateReceiptFile } from '@/lib/receipts'
import { Button } from '@/components/ui/button'
import { Camera, Paperclip, X } from 'lucide-react'
import { toast } from 'sonner'

export function ReceiptFilePicker({ file, onChange, disabled = false, description }: {
  file: File | null; onChange: (file: File | null) => void; disabled?: boolean; description?: string
}) {
  const id = useId()
  const choose = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0]
    event.target.value = ''
    if (!selected) return
    try { validateReceiptFile(selected); onChange(selected) }
    catch (error) { toast.error(error instanceof Error ? error.message : 'File non valido') }
  }
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <p className="text-sm font-medium">Scontrino o documento</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={disabled} onClick={() => document.getElementById(`${id}-camera`)?.click()}>
          <Camera className="mr-2 h-4 w-4" /> Scatta foto
        </Button>
        <Button type="button" variant="outline" disabled={disabled} onClick={() => document.getElementById(`${id}-file`)?.click()}>
          <Paperclip className="mr-2 h-4 w-4" /> Carica file
        </Button>
      </div>
      <input id={`${id}-camera`} aria-label="Scatta foto dello scontrino" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" className="hidden" disabled={disabled} onChange={choose} />
      <input id={`${id}-file`} aria-label="Carica allegato della spesa" type="file" accept={RECEIPT_ACCEPT} className="hidden" disabled={disabled} onChange={choose} />
      {file ? <div className="flex items-center gap-2 text-sm" role="status"><span className="break-all">{file.name}</span><Button type="button" size="icon" variant="ghost" disabled={disabled} aria-label="Rimuovi file selezionato" onClick={() => onChange(null)}><X className="h-4 w-4" /></Button></div>
        : <p className="text-xs text-muted-foreground">{description || 'Foto, PDF, DOCX, XLSX, CSV o TXT · massimo 20 MB.'}</p>}
    </div>
  )
}
