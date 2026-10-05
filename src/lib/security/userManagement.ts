import { STAFF_ROLES, type StaffRole } from './roles'
export type ManagedUser = { id: string; email: string; name: string; role: StaffRole | null; treasurer: boolean; enabled: boolean; protectedAdmin: boolean }
export class UserInputError extends Error {}
export function parseUserInput(input: unknown, creating: boolean) {
  if (!input || typeof input !== 'object') throw new UserInputError('Dati utente non validi')
  const value = input as Record<string, unknown>
  const email = typeof value.email === 'string' ? value.email.trim().toLowerCase() : ''
  const name = typeof value.name === 'string' ? value.name.trim() : ''
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new UserInputError('Inserisci un’email valida')
  if (!name || name.length > 100) throw new UserInputError('Inserisci un nome (massimo 100 caratteri)')
  if (!STAFF_ROLES.includes(value.role as StaffRole)) throw new UserInputError('Ruolo non valido')
  if (value.treasurer !== undefined && typeof value.treasurer !== 'boolean') throw new UserInputError('Qualifica tesoriere non valida')
  const password = typeof value.password === 'string' ? value.password : ''
  if ((creating || password) && (password.length < 10 || password.length > 128)) throw new UserInputError('La password deve avere da 10 a 128 caratteri')
  if (!creating && (typeof value.id !== 'string' || !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value.id))) throw new UserInputError('Identificativo utente non valido')
  return { id: value.id as string, email, name, role: value.role as StaffRole, treasurer: typeof value.treasurer === 'boolean' ? value.treasurer : creating ? false : undefined, password }
}
