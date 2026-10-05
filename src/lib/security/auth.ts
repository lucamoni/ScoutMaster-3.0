import { createClient } from '@/lib/supabase/server'
import { canManageReceiptIssuer, getStaffRole, roleAllowed } from './roles'

export class AuthorizationError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403 = 401
  ) {
    super(message)
    this.name = 'AuthorizationError'
  }
}

export function getUserRole(user: { email?: string; app_metadata?: Record<string, unknown> }) {
  return getStaffRole(user, process.env.ADMIN_EMAILS || '')
}

export async function requireAuthenticatedUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    throw new AuthorizationError('Autenticazione richiesta', 401)
  }

  if (!getUserRole(user)) throw new AuthorizationError('Account non abilitato. Contatta l’amministratore.', 403)
  return user
}

export async function requireRole(allowedRoles: string[]) {
  const user = await requireAuthenticatedUser()
  const role = getUserRole(user)
  const normalizedRoles = allowedRoles.map(value => value.toLowerCase())

  if (!roleAllowed(role, normalizedRoles)) {
    throw new AuthorizationError('Permessi insufficienti', 403)
  }

  return { user, role }
}

export async function requireReceiptIssuer() {
  const user = await requireAuthenticatedUser()
  if (!canManageReceiptIssuer(user, process.env.ADMIN_EMAILS || '')) {
    throw new AuthorizationError('Occorre la qualifica di tesoriere per modificare nome e firma delle ricevute', 403)
  }
  return { user, role: getUserRole(user) }
}

export function authorizationErrorResponse(error: unknown) {
  if (!(error instanceof AuthorizationError)) return null

  return Response.json(
    { error: error.message },
    { status: error.status }
  )
}
