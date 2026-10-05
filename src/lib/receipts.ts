import { annualBoyUpdate } from '@/lib/annualRoster/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

export const RECEIPT_BUCKET = 'scontrini'
export const MAX_RECEIPT_BYTES = 20 * 1024 * 1024
const MIME_BY_EXTENSION: Record<string, string[]> = {
  jpg: ['image/jpeg'], jpeg: ['image/jpeg'], png: ['image/png'], webp: ['image/webp'],
  heic: ['image/heic', 'image/heif'], heif: ['image/heif', 'image/heic'],
  pdf: ['application/pdf'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  csv: ['text/csv', 'text/plain', 'application/vnd.ms-excel'], txt: ['text/plain'],
}
export const RECEIPT_ACCEPT = Object.keys(MIME_BY_EXTENSION).map(ext => `.${ext}`).join(',')
export type ReceiptExpense = Database['public']['Tables']['registro_spese']['Row']
type Client = SupabaseClient<Database>

export async function receiptLinks(client: Client) {
  const rows: Pick<ReceiptExpense, 'id' | 'foto_scontrino_url'>[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from('registro_spese').select('id,foto_scontrino_url')
      .not('foto_scontrino_url', 'is', null).order('id').range(offset, offset + 499)
    if (error) throw new Error('Impossibile verificare i collegamenti degli allegati')
    rows.push(...(data || []))
    if (!data || data.length < 500) return rows
  }
}

export async function removeUnlinkedReceipt(client: Client, value: string) {
  const host = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const path = receiptPath(value, host)
  const links = await receiptLinks(client)
  if (links.some(row => row.foto_scontrino_url && receiptPath(row.foto_scontrino_url, host) === path)) {
    throw new Error('File ancora collegato a un movimento: apri il movimento prima di eliminarlo.')
  }
  const { error } = await client.storage.from(RECEIPT_BUCKET).remove([path])
  if (error) throw new Error('Il file è conservato in archivio: eliminazione non riuscita. Riprova dall’archivio.')
}

export async function removeExpenseReceipt(client: Client, expense: ReceiptExpense, markReceiptAbsent: boolean) {
  if (!expense.foto_scontrino_url) throw new Error('Nessun allegato da eliminare')
  const { data, error } = await client.from('registro_spese').update({
    foto_scontrino_url: null,
    ...(markReceiptAbsent ? { ricevuta_presente: false } : {}),
  }).eq('id', expense.id).eq('foto_scontrino_url', expense.foto_scontrino_url).select('*').single()
  if (error || !data) throw new Error('Il movimento è cambiato: ricarica e riprova. Il file non è stato eliminato.')
  // Detach first: a storage failure must leave a recoverable, unlinked file,
  // never a movement pointing to a deleted file.
  let warning: string | undefined
  try { await removeUnlinkedReceipt(client, expense.foto_scontrino_url) }
  catch (error) { warning = error instanceof Error ? error.message : 'File conservato in archivio' }
  return { expense: data, warning }
}

export async function deleteExpenseRecord(client: Client, expense: ReceiptExpense, deleteFile: boolean) {
  let query = client.from('registro_spese').delete().eq('id', expense.id)
  query = expense.foto_scontrino_url === null ? query.is('foto_scontrino_url', null) : query.eq('foto_scontrino_url', expense.foto_scontrino_url)
  const { data, error } = await query.select('id').single()
  if (error || !data) throw new Error('Movimento non eliminato: potrebbe essere cambiato. Ricarica e riprova.')
  const warnings: string[] = []
  try {
    if (expense.partecipazione_evento_id) {
      const result = await client.from('partecipazioni_eventi').update({ riscosso: false }).eq('id', expense.partecipazione_evento_id)
      if (result.error) throw result.error
    }
    const months = ['novembre', 'dicembre', 'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno']
    if (expense.quota_mensile_id && expense.riferimento_quota && months.includes(expense.riferimento_quota)) {
      const result = await client.from('quote_mensili').update({ [expense.riferimento_quota]: false } as Database['public']['Tables']['quote_mensili']['Update']).eq('id', expense.quota_mensile_id)
      if (result.error) throw result.error
    }
    if (expense.ragazzo_id && (expense.riferimento_censimento_anno || /^(quota\s+)?censimento$/i.test(expense.voce_spesa || ''))) {
      const result = await annualBoyUpdate(expense.ragazzo_id, { quota_censimento: false },expense.riferimento_censimento_anno || (expense.data ? `${Number(expense.data.slice(0,4))-(expense.data.slice(5,7)<'10'?1:0)}-${Number(expense.data.slice(0,4))+(expense.data.slice(5,7)<'10'?0:1)}` : undefined))
      if (result.error) throw result.error
    }
  } catch {
    warnings.push('Movimento eliminato, ma lo stato del pagamento collegato non è stato aggiornato. Controlla la quota prima di riconciliare.')
  }
  if (deleteFile && expense.foto_scontrino_url) {
    try { await removeUnlinkedReceipt(client, expense.foto_scontrino_url) }
    catch (error) { warnings.push(error instanceof Error ? error.message : 'File conservato in archivio') }
  }
  return warnings
}

export async function listUnlinkedReceipts(client: Client) {
  const links = await receiptLinks(client)
  const linked = new Set(links.filter(row => row.foto_scontrino_url).map(row => receiptPath(row.foto_scontrino_url!, process.env.NEXT_PUBLIC_SUPABASE_URL!)))
  const files: { path: string; createdAt: string | null }[] = []
  const folders = ['']
  while (folders.length) {
    const folder = folders.shift()!
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await client.storage.from(RECEIPT_BUCKET).list(folder, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } })
      if (error) throw new Error('Impossibile caricare i file conservati in archivio')
      for (const item of data || []) {
        const path = folder ? `${folder}/${item.name}` : item.name
        if (!item.id) folders.push(path)
        else if (!linked.has(path)) files.push({ path, createdAt: item.created_at || null })
      }
      if (!data || data.length < 100) break
    }
  }
  return files
}

export function validateReceiptFile(file: Pick<File, 'name' | 'type' | 'size'>) {
  const extension = file.name.split('.').pop()?.toLowerCase() || ''
  const types = MIME_BY_EXTENSION[extension]
  if (!types || (file.type && file.type !== 'application/octet-stream' && !types.includes(file.type))) {
    throw new Error('Scegli una foto, un PDF, un documento DOCX, XLSX, CSV o TXT.')
  }
  if (!file.size || file.size > MAX_RECEIPT_BYTES) throw new Error('Il file deve essere non vuoto e non superare 20 MB.')
  return types[0]
}

export function receiptFileName(path: string) {
  return path.split('?')[0].split('/').pop() || 'allegato'
}

export function receiptPath(value: string, supabaseUrl: string) {
  if (!/^https?:\/\//i.test(value)) {
    if (!value || value.startsWith('/') || value.split('/').includes('..')) throw new Error('Percorso allegato non valido')
    return value
  }
  const url = new URL(value)
  if (url.origin !== new URL(supabaseUrl).origin) throw new Error('Archivio allegato non riconosciuto')
  const prefix = `/storage/v1/object/`
  const match = url.pathname.match(new RegExp(`^${prefix}(?:public|sign|authenticated)/scontrini/(.+)$`))
  if (!match) throw new Error('Percorso allegato non valido')
  return receiptPath(decodeURIComponent(match[1]), supabaseUrl)
}

export async function uploadReceipt(client: Client, file: File) {
  const contentType = validateReceiptFile(file)
  const name = file.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-160)
  const path = `allegati/${crypto.randomUUID()}/${name}`
  const { error } = await client.storage.from(RECEIPT_BUCKET).upload(path, file, { contentType, upsert: false })
  if (error) throw new Error(`Caricamento allegato non riuscito: ${error.message}`)
  return path
}

// Roll back only the newly uploaded object; a failed replacement must never remove the old file.
export async function saveExpenseReceipt(client: Client, expense: ReceiptExpense, file: File) {
  return withReceiptUpload(client, file, async path => {
    const query = client.from('registro_spese').update({ foto_scontrino_url: path, ricevuta_presente: true }).eq('id', expense.id)
    const guarded = expense.foto_scontrino_url === null
      ? query.is('foto_scontrino_url', null)
      : query.eq('foto_scontrino_url', expense.foto_scontrino_url)
    const { data, error } = await guarded.select('*').single()
    if (error || !data) throw new Error('Allegato non collegato. La voce potrebbe essere stata modificata: ricarica e riprova.')
    // Keep older storage objects: replacing a link never irreversibly removes a document.
    return data
  })
}

export async function downloadReceipt(client: Client, path: string) {
  const { data, error } = await client.storage.from(RECEIPT_BUCKET).download(path)
  if (error || !data) throw new Error('Impossibile scaricare il file. Riprova dopo aver effettuato l’accesso.')
  const url = URL.createObjectURL(data)
  const link = document.createElement('a')
  link.href = url
  link.download = receiptFileName(path)
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export async function withReceiptUpload<T>(client: Client, file: File | null, save: (path: string | null) => Promise<T>): Promise<T> {
  const path = file ? await uploadReceipt(client, file) : null
  try { return await save(path) }
  catch (error) {
    if (path) await client.storage.from(RECEIPT_BUCKET).remove([path])
    throw error
  }
}
