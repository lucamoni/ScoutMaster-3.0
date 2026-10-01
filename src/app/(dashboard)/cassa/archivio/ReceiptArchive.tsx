'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { receiptFileName, type ReceiptExpense } from '@/lib/receipts'
import { ReceiptDialog } from '@/components/receipts/ReceiptDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Paperclip } from 'lucide-react'

export default function ReceiptArchive({ initialExpenses, total, page, pageSize, filters }: {
  initialExpenses: ReceiptExpense[]; total: number; page: number; pageSize: number;
  filters: { q: string; from: string; to: string }
}) {
  const [expenses, setExpenses] = useState(initialExpenses)
  const [selected, setSelected] = useState<ReceiptExpense | null>(null)
  const router = useRouter()
  useEffect(() => { setExpenses(initialExpenses) }, [initialExpenses])
  useEffect(() => {
    const client = createClient()
    let timer: ReturnType<typeof setTimeout>
    const refresh = () => { clearTimeout(timer); timer = setTimeout(() => router.refresh(), 200) }
    const channel = client.channel('receipt_archive').on('postgres_changes', { event: '*', schema: 'public', table: 'registro_spese' }, refresh).subscribe()
    window.addEventListener('focus', refresh)
    return () => { clearTimeout(timer); window.removeEventListener('focus', refresh); client.removeChannel(channel) }
  }, [router])
  const pageUrl = (target: number) => `/cassa/archivio?${new URLSearchParams({ ...filters, page: String(target) })}`
  return <div className="mx-auto max-w-6xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-bold">Archivio scontrini e file</h1><p className="text-sm text-muted-foreground">Allegati dei movimenti di tutti gli anni. Apri una voce per vedere o scaricare il file.</p></div>
      <Link href="/cassa" className="rounded-md border px-3 py-2 text-sm">Torna alla Cassa</Link>
    </div>
    <form action="/cassa/archivio" method="get" className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-4" key={`${filters.q}-${filters.from}-${filters.to}`}>
      <div className="space-y-1"><Label htmlFor="receipt-search">Cerca voce spesa</Label><Input id="receipt-search" name="q" defaultValue={filters.q} placeholder="Es. materiale, cambusa…" /></div>
      <div className="space-y-1"><Label htmlFor="receipt-from">Dal</Label><Input id="receipt-from" name="from" type="date" defaultValue={filters.from} /></div>
      <div className="space-y-1"><Label htmlFor="receipt-to">Al</Label><Input id="receipt-to" name="to" type="date" defaultValue={filters.to} /></div>
      <div className="flex items-end gap-3"><Button type="submit">Filtra</Button><Link href="/cassa/archivio" className="py-2 text-sm underline">Azzera</Link></div>
    </form>
    <p className="text-sm text-muted-foreground">{total} allegati trovati</p>
    <div className="grid gap-3 sm:grid-cols-2">
      {expenses.map(expense => <div key={expense.id} className="space-y-2 rounded-xl border bg-white p-4">
        <div className="flex justify-between gap-2"><h2 className="font-semibold">{expense.voce_spesa || 'Movimento'}</h2><span className="whitespace-nowrap">€{expense.importo.toFixed(2)}</span></div>
        <p className="text-xs text-muted-foreground">{expense.data || 'Data non indicata'} · {expense.momento_anno || 'ANNO'} · {expense.tipo_movimento}</p>
        {expense.note && <p className="text-sm">{expense.note}</p>}
        <p className="break-all text-sm text-muted-foreground">{receiptFileName(expense.foto_scontrino_url!)}</p>
        <Button variant="outline" onClick={() => setSelected(expense)}><Paperclip className="mr-2 h-4 w-4" /> Apri / scarica / elimina</Button>
      </div>)}
    </div>
    {!expenses.length && <p className="rounded-lg border border-dashed p-8 text-center">Nessun allegato trovato. Puoi aggiungerlo a una voce dalla pagina Cassa.</p>}
    <nav aria-label="Pagine archivio" className="flex items-center justify-between text-sm">
      {page > 1 ? <Link href={pageUrl(page - 1)} className="underline">Precedente</Link> : <span />}
      <span>Pagina {page} di {Math.max(1, Math.ceil(total / pageSize))}</span>
      {page * pageSize < total ? <Link href={pageUrl(page + 1)} className="underline">Successiva</Link> : <span />}
    </nav>
    {selected && <ReceiptDialog key={selected.id} expense={selected} onClose={() => setSelected(null)} onSaved={saved => { setExpenses(prev => prev.map(item => item.id === saved.id ? saved : item).filter(item => item.foto_scontrino_url)); router.refresh() }} onDeleted={id => { setExpenses(prev => prev.filter(item => item.id !== id)); router.refresh() }} />}
  </div>
}
