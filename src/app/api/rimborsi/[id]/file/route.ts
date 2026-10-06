import {requireAuthenticatedUser} from '@/lib/security/auth'
import {createAdminClient} from '@/lib/supabase/admin'
import {failure} from '@/lib/issuedReceipts/server'
import {freshUser,authorizedRequest} from '@/lib/reimbursements/server'
import {validId} from '@/lib/reimbursements/model'
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){try{
 const user=await freshUser(await requireAuthenticatedUser()),row=await authorizedRequest(validId((await params).id),user,true);if(!row.file_path||!row.file_name)throw Error('Allegato assente')
 const {data,error}=await createAdminClient().storage.from('rimborsi').download(row.file_path);if(error||!data)throw Error('Allegato non disponibile')
 return new Response(data,{headers:{'Content-Type':data.type||'application/octet-stream','Content-Disposition':`attachment; filename="${row.file_name.replace(/[^a-zA-Z0-9._-]/g,'_')}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}})
}catch(e){return failure(e)}}
