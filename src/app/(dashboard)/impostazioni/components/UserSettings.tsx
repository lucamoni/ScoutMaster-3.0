'use client'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ROLE_LABELS, STAFF_ROLES, type StaffRole } from '@/lib/security/roles'
import type { ManagedUser } from '@/lib/security/userManagement'
import { toast } from 'sonner'

const blank = { id: '', name: '', email: '', role: 'aiuto_capo_unita' as StaffRole, password: '', confirmation: '' }
export default function UserSettings() {
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [page, setPage] = useState(1)
  const [nextPage, setNextPage] = useState<number | null>(null)
  const [currentUserId, setCurrentUserId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(blank)
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const response = await fetch(`/api/admin/users?page=${page}`, { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setUsers(data.users); setNextPage(data.nextPage || null); setCurrentUserId(data.currentUserId)
    } catch (err) { setError(err instanceof Error ? err.message : 'Impossibile leggere gli utenti') }
    finally { setLoading(false) }
  }, [page])
  useEffect(() => { void load() }, [load])
  const selected = users.find(user => user.id === form.id)
  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (saving) return
    if (form.password !== form.confirmation) { toast.error('Le password non coincidono'); return }
    setSaving(true)
    try {
      const response = await fetch('/api/admin/users', { method: form.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: form.id, name: form.name, email: form.email, role: form.role, password: form.password }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
      setForm(blank); setOpen(false); toast.success(form.id ? 'Utente aggiornato' : 'Utente creato: può accedere con email e password'); await load()
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Salvataggio non riuscito') }
    finally { setSaving(false) }
  }
  return <section className="rounded-xl border bg-white p-4 space-y-4" aria-labelledby="users-heading">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 id="users-heading" className="text-lg font-semibold">Gestione utenti</h2><Button onClick={() => { setForm(blank); setOpen(true) }}>Nuovo utente</Button></div>
    <p className="text-sm text-muted-foreground">ADMIN e CAPO UNITÀ hanno accesso completo. AIUTO CAPO UNITÀ e TESORIERE DI UNITÀ operano senza modificare le impostazioni di sistema. Il tesoriere può gestire la firma delle ricevute.</p>
    {loading ? <p role="status">Caricamento utenti…</p> : error ? <div role="alert"><p>{error}</p><Button variant="outline" onClick={load}>Riprova</Button></div> : <div className="divide-y">{users.map(user => <div key={user.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="font-medium break-words">{user.name || user.email}{user.id === currentUserId ? ' (tu)' : ''}</p><p className="text-sm text-muted-foreground break-all">{user.email}</p><p className="text-xs mt-1">{user.role ? ROLE_LABELS[user.role] : 'Ruolo non assegnato'} · {user.enabled ? 'Attivo' : 'Disattivato'}</p></div><Button variant="outline" size="sm" aria-label={`Modifica ${user.email}`} onClick={() => { setForm({ ...blank, ...user, role: user.role || 'aiuto_capo_unita' }); setOpen(true) }}>Modifica</Button></div>)}</div>}
    {(page > 1 || nextPage) && <div className="flex items-center gap-3"><Button variant="outline" disabled={loading || page === 1} onClick={() => setPage(p => p - 1)}>Precedenti</Button><span>Pagina {page}</span><Button variant="outline" disabled={loading || !nextPage} onClick={() => setPage(nextPage!)}>Successivi</Button></div>}
    <Dialog open={open} onOpenChange={value => { if (!saving) { setOpen(value); if (!value) setForm(blank) } }}><DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>{form.id ? 'Modifica utente' : 'Nuovo utente'}</DialogTitle><DialogDescription>{form.id ? 'Modifica i dati, il ruolo o la password dell’account.' : 'Crea un account con email e password per accedere a ScoutMaster.'}</DialogDescription></DialogHeader>
      <form onSubmit={save} className="space-y-4"><fieldset disabled={saving} className="space-y-4">
        <div className="space-y-1"><Label htmlFor="user-name">Nome</Label><Input id="user-name" autoComplete="off" required maxLength={100} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
        <div className="space-y-1"><Label htmlFor="user-email">Email di accesso</Label><Input id="user-email" type="email" autoComplete="off" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
        <div className="space-y-1"><Label htmlFor="user-role">Ruolo</Label><select id="user-role" className="h-10 w-full rounded-md border bg-white px-3 text-sm" disabled={selected?.protectedAdmin} value={form.role} onChange={e => setForm({ ...form, role: e.target.value as StaffRole })}>{STAFF_ROLES.map(role => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select></div>
        <div className="space-y-1"><Label htmlFor="user-password">{form.id ? 'Nuova password (facoltativa)' : 'Password'}</Label><Input id="user-password" type="password" autoComplete="new-password" required={!form.id} minLength={10} maxLength={128} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /><p className="text-xs text-muted-foreground">Minimo 10 caratteri.{form.id ? ' Lascia vuoto per conservare quella attuale.' : ''}</p></div>
        <div className="space-y-1"><Label htmlFor="user-confirmation">Conferma password</Label><Input id="user-confirmation" type="password" autoComplete="new-password" required={!form.id || Boolean(form.password)} value={form.confirmation} onChange={e => setForm({ ...form, confirmation: e.target.value })} /></div>
        <Button type="submit" className="w-full">{saving ? 'Salvataggio…' : form.id ? 'Salva modifiche' : 'Crea utente'}</Button>
      </fieldset></form>
    </DialogContent></Dialog>
  </section>
}
