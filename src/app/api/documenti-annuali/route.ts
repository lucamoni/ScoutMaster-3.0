import { authorizationErrorResponse, requireAuthenticatedUser } from '@/lib/security/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAnnualBoy } from '@/lib/annualRoster/server'
import { AnnualDocumentInputError, documentId, documentKind, documentYear, groupAnnualDocuments, parseAnnualDocument, type AnnualDocumentRecord } from '@/lib/annualDocumentsModel'

export const dynamic = 'force-dynamic'
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
const failure = (error: unknown) => authorizationErrorResponse(error) || reply({ error: error instanceof AnnualDocumentInputError ? error.message : 'Operazione sui documenti non riuscita. Riprova.' }, error instanceof AnnualDocumentInputError ? 400 : 500)
function sameOrigin(request: Request) {
  if (request.headers.get('sec-fetch-site') === 'cross-site' || (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin)) throw new AnnualDocumentInputError('Richiesta non consentita')
}
async function input(request: Request) {
  if (Number(request.headers.get('content-length') || 0) > 4400000) throw new AnnualDocumentInputError('Documento troppo grande')
  const content = await request.text()
  if (Buffer.byteLength(content) > 4400000) throw new AnnualDocumentInputError('Documento troppo grande')
  try { return JSON.parse(content) } catch { throw new AnnualDocumentInputError('Dati documento non validi') }
}

export async function GET(request: Request) {
  try {
    await requireAuthenticatedUser()
    const params = new URL(request.url).searchParams
    const year = documentYear(params.get('year'), params.has('id'))
    const db = createAdminClient()
    if (params.has('id')) {
      const id = documentId(params.get('id'))
      if (documentKind(params.get('kind')) !== 'file') throw new AnnualDocumentInputError('Tipo di documento non valido')
      const { data, error } = await db.from('documenti_annuali').select('dati,file_url').eq('anno_scout', year).eq('kind', 'file').eq('id', id).maybeSingle()
      if (error) throw error
      if (!data?.file_url) return reply({ error: 'File non trovato' }, 404)
      const match = data.file_url.match(/^data:([^;,]+);base64,([A-Za-z0-9+/\r\n]+={0,2})$/)
      if (!match) {
        // Legacy remote links remain available; never fetch their content with server credentials.
        if (/^https:\/\//.test(data.file_url)) return Response.redirect(data.file_url)
        throw new AnnualDocumentInputError('Formato del documento precedente non leggibile')
      }
      const safeMime = /^(application\/pdf|image\/(png|jpeg|webp|gif|heic|heif))$/.test(match[1])
      const metadata = data.dati && typeof data.dati === 'object' && !Array.isArray(data.dati) ? data.dati : {}
      const filename = typeof metadata.file_name === 'string' ? metadata.file_name : 'documento'
      const disposition = params.get('download') === '1' || !safeMime ? 'attachment' : 'inline'
      const encodedName = encodeURIComponent(filename).replace(/['()*]/g, value => `%${value.charCodeAt(0).toString(16).toUpperCase()}`)
      return new Response(Buffer.from(match[2], 'base64'), { headers: { 'Content-Type': safeMime ? match[1] : 'application/octet-stream', 'Content-Disposition': `${disposition}; filename*=UTF-8''${encodedName}`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" } })
    }
    const records: AnnualDocumentRecord[] = []
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await db.from('documenti_annuali').select('anno_scout,kind,id,dati').in('anno_scout', [year, 'legacy']).order('created_at', { ascending: false }).order('id').range(offset, offset + 499)
      if (error || !data) throw error || new Error('Documenti non disponibili')
      records.push(...data as AnnualDocumentRecord[])
      if (data.length < 500) break
    }
    return reply(groupAnnualDocuments(records, year))
  } catch (error) { return failure(error) }
}

export async function POST(request: Request) {
  try {
    await requireAuthenticatedUser()
    sameOrigin(request)
    const item = parseAnnualDocument(await input(request))
    if (!await getAnnualBoy(item.year, item.boyId)) throw new AnnualDocumentInputError('Il ragazzo non è presente nell’anno scout selezionato')
    const db = createAdminClient()
    const { data: existing, error: lookupError } = await db.from('documenti_annuali').select('dati').eq('anno_scout', item.year).eq('kind', item.kind).eq('id', item.id).maybeSingle()
    if (lookupError) throw lookupError
    if (existing?.dati && typeof existing.dati === 'object' && !Array.isArray(existing.dati) && existing.dati.ragazzo_id !== item.boyId) throw new AnnualDocumentInputError('Documento già associato a un altro ragazzo')
    const { error } = await db.from('documenti_annuali').upsert({ anno_scout: item.year, kind: item.kind, id: item.id, dati: item.data, file_url: item.fileUrl, updated_at: new Date().toISOString() }, { onConflict: 'anno_scout,kind,id' })
    if (error) throw error
    return reply({ ok: true, year: item.year, id: item.id })
  } catch (error) { return failure(error) }
}

export async function DELETE(request: Request) {
  try {
    await requireAuthenticatedUser()
    sameOrigin(request)
    const body = await input(request)
    const year = documentYear(body?.year, true)
    const kind = documentKind(body?.kind)
    const id = documentId(body?.id)
    const { error } = await createAdminClient().from('documenti_annuali').delete().eq('anno_scout', year).eq('kind', kind).eq('id', id)
    if (error) throw error
    return reply({ ok: true, year, id })
  } catch (error) { return failure(error) }
}
