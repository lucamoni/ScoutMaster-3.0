import { requireRole, authorizationErrorResponse } from '@/lib/security/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { canManageSystem, getStaffRole, hasTreasurerQualification } from '@/lib/security/roles'
import { parseUserInput, UserInputError } from '@/lib/security/userManagement'
import type { User } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
const publicUser = (user: User) => {
  const assignedUser = { ...user, app_metadata: { ...user.app_metadata, disabled: false }, banned_until: undefined }
  return { id: user.id, email: user.email || '', name: typeof user.user_metadata?.name === 'string' ? user.user_metadata.name : '', role: getStaffRole(assignedUser), treasurer: hasTreasurerQualification(assignedUser), enabled: user.app_metadata?.disabled !== true && !(user.banned_until && new Date(user.banned_until).getTime() > Date.now()), protectedAdmin: user.app_metadata?.protected_admin === true }
}
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
function failure(error: unknown) {
  return authorizationErrorResponse(error) || reply({ error: error instanceof UserInputError ? error.message : 'Operazione non riuscita. Controlla i dati e riprova.' }, error instanceof UserInputError ? 400 : 500)
}
function checkOrigin(request: Request) {
  const origin = request.headers.get('origin')
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get('sec-fetch-site') === 'cross-site') throw new UserInputError('Richiesta non consentita')
}
export async function GET(request: Request) {
  try {
    const { user } = await requireRole(['admin'])
    const page = Number(new URL(request.url).searchParams.get('page') || 1)
    if (!Number.isInteger(page) || page < 1 || page > 10000) throw new UserInputError('Pagina non valida')
    const { data, error } = await createAdminClient().auth.admin.listUsers({ page, perPage: 50 })
    if (error) throw error
    return reply({ users: data.users.map(publicUser), nextPage: data.nextPage, currentUserId: user.id })
  } catch (error) { return failure(error) }
}
export async function POST(request: Request) {
  try {
    await requireRole(['admin'])
    checkOrigin(request)
    const input = parseUserInput(await request.json(), true)
    const { data, error } = await createAdminClient().auth.admin.createUser({ email: input.email, password: input.password, email_confirm: true, user_metadata: { name: input.name }, app_metadata: { role: input.role, treasurer: input.treasurer } })
    if (error) throw new UserInputError(error.code === 'email_exists' ? 'Questa email è già registrata' : 'Creazione non riuscita: verifica email e requisiti della password')
    return reply({ user: publicUser(data.user!) }, 201)
  } catch (error) { return failure(error) }
}
export async function PATCH(request: Request) {
  try {
    const { user: actor } = await requireRole(['admin'])
    checkOrigin(request)
    const input = parseUserInput(await request.json(), false)
    const admin = createAdminClient()
    const { data: existing, error: lookupError } = await admin.auth.admin.getUserById(input.id)
    if (lookupError || !existing.user) throw new UserInputError('Utente non trovato')
    if ((input.id === actor.id || existing.user.app_metadata?.protected_admin === true) && !canManageSystem(input.role)) throw new UserInputError('Non puoi togliere i permessi al tuo account o all’amministratore principale')
    const treasurer = input.treasurer ?? hasTreasurerQualification({ ...existing.user, app_metadata: { ...existing.user.app_metadata, disabled: false }, banned_until: undefined })
    const { data, error } = await admin.auth.admin.updateUserById(input.id, { email: input.email, email_confirm: true, user_metadata: { ...existing.user.user_metadata, name: input.name }, app_metadata: { ...existing.user.app_metadata, role: input.role, treasurer }, ...(input.password ? { password: input.password } : {}) })
    if (error) throw new UserInputError('Modifica non riuscita: verifica email e requisiti della password')
    return reply({ user: publicUser(data.user!) })
  } catch (error) { return failure(error) }
}
