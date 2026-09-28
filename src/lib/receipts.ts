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
