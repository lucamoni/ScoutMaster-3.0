import { afterEach, describe, expect, it, vi } from 'vitest'
import { annualBoyCreate, annualBoyUpdate, annualBoys } from './client'

afterEach(() => vi.unstubAllGlobals())

describe('anagrafica annuale sul client', () => {
  it('invia l’anno della scheda modificata anche se un’altra tab cambia anno', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: { id: 'boy-1', quota_censimento: true }, year: '2025-2026' }))
    vi.stubGlobal('fetch', fetchMock)
    const result = await annualBoyUpdate('boy-1', { quota_censimento: true }, '2025-2026')
    expect(result.error).toBeNull()
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ id: 'boy-1', changes: { quota_censimento: true }, year: '2025-2026' })
    expect(fetchMock.mock.calls[0][1].method).toBe('PATCH')
  })
  it('crea e rilegge i ragazzi usando il contratto API annuale', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ data: { id: 'boy-1', nome: 'Anna' } })).mockResolvedValueOnce(Response.json({ data: [{ id: 'boy-1' }], year: '2025-2026' }))
    vi.stubGlobal('fetch', fetchMock)
    expect((await annualBoyCreate({ nome: 'Anna', cognome: 'Rossi' }, '2025-2026')).data?.id).toBe('boy-1')
    expect((await annualBoys('2025-2026')).data).toHaveLength(1)
    expect(fetchMock.mock.calls[0][1].method).toBe('POST')
    expect(fetchMock.mock.calls[1][0]).toBe('/api/anagrafica?year=2025-2026')
  })
  it('segnala errori HTTP e di connessione senza dichiarare un salvataggio riuscito', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ error: 'Anno chiuso' }, { status: 403 })).mockRejectedValueOnce(new Error('Offline')))
    expect((await annualBoyUpdate('boy-1', {})).error?.message).toBe('Anno chiuso')
    expect((await annualBoys()).error?.message).toContain('Connessione')
  })
  it('invia metodo e data censimento nella stessa scrittura annuale atomica', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ data: { id: 'boy-1' } }))
    vi.stubGlobal('fetch', fetchMock)
    await annualBoyUpdate('boy-1', { quota_censimento: true }, '2025-2026', { method: 'Bonifico', date: '2026-09-30' })
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      id: 'boy-1', changes: { quota_censimento: true }, year: '2025-2026', census: { method: 'Bonifico', date: '2026-09-30' },
    })
    await annualBoyCreate({ nome: 'Anna', cognome: 'Rossi', quota_censimento: true }, '2025-2026', { method: 'Carta' })
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      changes: { nome: 'Anna', cognome: 'Rossi', quota_censimento: true }, year: '2025-2026', census: { method: 'Carta' },
    })
  })
})
