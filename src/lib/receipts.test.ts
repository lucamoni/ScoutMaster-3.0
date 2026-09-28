import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { MAX_RECEIPT_BYTES, receiptPath, saveExpenseReceipt, validateReceiptFile, withReceiptUpload, type ReceiptExpense } from './receipts'

const file = new File(['receipt'], 'ricevuta.pdf', { type: 'application/pdf' })
function mockClient() {
  const storage = { upload: vi.fn().mockResolvedValue({ error: null }), remove: vi.fn().mockResolvedValue({ error: null }) }
  const query = {
    update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: 'expense', foto_scontrino_url: 'new.pdf' }, error: null }),
  }
  const client = { storage: { from: vi.fn(() => storage) }, from: vi.fn(() => query) } as unknown as SupabaseClient<Database>
  return { client, storage, query }
}

describe('allegati spese', () => {
  it('accetta PDF e foto HEIC ma rifiuta file vuoti, troppo grandi e formati attivi', () => {
    expect(validateReceiptFile(file)).toBe('application/pdf')
    expect(validateReceiptFile({ name: 'foto.heic', type: 'image/heic', size: 10 })).toBe('image/heic')
    for (const invalid of [
      { name: 'x.pdf', type: 'application/pdf', size: 0 },
      { name: 'x.pdf', type: 'application/pdf', size: MAX_RECEIPT_BYTES + 1 },
      { name: 'x.html', type: 'text/html', size: 10 },
      { name: 'x.pdf', type: 'text/html', size: 10 },
      { name: 'x.svg', type: 'image/svg+xml', size: 10 },
    ]) expect(() => validateReceiptFile(invalid)).toThrow()
  })

  it('riapre i percorsi privati e le vecchie URL del progetto senza accettare altri host o bucket', () => {
    const host = 'https://example.supabase.co'
    expect(receiptPath('allegati/id/file.pdf', host)).toBe('allegati/id/file.pdf')
    expect(receiptPath(`${host}/storage/v1/object/public/scontrini/old.jpg`, host)).toBe('old.jpg')
    expect(() => receiptPath('https://other.test/storage/v1/object/public/scontrini/file.pdf', host)).toThrow()
    expect(() => receiptPath(`${host}/storage/v1/object/public/other/file.pdf`, host)).toThrow()
    expect(() => receiptPath('../private.pdf', host)).toThrow()
  })

  it('annulla solo il nuovo upload se il collegamento della spesa fallisce', async () => {
    const { client, storage, query } = mockClient()
    query.single.mockResolvedValue({ data: null, error: { message: 'permission denied' } })
    await expect(saveExpenseReceipt(client, { id: 'expense', foto_scontrino_url: 'old.pdf' } as ReceiptExpense, file)).rejects.toThrow()
    const newPath = storage.upload.mock.calls[0][0]
    expect(newPath).toMatch(/^allegati\/.+\/ricevuta.pdf$/)
    expect(query.eq).toHaveBeenCalledWith('foto_scontrino_url', 'old.pdf')
    expect(storage.remove).toHaveBeenCalledExactlyOnceWith([newPath])
    expect(storage.remove).not.toHaveBeenCalledWith(['old.pdf'])
  })

  it('mantiene il file dopo un salvataggio riuscito e verifica che la spesa non sia cambiata', async () => {
    const { client, storage, query } = mockClient()
    const saved = await saveExpenseReceipt(client, { id: 'expense', foto_scontrino_url: null } as ReceiptExpense, file)
    expect(saved.id).toBe('expense')
    expect(query.is).toHaveBeenCalledWith('foto_scontrino_url', null)
    expect(query.update).toHaveBeenCalledWith({ foto_scontrino_url: storage.upload.mock.calls[0][0], ricevuta_presente: true })
    expect(storage.remove).not.toHaveBeenCalled()
  })

  it('non salva la voce se il caricamento non riesce', async () => {
    const { client, storage } = mockClient()
    storage.upload.mockResolvedValue({ error: { message: 'storage unavailable' } })
    const save = vi.fn()
    await expect(withReceiptUpload(client, file, save)).rejects.toThrow('Caricamento')
    expect(save).not.toHaveBeenCalled()
  })

  it('consente la scansione senza conservare la foto e pulisce upload dopo errori di rete', async () => {
    const { client, storage } = mockClient()
    const save = vi.fn().mockResolvedValue({ id: 'expense' })
    await withReceiptUpload(client, null, save)
    expect(save).toHaveBeenCalledWith(null)
    expect(storage.upload).not.toHaveBeenCalled()
    await expect(withReceiptUpload(client, file, async () => { throw new Error('network') })).rejects.toThrow('network')
    expect(storage.remove).toHaveBeenCalledOnce()
  })
})
