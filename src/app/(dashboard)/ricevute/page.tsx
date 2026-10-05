import { requireAuthenticatedUser,getUserRole } from '@/lib/security/auth'
import { getWorkingYear } from '@/lib/workingYear'
import { canManageSystem } from '@/lib/security/roles'
import ReceiptsClient from './ReceiptsClient'
export const dynamic='force-dynamic'
export default async function Page(){const user=await requireAuthenticatedUser();const role=getUserRole(user);return <ReceiptsClient year={await getWorkingYear()} canSign={canManageSystem(role)||role==='tesoriere_unita'} canConnect={canManageSystem(role)}/>}
