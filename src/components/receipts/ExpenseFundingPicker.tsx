'use client'

import type { ExpenseFunding } from '@/lib/reimbursements/client'
import type { StaffOption } from '@/lib/reimbursements/model'

export function ExpenseFundingPicker({ id, value, onChange, beneficiary, onBeneficiaryChange, users, disabled = false }: {
  id: string; value: ExpenseFunding; onChange: (value: ExpenseFunding) => void;
  beneficiary: string; onBeneficiaryChange: (id: string) => void; users: StaffOption[]; disabled?: boolean;
}) {
  return <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
    <label htmlFor={`${id}-funding`} className="block text-sm font-semibold">Chi ha pagato questa spesa?</label>
    <select id={`${id}-funding`} required disabled={disabled} value={value} onChange={e => onChange(e.target.value as ExpenseFunding)} className="h-11 w-full rounded-md border bg-white px-2 text-base">
      <option value="" disabled>Scegli prima di salvare…</option>
      <option value="UNIT">Reparto · uscita in cassa</option>
      <option value="PERSONAL">Utente · da rimborsare</option>
    </select>
    {value === 'PERSONAL' ? <>
      <label htmlFor={`${id}-beneficiary`} className="block text-sm font-medium">Da restituire a</label>
      <select id={`${id}-beneficiary`} required disabled={disabled} value={beneficiary} onChange={e => onBeneficiaryChange(e.target.value)} className="h-11 w-full rounded-md border bg-white px-2 text-base">
        <option value="" disabled>Scegli l’utente</option>
        {users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}
      </select>
      <p role="status" className="text-sm text-amber-900">Salvi una richiesta per tesoriere e admin. La cassa non cambia: l’uscita verrà registrata solo alla conferma della restituzione.</p>
    </> : value === 'UNIT' ? <p className="text-sm">La spesa viene registrata subito nelle uscite del reparto.</p> : null}
  </div>
}
