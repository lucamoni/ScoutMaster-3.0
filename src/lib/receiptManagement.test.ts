import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { deleteExpenseRecord, listUnlinkedReceipts, removeExpenseReceipt, type ReceiptExpense } from './receipts'

function setup() {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
  const query = {
    update: vi.fn().mockReturnThis(), delete: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(), not: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: 'one', foto_scontrino_url: null }, error: null }),
    range: vi.fn().mockResolvedValue({ data: [], error: null }),
  }
  const storage = { remove: vi.fn().mockResolvedValue({ error: null }), list: vi.fn().mockResolvedValue({ data: [], error: null }) }
  const client = { from: vi.fn(() => query), storage: { from: vi.fn(() => storage) } } as unknown as SupabaseClient<Database>
  const expense = { id: 'one', foto_scontrino_url: 'allegati/one/file.pdf', ricevuta_presente: true } as ReceiptExpense
  return { client, query, storage, expense }
}

describe('eliminazione indipendente di movimenti e allegati', () => {
  it('elimina il movimento conservando il file quando richiesto', async () => {
    const { client, expense, storage, query } = setup()
    expect(await deleteExpenseRecord(client, expense, false)).toEqual([])
    expect(query.delete).toHaveBeenCalledOnce()
    expect(storage.remove).not.toHaveBeenCalled()
  })
  it('non elimina un file quando il movimento è cambiato o la cancellazione è negata', async () => {
    const { client, expense, storage, query } = setup()
    query.single.mockResolvedValue({ data: null, error: { message: 'conflict' } })
    await expect(deleteExpenseRecord(client, expense, true)).rejects.toThrow('Movimento non eliminato')
    expect(storage.remove).not.toHaveBeenCalled()
  })
  it('rimuove il collegamento e conserva la ricevuta cartacea senza modificare importo e data', async () => {
    const { client, expense, query, storage } = setup()
    await removeExpenseReceipt(client, expense, false)
    expect(query.update).toHaveBeenCalledExactlyOnceWith({ foto_scontrino_url: null })
    expect(storage.remove).toHaveBeenCalledExactlyOnceWith(['allegati/one/file.pdf'])
  })
  it('segna ricevuta assente e segnala un errore storage senza lasciare un link rotto', async () => {
    const { client, expense, query, storage } = setup()
    storage.remove.mockResolvedValue({ error: { message: 'network' } })
    const result = await removeExpenseReceipt(client, expense, true)
    expect(query.update).toHaveBeenCalledWith({ foto_scontrino_url: null, ricevuta_presente: false })
    expect(result.expense.foto_scontrino_url).toBeNull()
    expect(result.warning).toContain('conservato in archivio')
  })
  it('non elimina un file ancora usato da un altro movimento anche con URL legacy', async () => {
    const { client, expense, query, storage } = setup()
    query.range.mockResolvedValue({ data: [{ id: 'other', foto_scontrino_url: 'https://example.supabase.co/storage/v1/object/public/scontrini/allegati/one/file.pdf' }], error: null })
    const result = await deleteExpenseRecord(client, expense, true)
    expect(result[0]).toContain('ancora collegato')
    expect(storage.remove).not.toHaveBeenCalled()
  })
  it('mostra nell’archivio anche file annidati senza movimento', async () => {
    const { client, query, storage } = setup()
    query.range.mockResolvedValue({ data: [{ id: 'other', foto_scontrino_url: 'linked.pdf' }], error: null })
    storage.list.mockImplementation(async (folder: string) => ({ error: null, data: folder === '' ? [{ id: '1', name: 'linked.pdf' }, { id: null, name: 'allegati' }] : [{ id: '2', name: 'kept.pdf', created_at: '2026-10-01' }] }))
    expect(await listUnlinkedReceipts(client)).toEqual([{ path: 'allegati/kept.pdf', createdAt: '2026-10-01' }])
  })
})
