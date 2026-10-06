import Link from 'next/link'
import { freshUser, listRequests, staffOptions } from '@/lib/reimbursements/server'
import { pendingByUser } from '@/lib/reimbursements/model'
import { requireAuthenticatedUser, getUserRole } from '@/lib/security/auth'
import { canManageSystem } from '@/lib/security/roles'
import { getWorkingYear } from '@/lib/workingYear'
import { workingYearSettings } from '@/lib/utils/workingYear'
import { createClient } from '@/lib/supabase/server'
import { getCurrentAnnoScout } from '@/lib/utils/payment'
import { getAccountingPeriod } from '@/lib/utils/accounting'
import CassaClient from './components/CassaClient'
import { getAnnualBoys } from '@/lib/annualRoster/server'
import { CENSUS_INCOME_SETTING } from '@/lib/utils/censusAccounting'

export const dynamic = 'force-dynamic'

export default async function CassaPage() {
  const user = await freshUser(await requireAuthenticatedUser())
  const supabase = await createClient()

  const [{ data: impostazioni }, { data: categorie }] = await Promise.all([
    supabase.from('impostazioni').select('*'),
    supabase.from('categorie_spesa').select('*').order('nome', { ascending: true }),
  ])

  const settings = new Map((impostazioni || []).map(item => [item.chiave, item.valore]))
  const { currentYear, startDate, endDate, initialCash, initialBank } = getAccountingPeriod(workingYearSettings(settings, await getWorkingYear(settings.get('anno_scout_corrente'))), getCurrentAnnoScout())

  const { data: spese, error } = await supabase
    .from('registro_spese')
    .select('*')
    .gte('data', startDate)
    .lte('data', endDate)
    .order('data', { ascending: false })

  if (error) {
    return <div>Errore nel caricamento della prima nota.</div>
  }

  const [requests, reimbursementUsers] = await Promise.all([listRequests(user), staffOptions()])
  const pending = pendingByUser(requests)
  const pendingTotal = pending.reduce((n,item)=>n+item.amount,0)
  const boys = (await getAnnualBoys(currentYear, true)).map(({id,nome,cognome})=>({id,nome,cognome}))
  return (
    <div className="p-3 md:p-6 w-full max-w-7xl mx-auto space-y-3 md:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">Cassa & Saldi</h1>
          <p className="text-xs md:text-sm text-muted-foreground">Prima nota {currentYear} · 1 ottobre – 30 settembre</p>
        </div>
      </div>
      <Link href="/cassa/rimborsi" className="block rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm"><strong>Spese anticipate da rimborsare: {new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(pendingTotal)}</strong><span className="ml-2">Apri richieste →</span><p className="mt-1 text-xs">Tutti gli anni · escluse dai saldi e dalle spese totali fino alla conferma.</p></Link>
      <CassaClient
        key={currentYear}
        userId={user.id}
        reimbursementUsers={reimbursementUsers}
        canManageSettings={canManageSystem(getUserRole(user))}
        includeCensus={settings.get(CENSUS_INCOME_SETTING) === 'true'}
        startDate={startDate}
        endDate={endDate}
        initialSpese={spese || []}
        boys={boys}
        initialCategorie={categorie || []}
        initialBalances={{ contanti: initialCash, banca: initialBank }}
      />
    </div>
  )
}
