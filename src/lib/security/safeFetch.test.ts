import { afterEach, expect, it, vi } from 'vitest'
import { fetchBuonaCacciaHtml } from './safeFetch'

afterEach(() => vi.unstubAllGlobals())

it('usa il nuovo dominio anche per i collegamenti storici', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response('<html>evento</html>', { headers: { 'content-type': 'text/html' } }))
  vi.stubGlobal('fetch', fetchMock)
  await expect(fetchBuonaCacciaHtml('https://buonacaccia.net/Event.aspx?e=123')).resolves.toBe('<html>evento</html>')
  expect(String(fetchMock.mock.calls[0][0])).toBe('https://buonacaccia.agesci.it/Event.aspx?e=123')
  expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'manual' })
})

it('blocca host esterni e redirect senza seguirli', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { location: 'https://example.com' } }))
  vi.stubGlobal('fetch', fetchMock)
  await expect(fetchBuonaCacciaHtml('https://buonacaccia.agesci.it.evil.test')).rejects.toThrow('Sono consentiti')
  expect(fetchMock).not.toHaveBeenCalled()
  await expect(fetchBuonaCacciaHtml('https://buonacaccia.agesci.it/Event.aspx?e=123')).rejects.toThrow('Redirect esterni')
})
