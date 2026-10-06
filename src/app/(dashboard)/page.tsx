import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowRight, CalendarDays, CheckCircle2, FileText, LayoutDashboard, Receipt, Settings, Users, Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { freshUser, listRequests } from '@/lib/reimbursements/server'
import { canValidateReimbursement } from '@/lib/reimbursements/model'
import { canManageSystem, getStaffRole, ROLE_LABELS } from '@/lib/security/roles'
import { getWorkingYear } from '@/lib/workingYear'
import { listStaffShares } from '@/lib/staffAdvances/server'

export const dynamic = 'force-dynamic'

const money = (cents: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(cents / 100)
const shortcuts = [
  { href: '/anagrafica', title: 'Anagrafica', description: 'Ragazzi, contatti e documenti', icon: Users },
  { href: '/salda-ora', title: 'Registra un pagamento', description: 'Quote, uscite e campi', icon: CheckCircle2 },
  { href: '/uscite', title: 'Presenze e uscite', description: 'Eventi, partecipanti e quote', icon: CalendarDays },
  { href: '/cassa', title: 'Cassa e spese', description: 'Movimenti, saldi e scontrini', icon: Wallet },
  { href: '/reminder', title: 'Reminder', description: 'Solleciti ai genitori e al gruppo', icon: CalendarDays },
  { href: '/ricevute', title: 'Ricevute pagamenti', description: 'Versamenti e ricevute archiviate', icon: Receipt },
  { href: '/report', title: 'Report completi', description: 'Bilanci ed esportazioni', icon: FileText },
]

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user: sessionUser } } = await supabase.auth.getUser()
  if (!sessionUser) redirect('/login')
  const user = await freshUser(sessionUser)
  const role = getStaffRole(user, process.env.ADMIN_EMAILS || '')
  if (!role) redirect('/login')
  const manager = canValidateReimbursement(user, process.env.ADMIN_EMAILS || '')
  const [setting, requestsResult, sharesResult] = await Promise.all([
    supabase.from('impostazioni').select('valore').eq('chiave', 'anno_scout_corrente').maybeSingle(),
    listRequests(user).then(rows => ({ rows, available: true })).catch(() => ({ rows: [], available: false })),
    listStaffShares(user).then(rows => ({ rows, available: true })).catch(() => ({ rows: [], available: false })),
  ])
  const year = await getWorkingYear(setting.data?.valore)
  const pending = requestsResult.rows.filter(row => row.stato === 'DA_RIMBORSARE')
  const paid = requestsResult.rows.filter(row => row.stato === 'RIMBORSATO')
  const amountDue = pending.reduce((total, row) => total + Math.round(row.importo * 100), 0)
  const amountPaid = paid.reduce((total, row) => total + Math.round(row.importo * 100), 0)
  const amountToReturn = sharesResult.rows.reduce((total, row) => total + Math.round(row.residuo * 100), 0)
  const sharesDue = sharesResult.rows.filter(row => row.residuo > 0).length
  const name = typeof user.user_metadata?.name === 'string' && user.user_metadata.name.trim()
    ? user.user_metadata.name.trim() : user.email?.split('@')[0] || 'Capo'

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 pb-4">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Anno scout {year.replace('-', '/')}</p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Ciao {name}</h1>
        <p className="text-sm text-slate-600">{ROLE_LABELS[role]}{manager ? ' · Gestione rimborsi' : ''}</p>
      </header>

      <section aria-labelledby="expenses-heading" className="space-y-3">
        <h2 id="expenses-heading" className="text-lg font-semibold text-slate-900">{manager ? 'Rimborsi da gestire' : 'Le tue spese anticipate'}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link href="/cassa/rimborsi" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 transition-colors hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-amber-950">{manager ? 'Da restituire agli utenti' : 'Da rimborsare'}</span>
              <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-amber-700" />
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums text-amber-950">{requestsResult.available ? money(amountDue) : 'Non disponibile'}</p>
            <p className="mt-1 text-xs text-amber-900">{requestsResult.available ? `${pending.length} richieste in attesa · tutti gli anni` : 'Apri i rimborsi per riprovare la lettura'}</p>
          </Link>
          <Link href="/cassa/rimborsi?stato=RIMBORSATO" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 transition-colors hover:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-emerald-950">Già rimborsato</span>
              <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-700" />
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums text-emerald-950">{requestsResult.available ? money(amountPaid) : 'Non disponibile'}</p>
            <p className="mt-1 text-xs text-emerald-900">{requestsResult.available ? `${paid.length} richieste rimborsate · tutti gli anni` : 'Apri i rimborsi per riprovare la lettura'}</p>
          </Link>
        </div>
        <p className="text-xs text-slate-500">{manager ? 'Vedi tutte le richieste e puoi confermare i rimborsi.' : 'Vedi solo le richieste inserite da te o intestate a te.'} Gli anticipi in attesa non entrano nelle spese del reparto.</p>
        <Link href="/cassa/anticipi-capi" className="flex min-h-20 items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700">
          <div>
            <p className="text-sm font-semibold text-slate-900">{manager ? 'Spese dei capi da recuperare' : 'Le tue quote da rendere alla cassa'}</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{sharesResult.available ? money(amountToReturn) : 'Non disponibile'}</p>
            <p className="mt-1 text-xs text-slate-500">{sharesResult.available ? `${sharesDue} quote ancora da restituire · tutti gli anni` : 'Apri le quote dei capi per riprovare la lettura'}</p>
            <p className="mt-1 text-xs text-slate-500">Spese personali pagate dalla cassa, separate dai rimborsi dovuti agli utenti.</p>
          </div>
          <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-500" />
        </Link>
      </section>

      <section aria-labelledby="shortcuts-heading" className="space-y-3">
        <h2 id="shortcuts-heading" className="flex items-center gap-2 text-lg font-semibold text-slate-900"><LayoutDashboard aria-hidden="true" className="h-4 w-4" />Accesso rapido</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {shortcuts.map(({ href, title, description, icon: Icon }) => (
            <Link key={href} href={href} className="flex min-h-20 items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700">
              <Icon aria-hidden="true" className="h-5 w-5 shrink-0 text-slate-600" />
              <div className="min-w-0"><p className="text-sm font-semibold text-slate-900">{title}</p><p className="mt-0.5 text-xs text-slate-500">{description}</p></div>
            </Link>
          ))}
          {canManageSystem(role) && (
            <Link href="/impostazioni" className="flex min-h-20 items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-700">
              <Settings aria-hidden="true" className="h-5 w-5 shrink-0 text-slate-600" />
              <div><p className="text-sm font-semibold text-slate-900">Impostazioni</p><p className="mt-0.5 text-xs text-slate-500">Utenti e configurazione del reparto</p></div>
            </Link>
          )}
        </div>
      </section>
    </div>
  )
}
