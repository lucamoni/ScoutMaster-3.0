import { validWorkingYear } from '@/lib/utils/workingYear'

export type AnnualDocumentKind = 'custom' | 'file'
export type AnnualDocumentRecord = { anno_scout: string; kind: AnnualDocumentKind; id: string; dati: unknown }
export type CustomAnnualDocument = { ragazzo_id: string; doc_id: string; titolo: string; consegnato: boolean; anno_scout?: string | null }
export type ArchivedAnnualDocument = { id: string; ragazzo_id: string; ragazzo_nome: string; titolo_documento: string; tipo_documento: string; file_name: string; file_url: string; mime_type: string; created_at: string; anno_scout?: string | null }
export type AnnualDocuments = { customDocs: CustomAnnualDocument[]; archivedFiles: ArchivedAnnualDocument[]; legacyCustomDocs: CustomAnnualDocument[]; legacyFiles: ArchivedAnnualDocument[]; legacyUnrecognized: number }
export class AnnualDocumentInputError extends Error {}
const uuid = /^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i

export function documentYear(value: unknown, allowLegacy = false) {
  if (allowLegacy && value === 'legacy') return 'legacy'
  const year = typeof value === 'string' ? validWorkingYear(value) : null
  if (!year) throw new AnnualDocumentInputError('Anno scout non valido')
  return year
}
export function documentKind(value: unknown): AnnualDocumentKind {
  if (value !== 'custom' && value !== 'file') throw new AnnualDocumentInputError('Tipo di documento non valido')
  return value
}
export function documentId(value: unknown) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(value)) throw new AnnualDocumentInputError('Identificativo documento non valido')
  return value
}
const object = (value: unknown): Record<string, unknown> | null => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
function text(value: unknown, name: string, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new AnnualDocumentInputError(`${name} non valido`)
  return value.trim()
}
export function documentFileUrl(year: string, id: string, download = false) {
  return `/api/documenti-annuali?${new URLSearchParams({ year, kind: 'file', id, ...(download ? { download: '1' } : {}) })}`
}
export function groupAnnualDocuments(records: AnnualDocumentRecord[], year: string): AnnualDocuments {
  const result: AnnualDocuments = { customDocs: [], archivedFiles: [], legacyCustomDocs: [], legacyFiles: [], legacyUnrecognized: 0 }
  for (const record of records) {
    if (record.anno_scout !== year && record.anno_scout !== 'legacy') continue
    const data = object(record.dati)
    if (!data) { if (record.anno_scout === 'legacy') result.legacyUnrecognized++; continue }
    const legacy = record.anno_scout === 'legacy'
    const item = { ...data, anno_scout: legacy ? null : record.anno_scout }
    if (record.kind === 'custom') {
      const target = legacy ? result.legacyCustomDocs : result.customDocs
      target.push({ ...item, doc_id: record.id } as CustomAnnualDocument)
    } else {
      const target = legacy ? result.legacyFiles : result.archivedFiles
      target.push({ ...item, id: record.id, file_url: documentFileUrl(record.anno_scout, record.id) } as ArchivedAnnualDocument)
    }
  }
  return result
}
export function parseAnnualDocument(input: unknown) {
  const body = object(input)
  if (!body) throw new AnnualDocumentInputError('Dati documento non validi')
  const year = documentYear(body.year)
  const kind = documentKind(body.kind)
  const item = object(body.item)
  if (!item) throw new AnnualDocumentInputError('Dati documento non validi')
  if (typeof item.ragazzo_id !== 'string' || !uuid.test(item.ragazzo_id)) throw new AnnualDocumentInputError('Ragazzo non valido')
  if (item.anno_scout && item.anno_scout !== year) throw new AnnualDocumentInputError('Il documento appartiene a un altro anno scout')
  const id = documentId(kind === 'custom' ? item.doc_id : item.id)
  if (kind === 'custom') {
    if (typeof item.consegnato !== 'boolean') throw new AnnualDocumentInputError('Stato del documento non valido')
    return { year, kind, id, boyId: item.ragazzo_id, fileUrl: null, data: { ragazzo_id: item.ragazzo_id, doc_id: id, titolo: text(item.titolo, 'Titolo'), consegnato: item.consegnato, anno_scout: year } }
  }
  if (typeof item.file_url !== 'string') throw new AnnualDocumentInputError('File non valido')
  const match = item.file_url.match(/^data:(application\/pdf|image\/(?:png|jpeg|webp|gif|heic|heif));base64,([A-Za-z0-9+/]+={0,2})$/)
  if (!match || match[2].length % 4 !== 0) throw new AnnualDocumentInputError('Carica un PDF o una foto PNG, JPEG, WebP, GIF o HEIC')
  if (match[2].length > 4 * 1024 * 1024) throw new AnnualDocumentInputError('Il documento supera 3 MB. Riduci la dimensione del file prima del caricamento')
  const createdAt = typeof item.created_at === 'string' && !Number.isNaN(Date.parse(item.created_at)) ? item.created_at : new Date().toISOString()
  return { year, kind, id, boyId: item.ragazzo_id, fileUrl: item.file_url, data: { id, ragazzo_id: item.ragazzo_id, ragazzo_nome: text(item.ragazzo_nome, 'Nome ragazzo'), titolo_documento: text(item.titolo_documento, 'Titolo'), tipo_documento: text(item.tipo_documento, 'Categoria'), file_name: text(item.file_name, 'Nome file'), mime_type: match[1], created_at: createdAt, anno_scout: year } }
}
