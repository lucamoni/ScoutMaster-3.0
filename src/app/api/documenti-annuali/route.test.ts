import { beforeEach, expect, it, vi } from 'vitest'
import type { Json } from '@/types/database.types'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn(), boy: vi.fn() }))
vi.mock('@/lib/security/auth', async original => ({ ...await original<typeof import('@/lib/security/auth')>(), requireAuthenticatedUser: mocks.auth }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }))
vi.mock('@/lib/annualRoster/server', () => ({ getAnnualBoy: mocks.boy }))
import { AuthorizationError } from '@/lib/security/auth'
import { GET, POST, DELETE } from './route'

type RecordRow = { anno_scout: string; kind: string; id: string; dati: Json; file_url?: string | null }
const records = new Map<string, RecordRow>()
const key = (record: Pick<RecordRow, 'anno_scout' | 'kind' | 'id'>) => `${record.anno_scout}|${record.kind}|${record.id}`
const tables: string[] = []
const boyId = '00000000-0000-4000-8000-000000000001'
const item = { doc_id: 'same-id', ragazzo_id: boyId, titolo: 'Privacy', consegnato: false }
const request = (body: unknown, method = 'POST', origin = 'https://scout.test') => new Request('https://scout.test/api/documenti-annuali', { method, headers: { origin }, body: JSON.stringify(body) })
function fakeQuery() {
  const filters = new Map<string, unknown>()
  let action = 'read'
  let columns = ''
  const matching = () => [...records.values()].filter(row => [...filters].every(([name, value]) => Array.isArray(value) ? value.includes(row[name as keyof RecordRow]) : row[name as keyof RecordRow] === value))
  const result = () => {
    const rows = matching()
    if (action === 'delete') for (const row of rows) records.delete(key(row))
    return { data: rows, error: null }
  }
  const query = {
    select: (value: string) => { columns = value; return query },
    eq: (name: string, value: unknown) => { filters.set(name, value); return query },
    in: (name: string, values: unknown[]) => { filters.set(name, values); return query },
    order: () => query,
    range: async () => ({ data: matching().map(row => columns.includes('file_url') ? row : { anno_scout: row.anno_scout, kind: row.kind, id: row.id, dati: row.dati }), error: null }),
    maybeSingle: async () => ({ data: matching()[0] || null, error: null }),
    upsert: async (row: RecordRow) => { records.set(key(row), row); return { error: null } },
    delete: () => { action = 'delete'; return query },
    then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
  }
  return query
}
beforeEach(() => {
  vi.resetAllMocks(); records.clear(); tables.length = 0
  mocks.auth.mockResolvedValue({ id: 'staff', app_metadata: { role: 'aiuto_capo_unita' } })
  mocks.boy.mockResolvedValue({ id: boyId })
  mocks.admin.mockImplementation(() => ({ from: (table: string) => { tables.push(table); return fakeQuery() } }))
})
it.each([GET, POST, DELETE])('richiede staff autenticato prima di leggere o modificare documenti', async route => {
  mocks.auth.mockRejectedValue(new AuthorizationError('Autenticazione richiesta', 401))
  expect((await route(request({}, 'POST'))).status).toBe(401)
  expect(mocks.admin).not.toHaveBeenCalled()
})
it('consente all’aiuto le operazioni senza usare impostazioni di sistema e isola le modifiche per anno', async () => {
  records.set('2025-2026|custom|same-id', { anno_scout: '2025-2026', kind: 'custom', id: 'same-id', dati: { ...item, consegnato: true } })
  records.set('legacy|file|old', { anno_scout: 'legacy', kind: 'file', id: 'old', dati: { file_name: 'vecchio.pdf' }, file_url: 'data:application/pdf;base64,JVBERi0=' })
  expect((await POST(request({ year: '2026-2027', kind: 'custom', item }))).status).toBe(200)
  expect(mocks.boy).toHaveBeenCalledWith('2026-2027', boyId)
  expect(records.get('2025-2026|custom|same-id')?.dati).toMatchObject({ consegnato: true })
  expect(records.get('2026-2027|custom|same-id')?.dati).toMatchObject({ consegnato: false })
  expect((await DELETE(request({ year: '2026-2027', kind: 'custom', id: 'same-id' }, 'DELETE'))).status).toBe(200)
  expect(records.has('2025-2026|custom|same-id')).toBe(true)
  expect(records.get('legacy|file|old')?.file_url).toBe('data:application/pdf;base64,JVBERi0=')
  expect(tables.every(table => table === 'documenti_annuali')).toBe(true)
})
it('restituisce separatamente legacy e anno selezionato senza scaricare tutti i file nel JSON', async () => {
  records.set('2025-2026|custom|same-id', { anno_scout: '2025-2026', kind: 'custom', id: 'same-id', dati: item })
  records.set('2026-2027|custom|same-id', { anno_scout: '2026-2027', kind: 'custom', id: 'same-id', dati: item })
  records.set('legacy|file|old', { anno_scout: 'legacy', kind: 'file', id: 'old', dati: { file_name: 'vecchio.pdf', created_at: '2026-01-01' }, file_url: 'data:application/pdf;base64,JVBERi0=' })
  const body = await (await GET(new Request('https://scout.test/api/documenti-annuali?year=2026-2027'))).json()
  expect(body.customDocs).toMatchObject([{ anno_scout: '2026-2027' }])
  expect(body.archivedFiles).toEqual([])
  expect(body.legacyFiles).toMatchObject([{ anno_scout: null, file_url: '/api/documenti-annuali?year=legacy&kind=file&id=old' }])
  expect(JSON.stringify(body)).not.toContain('JVBERi0=')
})
it('mantiene disponibili i byte dei file precedenti tramite download autenticato', async () => {
  records.set('legacy|file|old', { anno_scout: 'legacy', kind: 'file', id: 'old', dati: { file_name: 'vecchio.pdf' }, file_url: 'data:application/pdf;base64,JVBERi0=' })
  const response = await GET(new Request('https://scout.test/api/documenti-annuali?year=legacy&kind=file&id=old&download=1'))
  expect(response.status).toBe(200)
  expect(response.headers.get('content-disposition')).toContain('attachment')
  expect(response.headers.get('content-type')).toBe('application/pdf')
  expect(await response.text()).toBe('%PDF-')
})
it('blocca origine esterna e ragazzo estraneo all’anno senza salvare documenti', async () => {
  expect((await POST(request({ year: '2026-2027', kind: 'custom', item }, 'POST', 'https://evil.test'))).status).toBe(400)
  expect(mocks.admin).not.toHaveBeenCalled()
  mocks.boy.mockResolvedValue(null)
  expect((await POST(request({ year: '2026-2027', kind: 'custom', item }))).status).toBe(400)
  expect(records.size).toBe(0)
})
