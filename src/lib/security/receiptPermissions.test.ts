import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getUser: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }))
import { requireReceiptIssuer, requireRole } from './auth'

beforeEach(() => vi.resetAllMocks())
const setUser = (app_metadata: Record<string, unknown>, user_metadata = {}) => {
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'staff', app_metadata, user_metadata } }, error: null })
}

it.each(['admin', 'capo_unita'])('consente a %s di configurare le ricevute indipendentemente dalla qualifica', async role => {
  setUser({ role, treasurer: false })
  expect((await requireReceiptIssuer()).role).toBe(role)
})
it('consente la firma all’aiuto qualificato senza concedere gestione utenti o impostazioni', async () => {
  setUser({ role: 'aiuto_capo_unita', treasurer: true })
  expect((await requireReceiptIssuer()).role).toBe('aiuto_capo_unita')
  await expect(requireRole(['admin'])).rejects.toMatchObject({ status: 403 })
})
it('blocca l’aiuto non qualificato anche se aggiunge la qualifica nei metadati personali', async () => {
  setUser({ role: 'aiuto_capo_unita' }, { treasurer: true, role: 'admin' })
  await expect(requireReceiptIssuer()).rejects.toMatchObject({ status: 403 })
})
it('riconosce la qualifica dei vecchi account tesoriere senza ampliarli ad admin', async () => {
  setUser({ role: 'tesoriere_unita' })
  expect((await requireReceiptIssuer()).role).toBe('aiuto_capo_unita')
  await expect(requireRole(['admin'])).rejects.toMatchObject({ status: 403 })
})
it('nega la firma all’account disattivato e senza autenticazione', async () => {
  setUser({ role: 'aiuto_capo_unita', treasurer: true, disabled: true })
  await expect(requireReceiptIssuer()).rejects.toMatchObject({ status: 403 })
  mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
  await expect(requireReceiptIssuer()).rejects.toMatchObject({ status: 401 })
})
