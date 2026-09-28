'use client'

import { Button } from '@/components/ui/button'

export default function ReceiptArchiveError({ reset }: { reset: () => void }) {
  return <div className="mx-auto max-w-xl space-y-4 rounded-xl border bg-white p-6" role="alert">
    <h1 className="text-xl font-semibold">Archivio temporaneamente non disponibile</h1>
    <p>Non è stato possibile caricare gli allegati. Riprova tra poco.</p>
    <Button onClick={reset}>Riprova</Button>
  </div>
}
