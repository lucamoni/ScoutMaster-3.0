'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ReceiptFilePicker } from '@/components/receipts/ReceiptFilePicker'
import { imageForRecognition } from '@/lib/ocr/receipt'
import { todayInItaly, validDate, type StaffOption } from '@/lib/reimbursements/model'
import { cents, parseStaffExpense, splitEqually, type StaffShare } from '@/lib/staffAdvances/model'

const money = (amount: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(amount)
const dateLabel = (value: string) => value.split('-').reverse().join('/')
const selectClass = 'h-11 w-full rounded-lg border bg-white px-3 text-base'
type ExpenseForm = { id: string; date: string; amount: string; description: string; method: string; shares: { id: string; quota: string }[]; confirmed: boolean }
type ReturnForm = { id: string; share: StaffShare; amount: string; date: string; method: string; confirmed: boolean }

export default function StaffAdvancesClient({ year, canManage, users, initialShares, initialError }: {
  year: string; canManage: boolean; users: StaffOption[]; initialShares: StaffShare[]; initialError: string
}) {
  const router = useRouter()
  const busyRef = useRef(false)
  const [busy, setBusy] = useState(false)
  const [rows, setRows] = useState(initialShares)
  const [error, setError] = useState(initialError)
  const [status, setStatus] = useState('ALL')
  const [yearFilter, setYearFilter] = useState('ALL')
  const [form, setForm] = useState<ExpenseForm | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [returnForm, setReturnForm] = useState<ReturnForm | null>(null)
  const years = [...new Set([year, ...rows.map(row => row.expense.anno_scout)])].sort().reverse()
  const visible = rows.filter(row => (yearFilter === 'ALL' || row.expense.anno_scout === yearFilter) && (status === 'ALL' || (status === 'DUE' ? row.residuo > 0 : row.residuo === 0)))
  const due = rows.reduce((sum, row) => sum + Math.round(row.residuo * 100), 0) / 100
  const returned = rows.reduce((sum, row) => sum + Math.round(row.restituito * 100), 0) / 100
  const lastDate = todayInItaly() < `${year.slice(5)}-09-30` ? todayInItaly() : `${year.slice(5)}-09-30`

  const refresh = async () => {
    const response = await fetch('/api/anticipi-capi', { cache: 'no-store' })
    if (response.redirected) throw Error('Accedi nuovamente per vedere le quote.')
    const result = await response.json()
    if (!response.ok) throw Error(result.error || 'Impossibile aggiornare le quote')
    setRows(result.shares)
    setError('')
    router.refresh()
  }
  const run = async (callback: () => Promise<void>) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try { await callback() } catch (cause) { toast.error(cause instanceof Error ? cause.message : 'Operazione non riuscita') }
    finally { busyRef.current = false; setBusy(false) }
  }
  const saved = async (message: string) => {
    toast.success(message)
    try { await refresh() } catch { toast.warning('Operazione salvata. Aggiorna la pagina per vedere i dati aggiornati.') }
  }
  const openExpense = () => {
    setFile(null)
    setForm({ id: crypto.randomUUID(), date: lastDate, amount: '', description: '', method: 'Contanti', shares: [], confirmed: false })
  }
  const divide = () => {
    if (!form) return
    try { setForm({ ...form, shares: splitEqually(cents(form.amount), form.shares.map(row => row.id)).map(row => ({ ...row, quota: row.quota.toFixed(2) })) }) }
    catch (cause) { toast.error(cause instanceof Error ? cause.message : 'Controlla importo e capi selezionati') }
  }
  const submitExpense = (event: React.FormEvent) => {
    event.preventDefault()
    if (!form) return
    void run(async () => {
      if (!form.confirmed) throw Error('Conferma che la cassa ha già pagato questa spesa.')
      const payload = { ...form, year, shares: form.shares.map(row => ({ id: row.id, quota: row.quota })) }
      parseStaffExpense(payload)
      const body = new FormData()
      body.set('payload', JSON.stringify(payload))
      if (file) {
        let upload = file
        if (file.type.startsWith('image/')) {
          const blob = await imageForRecognition(file, 2200)
          if (blob !== file) upload = new File([blob], blob.type === 'image/jpeg' ? `${file.name.replace(/\.[^.]+$/, '')}.jpg` : file.name, { type: blob.type })
        }
        if (upload.size > 3145728) throw Error('Il file supera 3 MB. Riduci il documento prima di caricarlo.')
        body.set('file', upload)
      }
      const response = await fetch('/api/anticipi-capi', { method: 'POST', body })
      if (response.redirected) throw Error('Accedi nuovamente prima di salvare la spesa.')
      const result = await response.json()
      if (!response.ok) throw Error(result.error || 'Spesa non salvata')
      setForm(null)
      setFile(null)
      await saved('Spesa registrata e quote da restituire assegnate ai capi.')
    })
  }
  const submitReturn = (event: React.FormEvent) => {
    event.preventDefault()
    if (!returnForm) return
    void run(async () => {
      if (!returnForm.confirmed) throw Error('Conferma che il denaro è già stato restituito alla cassa.')
      const amount = cents(returnForm.amount)
      if (amount > Math.round(returnForm.share.residuo * 100)) throw Error('La restituzione supera la quota ancora dovuta.')
      const date = validDate(returnForm.date)
      if (date < returnForm.share.expense.data_spesa || date > todayInItaly()) throw Error('La data della restituzione non è valida.')
      const response = await fetch(`/api/anticipi-capi/${returnForm.share.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: returnForm.id, amount: returnForm.amount, date, method: returnForm.method, confirmed: true }),
      })
      if (response.redirected) throw Error('Accedi nuovamente prima di registrare la restituzione.')
      const result = await response.json()
      if (!response.ok) throw Error(result.error || 'Restituzione non salvata')
      setReturnForm(null)
      await saved('Restituzione registrata. Quota residua aggiornata.')
    })
  }

  return <div className="mx-auto max-w-6xl space-y-4 p-3 md:p-6">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><Link href="/cassa" className="text-sm underline">← Cassa e spese</Link><h1 className="mt-2 text-xl font-bold md:text-2xl">{canManage ? 'Spese dei capi da recuperare' : 'Le tue quote da rendere alla cassa'}</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">La cassa ha pagato spese personali dei capi. Spese e restituzioni sono tracciate separatamente e non entrano nelle entrate e uscite del reparto.</p></div>
      {canManage && <Button onClick={openExpense} disabled={busy}>Nuova spesa da dividere</Button>}
    </header>
    {error ? <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm"><p>{error}</p><Button className="mt-3" variant="outline" disabled={busy} onClick={() => void run(refresh)}>Riprova</Button></div> : <section aria-label="Riepilogo quote capi" className="grid grid-cols-2 gap-3"><div className="rounded-xl border bg-amber-50 p-3"><h2 className="text-sm font-medium">{canManage ? 'Da recuperare' : 'Da restituire'}</h2><p className="mt-1 text-xl font-bold tabular-nums">{money(due)}</p></div><div className="rounded-xl border bg-emerald-50 p-3"><h2 className="text-sm font-medium">Già restituito</h2><p className="mt-1 text-xl font-bold tabular-nums">{money(returned)}</p></div></section>}
    <p className="text-xs text-muted-foreground">Tutti gli anni · {canManage ? 'Vedi tutte le quote e puoi registrare le restituzioni effettivamente ricevute.' : 'Vedi solo le quote intestate a te. Admin e tesoriere registrano le restituzioni.'} Queste somme non compensano i rimborsi dovuti agli utenti.</p>
    <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="staff-share-status">Stato quota</Label><select id="staff-share-status" className={selectClass} value={status} onChange={event => setStatus(event.target.value)}><option value="ALL">Tutte</option><option value="DUE">Da restituire</option><option value="PAID">Restituite</option></select></div><div><Label htmlFor="staff-share-year">Anno della spesa</Label><select id="staff-share-year" className={selectClass} value={yearFilter} onChange={event => setYearFilter(event.target.value)}><option value="ALL">Tutti gli anni</option>{years.map(value => <option key={value}>{value}</option>)}</select></div></div>
    <div className="space-y-3">{visible.map(row => <article key={row.id} className="space-y-3 rounded-xl border bg-white p-4"><div className="flex justify-between gap-3"><div className="min-w-0"><h2 className="break-words font-semibold">{row.expense.descrizione}</h2><p className="mt-1 text-xs text-muted-foreground">{dateLabel(row.expense.data_spesa)} · {row.expense.anno_scout} · Cassa ha pagato con {row.expense.metodo}</p><p className="mt-1 text-sm">Quota di {row.staff_name}</p></div><strong className="shrink-0 text-right tabular-nums">{money(row.residuo)}<span className="block text-xs font-normal text-muted-foreground">{row.residuo > 0 ? 'da restituire' : 'saldato'}</span></strong></div><p className="text-sm">Quota {money(row.quota)} · Già restituito {money(row.restituito)}</p><p className="text-xs text-muted-foreground">Spesa inserita da {row.expense.created_by_name}</p>{row.returns.length > 0 && <details className="rounded-lg bg-slate-50 p-3"><summary className="cursor-pointer text-sm font-medium">Storico restituzioni ({row.returns.length})</summary><ul className="mt-2 space-y-2">{row.returns.map(payment => <li key={payment.id} className="text-sm"><strong>{money(payment.importo)}</strong> · {dateLabel(payment.data)} · {payment.metodo}<span className="block text-xs text-muted-foreground">Registrata da {payment.validated_by_name}</span></li>)}</ul></details>}<div className="flex flex-wrap gap-2">{row.expense.file_name && <a href={`/api/anticipi-capi/${row.expense.id}/file`} className="rounded-lg border px-3 py-2 text-sm">Scarica scontrino / file</a>}{canManage && row.residuo > 0 && <Button size="sm" disabled={busy} onClick={() => setReturnForm({ id: crypto.randomUUID(), share: row, amount: row.residuo.toFixed(2), date: todayInItaly(), method: 'Contanti', confirmed: false })}>Registra restituzione</Button>}</div></article>)}{!error && !visible.length && <p className="py-6 text-center text-sm text-muted-foreground">Nessuna quota per questi filtri.</p>}</div>
    <Dialog open={!!form} onOpenChange={open => { if (!open && !busy) setForm(null) }}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Spesa dei capi pagata dalla cassa</DialogTitle><DialogDescription>Anno {year}. Assegna le quote da restituire. Questa spesa resta separata dal bilancio del reparto.</DialogDescription></DialogHeader>{form && <form onSubmit={submitExpense}><fieldset className="space-y-4" disabled={busy}>
      <div><Label htmlFor="staff-expense-description">Descrizione</Label><Input id="staff-expense-description" className="text-base" required maxLength={2000} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></div>
      <div className="grid grid-cols-2 gap-3"><div><Label htmlFor="staff-expense-date">Data spesa</Label><Input id="staff-expense-date" className="text-base" type="date" required min={`${year.slice(0, 4)}-10-01`} max={lastDate} value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} /></div><div><Label htmlFor="staff-expense-amount">Totale (€)</Label><Input id="staff-expense-amount" className="text-base" type="number" inputMode="decimal" min="0.01" max="1000000" step="0.01" required value={form.amount} onChange={event => setForm({ ...form, amount: event.target.value })} /></div></div>
      <div><Label htmlFor="staff-expense-method">La cassa ha pagato con</Label><select id="staff-expense-method" className={selectClass} value={form.method} onChange={event => setForm({ ...form, method: event.target.value })}><option>Contanti</option><option>Carta</option><option>Bonifico</option></select></div>
      <section aria-labelledby="split-heading" className="space-y-2 rounded-lg border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 id="split-heading" className="text-sm font-semibold">Capi e quote da restituire</h3><Button type="button" size="sm" variant="outline" onClick={divide}>Dividi in parti uguali</Button></div><p className="text-xs text-muted-foreground">Seleziona i capi, poi dividi il totale o inserisci quote personalizzate.</p>{users.map(user => { const share = form.shares.find(item => item.id === user.id); return <div key={user.id} className="flex items-center gap-3 py-1"><label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 shrink-0" checked={!!share} onChange={event => setForm({ ...form, shares: event.target.checked ? [...form.shares, { id: user.id, quota: '' }] : form.shares.filter(item => item.id !== user.id) })} /><span className="break-words">{user.name}</span></label>{share && <div className="w-28 shrink-0"><Label className="sr-only" htmlFor={`staff-quota-${user.id}`}>Quota di {user.name} (€)</Label><Input id={`staff-quota-${user.id}`} className="text-base" type="number" inputMode="decimal" min="0.01" max="1000000" step="0.01" required value={share.quota} onChange={event => setForm({ ...form, shares: form.shares.map(item => item.id === user.id ? { ...item, quota: event.target.value } : item) })} /></div>}</div> })}<p className="text-xs text-muted-foreground">Le quote devono sommare esattamente il totale. Eventuali centesimi vengono ripartiti automaticamente nelle parti uguali.</p></section>
      <ReceiptFilePicker file={file} onChange={setFile} disabled={busy} description="Foto fino a 20 MB, ridotte prima dell’invio. PDF e altri documenti: massimo 3 MB." />
      <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm"><input className="mt-0.5 h-4 w-4 shrink-0" type="checkbox" required checked={form.confirmed} onChange={event => setForm({ ...form, confirmed: event.target.checked })} /><span>Confermo che la cassa del reparto ha già pagato questa spesa e che le quote indicate devono essere restituite.</span></label>
      <Button className="w-full" type="submit">{busy ? 'Salvataggio…' : 'Registra spesa e quote da restituire'}</Button>
    </fieldset></form>}</DialogContent></Dialog>
    <Dialog open={!!returnForm} onOpenChange={open => { if (!open && !busy) setReturnForm(null) }}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Registra restituzione alla cassa</DialogTitle><DialogDescription>{returnForm?.share.staff_name} · Da restituire {money(returnForm?.share.residuo || 0)}. Puoi registrare anche una restituzione parziale.</DialogDescription></DialogHeader>{returnForm && <form onSubmit={submitReturn}><fieldset className="space-y-3" disabled={busy}>
      <div><Label htmlFor="staff-return-amount">Importo ricevuto (€)</Label><Input id="staff-return-amount" className="text-base" type="number" inputMode="decimal" min="0.01" max={returnForm.share.residuo.toFixed(2)} step="0.01" required value={returnForm.amount} onChange={event => setReturnForm({ ...returnForm, amount: event.target.value })} /></div>
      <div><Label htmlFor="staff-return-date">Data effettiva della restituzione</Label><Input id="staff-return-date" className="text-base" type="date" required min={returnForm.share.expense.data_spesa} max={todayInItaly()} value={returnForm.date} onChange={event => setReturnForm({ ...returnForm, date: event.target.value })} /></div>
      <div><Label htmlFor="staff-return-method">Metodo della restituzione</Label><select id="staff-return-method" className={selectClass} value={returnForm.method} onChange={event => setReturnForm({ ...returnForm, method: event.target.value })}><option>Contanti</option><option>Carta</option><option>Bonifico</option></select></div>
      <label className="flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-sm"><input className="mt-0.5 h-4 w-4 shrink-0" type="checkbox" required checked={returnForm.confirmed} onChange={event => setReturnForm({ ...returnForm, confirmed: event.target.checked })} /><span>Confermo che questo importo è stato effettivamente restituito alla cassa del reparto.</span></label>
      <Button className="w-full" type="submit">{busy ? 'Salvataggio…' : 'Conferma denaro ricevuto'}</Button>
    </fieldset></form>}</DialogContent></Dialog>
  </div>
}
