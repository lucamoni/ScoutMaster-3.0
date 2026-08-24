'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type Ragazzo = Database['public']['Tables']['ragazzi']['Row']
type PrivacyField = 'foglio_privacy_firmato' | 'partecipazione_ci' | 'scheda_medica_ci' | 'partecipazione_ce' | 'scheda_medica_ce' | 'quota_censimento' | 'ricevuta_censimento'

export function PrivacyClient({ ragazzi: initialRagazzi }: { ragazzi: Ragazzo[] }) {
  const supabase = createClient()
  const [ragazzi, setRagazzi] = useState<Ragazzo[]>(initialRagazzi)

  const toggleStatus = async (
    id: string,
    field: PrivacyField,
    currentValue: boolean | null
  ) => {
    const newValue = !currentValue
    setRagazzi(prev => prev.map(r => r.id === id ? { ...r, [field]: newValue } : r))
    
    await supabase.from('ragazzi').update({ [field]: newValue } as Database['public']['Tables']['ragazzi']['Update']).eq('id', id)
  }

  const renderCell = (r: Ragazzo, field: PrivacyField) => {
    const value = r[field] as boolean | null
    return (
      <button 
        onClick={() => toggleStatus(r.id, field, value)}
        className={cn(
          "w-full h-full min-h-[40px] flex items-center justify-center transition-colors hover:opacity-80 cursor-pointer",
          value ? "bg-green-100 text-green-700" : "bg-red-50 text-red-400"
        )}
      >
        {value ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}
      </button>
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Privacy & Documenti</h1>
      </div>
      
      <div className="rounded-md border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium border-b border-r">Esploratore</th>
                <th className="px-4 py-3 font-medium border-b border-r text-center w-28">Privacy</th>
                <th className="px-4 py-3 font-medium border-b border-r text-center w-28">Part. CI</th>
                <th className="px-4 py-3 font-medium border-b border-r text-center w-28">Medica CI</th>
                <th className="px-4 py-3 font-medium border-b border-r text-center w-28">Part. CE</th>
                <th className="px-4 py-3 font-medium border-b border-r text-center w-28">Medica CE</th>
                <th className="px-4 py-3 font-medium border-b border-r text-center w-28">Quota Cens.</th>
                <th className="px-4 py-3 font-medium border-b text-center w-28">Ricevuta Cens.</th>
              </tr>
            </thead>
            <tbody>
              {ragazzi.map((r, i) => (
                <tr key={r.id} className={cn("border-b", i % 2 === 0 ? "bg-background" : "bg-muted/20")}>
                  <td className="px-4 py-2 border-r font-medium">
                    {r.nome} {r.cognome}
                    <div className="text-xs text-muted-foreground">{r.pattuglia}</div>
                  </td>
                  <td className="p-0 border-r">{renderCell(r, 'foglio_privacy_firmato')}</td>
                  <td className="p-0 border-r">{renderCell(r, 'partecipazione_ci')}</td>
                  <td className="p-0 border-r">{renderCell(r, 'scheda_medica_ci')}</td>
                  <td className="p-0 border-r">{renderCell(r, 'partecipazione_ce')}</td>
                  <td className="p-0 border-r">{renderCell(r, 'scheda_medica_ce')}</td>
                  <td className="p-0 border-r">{renderCell(r, 'quota_censimento')}</td>
                  <td className="p-0">{renderCell(r, 'ricevuta_censimento')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
