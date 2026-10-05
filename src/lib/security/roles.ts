export const STAFF_ROLES = ['admin', 'capo_unita', 'aiuto_capo_unita', 'tesoriere_unita'] as const
export type StaffRole = typeof STAFF_ROLES[number]
export const ROLE_LABELS: Record<StaffRole, string> = { admin: 'ADMIN', capo_unita: 'CAPO UNITÀ', aiuto_capo_unita: 'AIUTO CAPO UNITÀ', tesoriere_unita: 'TESORIERE DI UNITÀ' }

type RoleUser = { email?: string; app_metadata?: Record<string, unknown>; banned_until?: string }
export function getStaffRole(user: RoleUser, adminEmails = ''): StaffRole | null {
  if (user.app_metadata?.disabled === true || (user.banned_until && new Date(user.banned_until).getTime() > Date.now())) return null
  const role = typeof user.app_metadata?.role === 'string' ? user.app_metadata.role.toLowerCase() : ''
  if (STAFF_ROLES.includes(role as StaffRole)) return role as StaffRole
  if (role === 'capo') return 'capo_unita'
  if (role === 'tesoriere') return 'aiuto_capo_unita'
  if (!role && user.email && adminEmails.split(',').some(email => email.trim().toLowerCase() === user.email!.toLowerCase())) return 'admin'
  return null
}
export const canManageSystem = (role: StaffRole | null) => role === 'admin' || role === 'capo_unita'
export function roleAllowed(role: StaffRole | null, allowed: string[]) {
  return canManageSystem(role) || (!!role && (allowed.includes(role) || allowed.includes('capo') || allowed.includes('tesoriere')))
}
