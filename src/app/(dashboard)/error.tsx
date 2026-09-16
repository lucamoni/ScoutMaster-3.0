'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Dashboard runtime error', error)
  }, [error])

  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-xl items-center justify-center px-4 py-12">
      <section className="w-full rounded-2xl border border-red-200 bg-white p-6 text-center shadow-sm sm:p-8" role="alert">
        <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-red-600" aria-hidden="true" />
        <h1 className="text-xl font-semibold text-slate-900">Si è verificato un errore</h1>
        <p className="mt-2 text-sm text-slate-600">La pagina non ha caricato correttamente. Riprova oppure torna alla dashboard.</p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Button type="button" onClick={reset} className="gap-2">
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> Riprova
          </Button>
          <Link href="/" className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-background px-2.5 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            Torna alla dashboard
          </Link>
        </div>
      </section>
    </main>
  )
}
