import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const generateContent = vi.hoisted(() => vi.fn())
vi.mock('@google/genai', () => ({ GoogleGenAI: class { models = { generateContent } } }))
vi.mock('@/lib/security/auth', () => ({ requireAuthenticatedUser: vi.fn(), authorizationErrorResponse: () => null }))

import { POST } from './route'

function photoRequest(file = new File(['photo'], 'scontrino.jpg', { type: 'image/jpeg' })) {
  const form = new FormData()
  form.append('file', file)
  form.append('categories', JSON.stringify(['KAMBU', 'Altro']))
  return new Request('http://localhost/api/ocr/scontrino', { method: 'POST', body: form })
}

beforeEach(() => {
  vi.stubEnv('GEMINI_API_KEY', 'test-key')
  vi.stubEnv('GROQ_API_KEY', '')
  generateContent.mockReset()
})

afterEach(() => vi.unstubAllGlobals())

it('legge lo scontrino con Groq quando configurato senza invocare Google', async () => {
  vi.stubEnv('GROQ_API_KEY', 'test-groq')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: JSON.stringify({ importo: 12.5, data: '2026-10-01', fornitore: 'Test' }) } }] })))
  const response = await POST(photoRequest())
  expect(await response.json()).toMatchObject({ provider: 'groq-server', importo: 12.5, data: '2026-10-01' })
  expect(generateContent).not.toHaveBeenCalled()
})

it('passa a Google se Groq è temporaneamente indisponibile', async () => {
  vi.stubEnv('GROQ_API_KEY', 'test-groq')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 429 })))
  const log = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  generateContent.mockResolvedValue({ text: JSON.stringify({ importo: 10 }) })
  const response = await POST(photoRequest())
  expect(await response.json()).toMatchObject({ provider: 'gemini-server', importo: 10 })
  expect(generateContent).toHaveBeenCalledOnce()
  log.mockRestore()
})

it('estrae i dati verificabili e limita la categoria a quelle del reparto', async () => {
  generateContent.mockResolvedValue({ text: JSON.stringify({ importo: 12.5, data: '2026-09-30', fornitore: 'Coop', voce_spesa: 'KAMBU', raw_text: 'TOTALE 12,50' }) })
  const response = await POST(photoRequest())
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({ provider: 'gemini-server', importo: 12.5, data: '2026-09-30', voce_spesa: 'KAMBU' })
  expect(generateContent).toHaveBeenCalledOnce()
})

it('normalizza valori non validi e ignora categorie estranee', async () => {
  generateContent.mockResolvedValue({ text: JSON.stringify({ importo: -4, data: '2026-02-30', fornitore: '', voce_spesa: 'Non autorizzata' }) })
  const response = await POST(photoRequest())
  expect(await response.json()).toMatchObject({ importo: null, data: null, fornitore: null, voce_spesa: null })
})

it('quando il servizio non è configurato torna un errore gestibile senza caricare il motore sul telefono', async () => {
  vi.stubEnv('GEMINI_API_KEY', '')
  const response = await POST(photoRequest())
  expect(response.status).toBe(503)
  expect(generateContent).not.toHaveBeenCalled()
})

it('rifiuta file che non sono fotografie', async () => {
  const response = await POST(photoRequest(new File(['x'], 'documento.pdf', { type: 'application/pdf' })))
  expect(response.status).toBe(415)
  expect(generateContent).not.toHaveBeenCalled()
})

it('spiega un limite del servizio senza esporre il messaggio privato del provider', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  generateContent.mockRejectedValue(new Error('429 RESOURCE_EXHAUSTED private provider details'))
  const response = await POST(photoRequest())
  expect(response.status).toBe(502)
  const payload = await response.json()
  expect(payload.error).toContain('limite di utilizzo')
  expect(payload.error).not.toContain('private provider details')
  log.mockRestore()
})
