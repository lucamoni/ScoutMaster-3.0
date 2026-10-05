import type { AnnualDocumentKind, AnnualDocuments, ArchivedAnnualDocument, CustomAnnualDocument } from './annualDocumentsModel'

async function responseData(response: Response) {
  const body = await response.json()
  if (!response.ok) throw new Error(body.error || 'Operazione sui documenti non riuscita')
  return body
}
export async function loadAnnualDocuments(year: string): Promise<AnnualDocuments> {
  return responseData(await fetch(`/api/documenti-annuali?${new URLSearchParams({ year })}`, { cache: 'no-store' }))
}
export async function saveAnnualDocument(year: string, kind: AnnualDocumentKind, item: CustomAnnualDocument | ArchivedAnnualDocument) {
  return responseData(await fetch('/api/documenti-annuali', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ year, kind, item: { ...item, anno_scout: year } }) }))
}
export async function deleteAnnualDocument(year: string, kind: AnnualDocumentKind, id: string) {
  return responseData(await fetch('/api/documenti-annuali', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ year, kind, id }) }))
}
