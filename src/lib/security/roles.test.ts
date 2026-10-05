import { expect, it } from 'vitest'
import { canManageReceiptIssuer, canManageSystem, getStaffRole, hasTreasurerQualification, roleAllowed, STAFF_ROLES } from './roles'
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
it('tesoriere è una qualifica separata assegnabile a ciascuno dei tre ruoli', () => {
  expect(STAFF_ROLES).toEqual(['admin', 'capo_unita', 'aiuto_capo_unita'])
  for (const role of STAFF_ROLES) {
    const user = { app_metadata: { role, treasurer: true } }
    expect(getStaffRole(user)).toBe(role)
    expect(hasTreasurerQualification(user)).toBe(true)
    expect(canManageReceiptIssuer(user)).toBe(true)
    expect(canManageSystem(getStaffRole(user))).toBe(role !== 'aiuto_capo_unita')
  }
  expect(canManageReceiptIssuer({ app_metadata: { role: 'aiuto_capo_unita', treasurer: false } })).toBe(false)
})
it('mantiene gli account tesoriere precedenti senza concedere impostazioni', () => {
  const legacy = { app_metadata: { role: 'tesoriere_unita' } }
  expect(getStaffRole(legacy)).toBe('aiuto_capo_unita')
  expect(hasTreasurerQualification(legacy)).toBe(true)
  expect(canManageReceiptIssuer(legacy)).toBe(true)
  expect(canManageSystem(getStaffRole(legacy))).toBe(false)
  expect(roleAllowed(getStaffRole(legacy), ['admin'])).toBe(false)
  expect(hasTreasurerQualification({ app_metadata: { role: 'tesoriere_unita', treasurer: false } })).toBe(false)
})
it('ignora qualifica modificabile dall’utente, flag non booleani e account disattivati', () => {
  expect(hasTreasurerQualification({ app_metadata: { role: 'aiuto_capo_unita' }, ...{ user_metadata: { treasurer: true } } })).toBe(false)
  expect(hasTreasurerQualification({ app_metadata: { role: 'aiuto_capo_unita', treasurer: 'true' } })).toBe(false)
  expect(hasTreasurerQualification({ app_metadata: { role: 'aiuto_capo_unita', treasurer: true, disabled: true } })).toBe(false)
  expect(canManageReceiptIssuer({ app_metadata: { role: 'admin', treasurer: true }, banned_until: '2999-01-01' })).toBe(false)
  expect(hasTreasurerQualification({ app_metadata: { role: 'intruso', treasurer: true } })).toBe(false)
})
it('valida la qualifica senza reinterpretarla come ruolo', () => {
  const input = { name: 'Test', email: 'test@example.invalid', role: 'capo_unita', password: 'test-password-123' }
  expect(parseUserInput({ ...input, treasurer: true }, true)).toMatchObject({ role: 'capo_unita', treasurer: true })
  expect(parseUserInput(input, true).treasurer).toBe(false)
  expect(parseUserInput({ ...input, id: '00000000-0000-4000-8000-000000000001', password: '' }, false).treasurer).toBeUndefined()
  expect(() => parseUserInput({ ...input, treasurer: 'true' }, true)).toThrow('Qualifica')
  expect(() => parseUserInput({ ...input, role: 'tesoriere_unita' }, true)).toThrow('Ruolo')
})
