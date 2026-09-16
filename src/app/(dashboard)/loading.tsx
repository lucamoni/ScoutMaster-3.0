export default function DashboardLoading() {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-5xl items-center justify-center px-4 py-12" aria-busy="true" aria-live="polite">
      <div className="flex items-center gap-3 text-sm text-slate-600">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-agesci-blue" aria-hidden="true" />
        Caricamento…
      </div>
    </main>
  )
}
