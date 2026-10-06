import { requireAuthenticatedUser } from '@/lib/security/auth'
import { freshUser, staffOptions } from '@/lib/reimbursements/server'
import { canValidateReimbursement } from '@/lib/reimbursements/model'
import { listStaffShares } from '@/lib/staffAdvances/server'
import { getWorkingYear } from '@/lib/workingYear'
import StaffAdvancesClient from './StaffAdvancesClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Spese dei capi da recuperare | ScoutMaster 3.0' }

export default async function Page() {
  const user = await freshUser(await requireAuthenticatedUser())
  const canManage = canValidateReimbursement(user, process.env.ADMIN_EMAILS || '')
  const [year, users, result] = await Promise.all([
    getWorkingYear(),
    canManage ? staffOptions() : Promise.resolve([]),
    listStaffShares(user).then(shares => ({ shares, error: '' })).catch(() => ({ shares: [], error: 'Impossibile leggere le quote da restituire. Riprova aggiornando la pagina.' })),
  ])
  return <StaffAdvancesClient key={year} year={year} canManage={canManage} users={users} initialShares={result.shares} initialError={result.error} />
}
