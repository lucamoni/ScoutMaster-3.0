import { expect, it } from 'vitest'
import { documentYear, groupAnnualDocuments, parseAnnualDocument, type AnnualDocumentRecord } from './annualDocumentsModel'

const boyId = '00000000-0000-4000-8000-000000000001'
const custom = { doc_id: 'doc-one', ragazzo_id: boyId, titolo: 'Privacy', consegnato: true }
const file = { id: 'file-one', ragazzo_id: boyId, ragazzo_nome: 'Nome Cognome', titolo_documento: 'Privacy', tipo_documento: 'foglio_privacy_firmato', file_name: 'privacy.pdf', file_url: 'data:application/pdf;base64,JVBERi0=', mime_type: 'application/pdf', created_at: '2026-01-01T00:00:00Z' }

it('separa i documenti dei due anni e conserva i legacy senza conteggiarli come consegnati nell’anno corrente', () => {
  const records: AnnualDocumentRecord[] = [
    { anno_scout: '2025-2026', kind: 'custom', id: custom.doc_id, dati: custom },
    { anno_scout: '2026-2027', kind: 'custom', id: custom.doc_id, dati: { ...custom, consegnato: false } },
    { anno_scout: 'legacy', kind: 'custom', id: 'old-custom', dati: custom },
    { anno_scout: 'legacy', kind: 'file', id: 'old-file', dati: { ...file, file_url: undefined, created_at: '2026-01-01T00:00:00Z' } },
    { anno_scout: '2025-2026', kind: 'file', id: file.id, dati: file },
  ]
  const original = JSON.stringify(records)
  const current = groupAnnualDocuments(records, '2026-2027')
  expect(current.customDocs).toMatchObject([{ consegnato: false, anno_scout: '2026-2027' }])
  expect(current.archivedFiles).toEqual([])
  expect(current.legacyCustomDocs).toMatchObject([{ consegnato: true, anno_scout: null }])
  expect(current.legacyFiles).toMatchObject([{ id: 'old-file', anno_scout: null, file_url: '/api/documenti-annuali?year=legacy&kind=file&id=old-file' }])
  expect(groupAnnualDocuments(records, '2025-2026').customDocs[0].consegnato).toBe(true)
  expect(JSON.stringify(records)).toBe(original)
})
it('richiede anno esplicito valido e non attribuisce automaticamente i documenti legacy a un anno', () => {
  expect(() => parseAnnualDocument({ year: 'legacy', kind: 'custom', item: custom })).toThrow('Anno scout')
  expect(() => parseAnnualDocument({ kind: 'custom', item: custom })).toThrow('Anno scout')
  expect(() => documentYear('2025-2027')).toThrow('Anno scout')
  expect(() => parseAnnualDocument({ year: '2026-2027', kind: 'custom', item: { ...custom, anno_scout: '2025-2026' } })).toThrow('altro anno')
})
it('salva un singolo record con ragazzo, anno e stato, senza accettare un intero archivio', () => {
  expect(parseAnnualDocument({ year: '2025-2026', kind: 'custom', item: custom })).toMatchObject({ year: '2025-2026', id: 'doc-one', fileUrl: null, data: { ...custom, anno_scout: '2025-2026' } })
  expect(() => parseAnnualDocument({ year: '2025-2026', kind: 'custom', item: [custom] })).toThrow('Dati documento')
  expect(() => parseAnnualDocument({ year: '2025-2026', kind: 'custom', item: { ...custom, consegnato: 'true' } })).toThrow('Stato')
})
it('separa i byte dal JSON di elenco e rifiuta contenuti attivi o richieste troppo grandi', () => {
  const parsed = parseAnnualDocument({ year: '2025-2026', kind: 'file', item: file })
  expect(parsed.fileUrl).toBe(file.file_url)
  expect(parsed.data).not.toHaveProperty('file_url')
  expect(() => parseAnnualDocument({ year: '2025-2026', kind: 'file', item: { ...file, file_url: 'data:text/html;base64,AAAA' } })).toThrow('PDF')
  expect(() => parseAnnualDocument({ year: '2025-2026', kind: 'file', item: { ...file, file_url: `data:application/pdf;base64,${'A'.repeat(4 * 1024 * 1024 + 4)}` } })).toThrow('3 MB')
})
