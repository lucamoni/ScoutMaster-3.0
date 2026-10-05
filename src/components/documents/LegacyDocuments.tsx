import type { ArchivedAnnualDocument, CustomAnnualDocument } from '@/lib/annualDocumentsModel'
import { documentFileUrl } from '@/lib/annualDocumentsModel'

export function LegacyDocuments({ files, customDocs = [], year }: { files: ArchivedAnnualDocument[]; customDocs?: CustomAnnualDocument[]; year: string }) {
  if (!files.length && !customDocs.length) return null
  return <details className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
    <summary className="cursor-pointer font-semibold">Documenti precedenti senza anno ({files.length + customDocs.length})</summary>
    <p className="my-2 text-xs text-slate-600">L’anno non era indicato. Questi documenti restano consultabili e non vengono conteggiati tra quelli del {year.replace('-', '/')}.</p>
    <ul className="max-h-72 space-y-2 overflow-y-auto">
      {files.map(file => <li key={`file:${file.id}`} className="rounded-lg bg-white p-2">
        <p className="break-words font-medium">{file.titolo_documento || file.file_name}</p>
        <p className="break-words text-xs text-slate-500">{file.ragazzo_nome} · {file.file_name}</p>
        <div className="mt-2 flex gap-3 text-xs"><a className="underline" href={documentFileUrl('legacy', file.id)} target="_blank" rel="noreferrer">Apri file</a><a className="underline" href={documentFileUrl('legacy', file.id, true)}>Scarica</a></div>
      </li>)}
      {customDocs.map(doc => <li key={`custom:${doc.doc_id}`} className="rounded-lg bg-white p-2"><p className="break-words font-medium">{doc.titolo}</p><p className="text-xs text-slate-500">Stato precedente: {doc.consegnato ? 'consegnato' : 'da consegnare'}</p></li>)}
    </ul>
  </details>
}
