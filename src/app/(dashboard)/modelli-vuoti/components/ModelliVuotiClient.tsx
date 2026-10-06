'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import type { Database } from '@/types/database.types'

type Model = Database['public']['Tables']['modelli_documenti']['Row']
const bucket = 'documenti'
const allowed: Record<string, string> = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', odt: 'application/vnd.oasis.opendocument.text', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' }

export function validateModelFile(file: Pick<File, 'name' | 'type' | 'size'>) {
  const extension = file.name.split('.').pop()?.toLowerCase() || ''
  if (allowed[extension] !== file.type || file.size <= 0 || file.size > 20 * 1024 * 1024) throw new Error('Carica un PDF, DOCX, ODT, JPG o PNG fino a 20 MB.')
}

export function ModelliVuotiClient() {
  const client = createClient()
  const [models, setModels] = useState<Model[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [editing, setEditing] = useState<Model | null>(null)
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState<Model | null>(null)

  useEffect(() => {
    let active = true
    void client.from('modelli_documenti').select('*').order('data_caricamento', { ascending: false }).then(({ data, error }) => {
      if (!active) return
      if (error) setLoadError('Impossibile caricare i moduli. Ricarica la pagina.')
      else setModels(data || [])
      setLoading(false)
    })
    return () => { active = false }
  }, [client])

  const edit = (model: Model | null) => { setEditing(model); setTitle(model?.nome_modello || ''); setFile(null); setOpen(true) }

  const save = async () => {
    if (busy) return
    if (!title.trim()) { toast.error('Inserisci il nome del modulo.'); return }
    if (!editing && !file) { toast.error('Seleziona il file del modulo.'); return }
    if (file) try { validateModelFile(file) } catch (error) { toast.error((error as Error).message); return }
    setBusy(true)
    let path: string | null = null
    try {
      if (file) {
        const name = file.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120)
        path = `modelli-vuoti/${crypto.randomUUID()}/${name}`
        const { error } = await client.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false })
        if (error) throw new Error(`Caricamento non riuscito: ${error.message}`)
      }
      const fields = { nome_modello: title.trim(), ...(path ? { file_url: path, tipo_file: file!.type, data_caricamento: new Date().toISOString() } : {}) }
      const result = editing
        ? await client.from('modelli_documenti').update(fields).eq('id', editing.id).eq('file_url', editing.file_url).select('*').single()
        : await client.from('modelli_documenti').insert({ ...fields, file_url: path! }).select('*').single()
      if (result.error || !result.data) throw new Error('Il modulo non è stato salvato. Ricarica e riprova.')
      setModels(previous => editing ? previous.map(model => model.id === result.data.id ? result.data : model) : [result.data, ...previous])
      path = null
      setOpen(false)
      toast.success(editing ? 'Modulo aggiornato' : 'Modulo caricato')
      if (editing && file && editing.file_url.startsWith('modelli-vuoti/')) {
        try {
          const { error } = await client.storage.from(bucket).remove([editing.file_url])
          if (error) throw error
        } catch { toast.warning('Il nuovo file è disponibile; la vecchia copia non è stata rimossa dallo spazio di archiviazione.') }
      }
    } catch (error) {
      if (path) await client.storage.from(bucket).remove([path])
      toast.error(error instanceof Error ? error.message : 'Salvataggio non riuscito')
    } finally { setBusy(false) }
  }

  const download = async (model: Model) => {
    const { data, error } = await client.storage.from(bucket).download(model.file_url)
    if (error || !data) { toast.error('File non disponibile.'); return }
    const url = URL.createObjectURL(data)
    const link = document.createElement('a')
    link.href = url
    link.download = model.file_url.split('/').pop() || model.nome_modello
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  const remove = async () => {
    if (!deleting || busy) return
    setBusy(true)
    const model = deleting
    try {
      const { data, error } = await client.from('modelli_documenti').delete().eq('id', model.id).eq('file_url', model.file_url).select('id').single()
      if (error || !data) throw new Error('Modulo non eliminato. Ricarica e riprova.')
      setModels(previous => previous.filter(item => item.id !== model.id))
      setDeleting(null)
      toast.success('Modulo eliminato')
      if (model.file_url.startsWith('modelli-vuoti/')) {
        const { error: storageError } = await client.storage.from(bucket).remove([model.file_url])
        if (storageError) toast.warning('Il modulo è rimosso dall’elenco, ma il file è ancora nello spazio di archiviazione.')
      }
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Eliminazione non riuscita') }
    finally { setBusy(false) }
  }

  return <div className="mx-auto max-w-5xl space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">Modelli vuoti e moduli AGESCI</h1><p className="text-sm text-muted-foreground">Carica i tuoi moduli originali e sostituiscili quando hai una versione nuova.</p></div><Button onClick={() => edit(null)}>Aggiungi modulo</Button></div>
    {loading && <p>Caricamento moduli…</p>}{loadError && <p role="alert" className="text-red-700">{loadError}</p>}
    {!loading && !loadError && models.length === 0 && <p className="rounded border border-dashed p-8 text-center">Nessun modulo caricato. Aggiungi il primo file quando sei pronto.</p>}
    <div className="grid gap-3 sm:grid-cols-2">{models.map(model => <div key={model.id} className="space-y-3 rounded-xl border bg-white p-4"><h2 className="font-semibold">{model.nome_modello}</h2><p className="break-all text-sm text-muted-foreground">{model.file_url.split('/').pop()} · {model.data_caricamento?.slice(0, 10) || 'Data non disponibile'}</p><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => download(model)}>Scarica</Button><Button variant="outline" onClick={() => edit(model)}>Modifica / sostituisci</Button><Button variant="destructive" onClick={() => setDeleting(model)}>Elimina</Button></div></div>)}</div>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value) }}><DialogContent><DialogHeader><DialogTitle>{editing ? 'Modifica modulo' : 'Aggiungi modulo'}</DialogTitle><DialogDescription>{editing ? 'Modifica il nome o carica un file nuovo per sostituire quello attuale.' : 'Il file caricato sarà quello disponibile per il download.'}</DialogDescription></DialogHeader><div className="space-y-3"><div><Label htmlFor="model-title">Nome modulo</Label><Input id="model-title" value={title} onChange={event => setTitle(event.target.value)} disabled={busy} /></div><div><Label htmlFor="model-file">{editing ? 'Nuovo file (facoltativo)' : 'File del modulo'}</Label><Input id="model-file" type="file" accept=".pdf,.docx,.odt,.jpg,.jpeg,.png" disabled={busy} onChange={event => setFile(event.target.files?.[0] || null)} /><p className="text-xs text-muted-foreground">PDF, DOCX, ODT, JPG o PNG · massimo 20 MB.</p></div></div><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Annulla</Button><Button disabled={busy} onClick={save}>{busy ? 'Salvataggio…' : 'Salva modulo'}</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={!!deleting} onOpenChange={value => { if (!value && !busy) setDeleting(null) }}><DialogContent><DialogHeader><DialogTitle>Elimina modulo</DialogTitle><DialogDescription>Vuoi eliminare “{deleting?.nome_modello}” e il file collegato?</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setDeleting(null)}>Annulla</Button><Button variant="destructive" disabled={busy} onClick={remove}>Elimina modulo</Button></DialogFooter></DialogContent></Dialog>
  </div>
}
