import { createClient } from '@/lib/supabase/server'

export class AuthorizationError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403 = 401
  ) {
    super(message)
    this.name = 'AuthorizationError'
  }
}

function getUserRole(user: { email?: string; app_metadata?: Record<string, unknown> }) {
  const configuredAdmins = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean)

  if (user.email && configuredAdmins.includes(user.email.toLowerCase())) {
    return 'admin'
  }

  const role = user.app_metadata?.role
  return typeof role === 'string' ? role.toLowerCase() : null
}

export async function requireAuthenticatedUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    throw new AuthorizationError('Autenticazione richiesta', 401)
  }

  return user
}

export async function requireRole(allowedRoles: string[]) {
  const user = await requireAuthenticatedUser()
  const role = getUserRole(user)
  const normalizedRoles = allowedRoles.map(value => value.toLowerCase())

  if (!role || (!normalizedRoles.includes(role) && role !== 'admin')) {
    throw new AuthorizationError('Permessi insufficienti', 403)
  }

  return { user, role }
}

export function authorizationErrorResponse(error: unknown) {
  if (!(error instanceof AuthorizationError)) return null

  return Response.json(
    { error: error.message },
    { status: error.status }
  )
}
