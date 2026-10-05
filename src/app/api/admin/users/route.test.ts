import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ requireRole: vi.fn(), listUsers: vi.fn(), createUser: vi.fn(), getUserById: vi.fn(), updateUserById: vi.fn() }))
vi.mock('@/lib/security/auth', async importOriginal => { const original = await importOriginal<typeof import('@/lib/security/auth')>(); return { ...original, requireRole: mocks.requireRole } })
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ auth: { admin: mocks } }) }))
import { AuthorizationError } from '@/lib/security/auth'
import { GET, POST, PATCH } from './route'
const id = '00000000-0000-4000-8000-000000000001'
const input = { id, name: 'Test', email: 'test@example.invalid', role: 'aiuto_capo_unita', enabled: true, password: 'test-password-123' }
const request = (body = input, method = 'POST', origin = 'https://scoutmaster.test') => new Request('https://scoutmaster.test/api/admin/users', { method, headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
beforeEach(() => { vi.clearAllMocks(); mocks.requireRole.mockResolvedValue({ user: { id: 'actor' }, role: 'admin' }); mocks.createUser.mockResolvedValue({ data: { user: { id, email: input.email, app_metadata: { role: input.role } } }, error: null }) })
it('nega le operazioni all’aiuto prima di usare il servizio amministrativo', async () => {
  mocks.requireRole.mockRejectedValue(new AuthorizationError('Permessi insufficienti', 403))
  expect((await POST(request())).status).toBe(403)
  expect(mocks.createUser).not.toHaveBeenCalled()
})
it('crea utenti con ruolo protetto nei metadati applicativi e non restituisce password', async () => {
  const response = await POST(request())
  expect(response.status).toBe(201)
  expect(mocks.createUser).toHaveBeenCalledWith(expect.objectContaining({ app_metadata: { role: input.role }, email_confirm: true }))
  expect(JSON.stringify(await response.json())).not.toContain(input.password)
})
it('blocca origine esterna, ruoli inventati e password corte', async () => {
  expect((await POST(request(input, 'POST', 'https://evil.test'))).status).toBe(400)
  expect((await POST(request({ ...input, role: 'invalid' }))).status).toBe(400)
  expect((await POST(request({ ...input, password: 'short' }))).status).toBe(400)
  expect(mocks.createUser).not.toHaveBeenCalled()
})
it('protegge il proprio account e l’amministratore principale', async () => {
  mocks.getUserById.mockResolvedValue({ data: { user: { id, app_metadata: { role: 'admin', protected_admin: true } } }, error: null })
  expect((await PATCH(request({ ...input, enabled: false }, 'PATCH'))).status).toBe(400)
  expect(mocks.updateUserById).not.toHaveBeenCalled()
})
it('conserva i metadati protetti e la password quando non modificata', async () => {
  mocks.getUserById.mockResolvedValue({ data: { user: { id, user_metadata: { other: 'kept' }, app_metadata: { role: 'capo_unita', marker: 'kept' } } }, error: null })
  mocks.updateUserById.mockResolvedValue({ data: { user: { id, app_metadata: { role: input.role } } }, error: null })
  expect((await PATCH(request({ ...input, password: '' }, 'PATCH'))).status).toBe(200)
  const attributes = mocks.updateUserById.mock.calls[0][1]
  expect(attributes).not.toHaveProperty('password')
  expect(attributes.app_metadata).toMatchObject({ marker: 'kept', role: input.role })
})
it('elenca account disattivati con il ruolo assegnato e soltanto dati pubblici', async () => {
  mocks.listUsers.mockResolvedValue({ data: { users: [{ id, email: input.email, app_metadata: { role: 'capo_unita', disabled: true }, secret: 'not-returned' }], nextPage: null }, error: null })
  const response = await GET(new Request('https://scoutmaster.test/api/admin/users'))
  expect(await response.json()).toMatchObject({ users: [{ role: 'capo_unita', enabled: false }] })
})
it('impedisce a un amministratore di togliere i propri permessi', async () => {
  mocks.requireRole.mockResolvedValue({ user: { id }, role: 'admin' })
  mocks.getUserById.mockResolvedValue({ data: { user: { id, app_metadata: { role: 'admin' } } }, error: null })
  expect((await PATCH(request(input, 'PATCH'))).status).toBe(400)
  expect(mocks.updateUserById).not.toHaveBeenCalled()
})
