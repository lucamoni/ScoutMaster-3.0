import { describe,it,expect,vi,beforeEach } from 'vitest'
vi.mock('server-only',()=>({}))
vi.mock('@/lib/security/auth',()=>({requireAuthenticatedUser:vi.fn(),requireRole:vi.fn(),authorizationErrorResponse:(e:Error&{status?:number})=>e.status?Response.json({error:e.message},{status:e.status}):null}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:vi.fn()}))
import {requireRole,requireAuthenticatedUser} from '@/lib/security/auth'
import {createAdminClient} from '@/lib/supabase/admin'
import {GET as template} from '@/app/api/roster/template/route'
import {GET as exportRoster,POST as importRoster} from '@/app/api/roster/route'
import {POST as saveConfig} from './config/route'
import {POST as proof} from './prove/route'
import {POST as preview} from './preview/route'
import {POST as issue} from './route'
import {GET as download} from './[id]/pdf/route'
const denied=Object.assign(Error('Autenticazione richiesta'),{status:401})
beforeEach(()=>vi.resetAllMocks())
describe('Protezione API ricevute/anagrafica',()=>{
 it.each([template,exportRoster,importRoster,saveConfig,proof,preview,issue])('non legge o modifica dati prima dell’autenticazione',async(route)=>{vi.mocked(requireRole).mockRejectedValue(denied);vi.mocked(requireAuthenticatedUser).mockRejectedValue(denied);const r=await route(new Request('https://scout.example/api',{method:'POST',body:'{}'}));expect(r.status).toBe(401);expect(createAdminClient).not.toHaveBeenCalled()})
 it('protegge il PDF privato',async()=>{vi.mocked(requireAuthenticatedUser).mockRejectedValue(denied);expect((await download(new Request('https://scout.example'),{params:Promise.resolve({id:'x'})})).status).toBe(401);expect(createAdminClient).not.toHaveBeenCalled()})
 it('importazione resta riservata ad ADMIN/CAPO',async()=>{vi.mocked(requireRole).mockRejectedValue(Object.assign(Error('Permessi insufficienti'),{status:403}));expect((await importRoster(new Request('https://scout.example/api',{method:'POST',body:'{}'}))).status).toBe(403);expect(requireRole).toHaveBeenCalledWith(['admin'])})
 it('firma include tesoriere, non aiuto',async()=>{vi.mocked(requireRole).mockRejectedValue(Object.assign(Error('Permessi insufficienti'),{status:403}));await saveConfig(new Request('https://scout.example/api',{method:'POST',body:'{}'}));expect(requireRole).toHaveBeenCalledWith(['admin','tesoriere_unita'])})
 it('rifiuta richieste provenienti da un altro sito',async()=>{vi.mocked(requireRole).mockResolvedValue({user:{id:'a'},role:'admin'} as never);const r=await importRoster(new Request('https://scout.example/api',{method:'POST',headers:{origin:'https://evil.example'},body:'{}'}));expect(r.status).toBe(400);expect(createAdminClient).not.toHaveBeenCalled()})
})
