import {requireAuthenticatedUser} from '@/lib/security/auth'
import {freshUser,listRequests,staffOptions} from '@/lib/reimbursements/server'
import {canValidateReimbursement} from '@/lib/reimbursements/model'
import {getWorkingYear} from '@/lib/workingYear'
import {createClient} from '@/lib/supabase/server'
import ReimbursementsClient from './ReimbursementsClient'
export const dynamic='force-dynamic'
export const metadata={title:'Spese anticipate e rimborsi | ScoutMaster 3.0'}
export default async function Page(){const user=await freshUser(await requireAuthenticatedUser()),year=await getWorkingYear();const [requests,users,categories]=await Promise.all([listRequests(user),staffOptions(),(await createClient()).from('categorie_spesa').select('nome,tipo_movimento')]);return <ReimbursementsClient key={year} year={year} userId={user.id} canValidate={canValidateReimbursement(user,process.env.ADMIN_EMAILS||'')} initialRequests={requests} users={users} categories={(categories.data||[]).filter(c=>c.tipo_movimento==='USCITA'||!c.tipo_movimento).map(c=>c.nome)}/>}
