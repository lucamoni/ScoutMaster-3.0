import { authorizationErrorResponse, requireAuthenticatedUser } from '@/lib/security/auth'
import { getAnnualBoys, resolveAnnualYear, writeAnnualBoy, type AnnualCensus } from '@/lib/annualRoster/server'

export const dynamic = 'force-dynamic'
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}})
const failure=(error:unknown)=>authorizationErrorResponse(error)||reply({error:error instanceof Error?error.message:'Operazione non riuscita'},400)

export async function GET(request: Request) {
  try {
    await requireAuthenticatedUser()
    const params = new URL(request.url).searchParams
    const year = await resolveAnnualYear(params.has('year') ? params.get('year') : undefined)
    return reply({data:await getAnnualBoys(year,params.get('includeArchived')!=='false'),year})
  } catch(error) { return failure(error) }
}

async function write(request: Request, create: boolean) {
  try {
    await requireAuthenticatedUser()
    if(request.headers.get('sec-fetch-site')==='cross-site'||(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin))return reply({error:'Richiesta non consentita'},403)
    if(Number(request.headers.get('content-length')||0)>200000)throw new Error('Dati troppo grandi')
    const input=await request.json()
    if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Dati non validi')
    if(!create&&typeof input.id!=='string')throw new Error('Ragazzo non valido')
    if(input.census!==undefined&&(!input.census||typeof input.census!=='object'||Array.isArray(input.census)||Object.keys(input.census).some(key=>!['method','date'].includes(key))))throw new Error('Dati censimento non validi')
    const year=await resolveAnnualYear(input.year)
    const data=await writeAnnualBoy(year,create?null:input.id,input.changes,input.census as AnnualCensus|undefined)
    return reply({data,year},create?201:200)
  }catch(error){return failure(error)}
}
export async function POST(request: Request) { return write(request,true) }
export async function PATCH(request: Request) { return write(request,false) }
