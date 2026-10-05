import { expect, it } from 'vitest'
import { canManageSystem, getStaffRole, roleAllowed } from './roles'
import { parseUserInput } from './userManagement'
it('admin e capo hanno accesso completo, aiuto soltanto operativo', () => {
  for (const role of ['admin', 'capo_unita'] as const) { expect(canManageSystem(role)).toBe(true); expect(roleAllowed(role, ['admin'])).toBe(true) }
  expect(canManageSystem('aiuto_capo_unita')).toBe(false)
  expect(roleAllowed('aiuto_capo_unita', ['admin'])).toBe(false)
  expect(roleAllowed('aiuto_capo_unita', ['admin', 'capo'])).toBe(true)
})
it('non accetta ruoli modificabili dall’utente e blocca utenti disattivati', () => {
  expect(getStaffRole({ app_metadata: {}, ...{ user_metadata: { role: 'admin' } } })).toBeNull()
  expect(getStaffRole({ app_metadata: { role: 'admin', disabled: true } })).toBeNull()
  expect(getStaffRole({ email: 'admin@test.it', app_metadata: { role: 'aiuto_capo_unita' } }, 'admin@test.it')).toBe('aiuto_capo_unita')
})
it('valida email, ruolo, password e aggiornamenti senza cambiare password', () => {
  const input = { name: 'Test', email: 'test@example.invalid', role: 'aiuto_capo_unita', enabled: true, password: 'test-password-123' }
  expect(parseUserInput(input, true).role).toBe('aiuto_capo_unita')
  expect(() => parseUserInput({ ...input, role: 'superadmin' }, true)).toThrow('Ruolo')
  expect(() => parseUserInput({ ...input, password: 'short' }, true)).toThrow('password')
  expect(parseUserInput({ ...input, id: '00000000-0000-4000-8000-000000000001', password: '' }, false).password).toBe('')
})
