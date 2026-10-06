import {requireAuthenticatedUser} from '@/lib/security/auth'
import {createAdminClient} from '@/lib/supabase/admin'
import {failure} from '@/lib/issuedReceipts/server'
import {freshUser} from '@/lib/reimbursements/server'
import {validId} from '@/lib/reimbursements/model'
import {staffExpenseFile} from '@/lib/staffAdvances/server'
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){try{
 const user=await freshUser(await requireAuthenticatedUser()),row=await staffExpenseFile(validId((await params).id),user)
 const {data,error}=await createAdminClient().storage.from('anticipi-capi').download(row.file_path!);if(error||!data)throw Error('Allegato non disponibile')
 return new Response(data,{headers:{'Content-Type':data.type||'application/octet-stream','Content-Disposition':`attachment; filename="${row.file_name!.replace(/[^a-zA-Z0-9._-]/g,'_')}"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}})
}catch(e){return failure(e)}}
