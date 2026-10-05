import { requireAuthenticatedUser,getUserRole } from '@/lib/security/auth'
import { getWorkingYear } from '@/lib/workingYear'
import { canManageReceiptIssuer, canManageSystem } from '@/lib/security/roles'
import ReceiptsClient from './ReceiptsClient'
export const dynamic='force-dynamic'
export default async function Page(){const user=await requireAuthenticatedUser();const role=getUserRole(user);const year=await getWorkingYear();return <ReceiptsClient key={year} year={year} canSign={canManageReceiptIssuer(user,process.env.ADMIN_EMAILS||'')} canConnect={canManageSystem(role)}/>}
