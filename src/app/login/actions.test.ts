import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ signOut: vi.fn(), redirect: vi.fn(), revalidatePath: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { signOut: mocks.signOut } }) }))
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }))
import { logout } from './actions'

beforeEach(() => { vi.clearAllMocks(); mocks.redirect.mockImplementation(() => { throw new Error('redirect') }) })
it('termina la sessione corrente e torna al login svuotando la cache delle pagine', async () => {
  mocks.signOut.mockResolvedValue({ error: null })
  await expect(logout()).rejects.toThrow('redirect')
  expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' })
  expect(mocks.revalidatePath).toHaveBeenCalledWith('/', 'layout')
  expect(mocks.redirect).toHaveBeenCalledWith('/login')
})
it('mostra un errore riprovabile senza dichiarare conclusa una disconnessione fallita', async () => {
  mocks.signOut.mockResolvedValue({ error: new Error('service unavailable') })
  expect(await logout()).toEqual({ error: 'Impossibile uscire dall’account. Riprova.' })
  expect(mocks.redirect).not.toHaveBeenCalled()
  expect(mocks.revalidatePath).not.toHaveBeenCalled()
})
