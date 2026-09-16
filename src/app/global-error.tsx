'use client'

import { useEffect } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Global runtime error', error)
  }, [error])

  return (
    <html lang="it">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <main className="mx-auto flex min-h-screen w-full max-w-xl items-center justify-center px-4 py-12">
          <section className="w-full rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm sm:p-8" role="alert">
            <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-red-600" aria-hidden="true" />
            <h1 className="text-xl font-semibold">ScoutMaster non è disponibile</h1>
            <p className="mt-2 text-sm text-slate-600">Si è verificato un errore inatteso. Riprova per ricaricare l’applicazione.</p>
            <button
              type="button"
              onClick={reset}
              className="mt-6 inline-flex h-9 items-center gap-2 rounded-lg bg-slate-900 px-3 text-sm font-medium text-white transition-colors hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-slate-400"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Riprova
            </button>
          </section>
        </main>
      </body>
    </html>
  )
}
