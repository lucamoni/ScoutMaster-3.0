'use client'

import { useActionState } from 'react'
import { LogOut } from 'lucide-react'
import { logout } from '@/app/login/actions'

export function LogoutButton({ collapsed = false }: { collapsed?: boolean }) {
  const [state, action, pending] = useActionState(logout, { error: '' })
  return (
    <form action={action} className="px-3 py-2">
      <button type="submit" disabled={pending} aria-label="Esci dall’account" title="Esci dall’account"
        className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-200 hover:bg-agesci-blue-light hover:text-white disabled:opacity-60">
        <LogOut className="h-5 w-5 shrink-0" aria-hidden="true" />
        {!collapsed && <span>{pending ? 'Uscita…' : 'Esci dall’account'}</span>}
      </button>
      {state.error && <p role="alert" className="mt-1 text-xs text-red-200">{state.error}</p>}
    </form>
  )
}
