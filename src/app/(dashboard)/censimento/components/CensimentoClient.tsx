'use client'

import { useState } from 'react'
import { Database } from '@/types/database.types'
import { createBrowserClient } from '@supabase/ssr'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Save, Calculator, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'

type Ragazzo = Database['public']['Tables']['ragazzi']['Row']

export default function CensimentoClient({
  initialRagazzi,
  initialQuotaStandard = '45',
  initialQuotaFratelli = '35'
}: {
  initialRagazzi: Ragazzo[]
  initialQuotaStandard?: string
  initialQuotaFratelli?: string
}) {
  const [ragazzi, setRagazzi] = useState<Ragazzo[]>(initialRagazzi)
  const [quotaStandard, setQuotaStandard] = useState(initialQuotaStandard)
  const [quotaFratelli, setQuotaFratelli] = useState(initialQuotaFratelli)
  const [isSaving, setIsSaving] = useState(false)
  const [filterPattuglia, setFilterPattuglia] = useState<string>('TUTTE')
  const [calcNumFratelli, setCalcNumFratelli] = useState<number>(2)

  const supabase = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const numStandard = Number(quotaStandard) || 45
  const numFratelli = Number(quotaFratelli) || 35

  // Calcolatore Quota Censimento Fratelli
  const totaleCensimentoCalc = calcNumFratelli > 1 
    ? numStandard + (calcNumFratelli - 1) * numFratelli 
    : numStandard
  const risparmioFratelli = calcNumFratelli > 1 
    ? (calcNumFratelli * numStandard) - totaleCensimentoCalc 
    : 0

  const handleSaveQuota = async () => {
    setIsSaving(true)
    await supabase.from('impostazioni').upsert([
      { chiave: 'quota_censimento_standard', valore: quotaStandard },
      { chiave: 'quota_censimento_fratelli', valore: quotaFratelli }
    ])
    setIsSaving(false)
  }

  const toggleQuotaPagata = async (id: string, current: boolean | null) => {
    const newVal = !current
    setRagazzi(prev => prev.map(r => r.id === id ? { ...r, quota_censimento: newVal } : r))
    await supabase.from('ragazzi').update({ quota_censimento: newVal } as Database['public']['Tables']['ragazzi']['Update']).eq('id', id)
  }

  const toggleRicevuta = async (id: string, current: boolean | null) => {
    const newVal = !current
    setRagazzi(prev => prev.map(r => r.id === id ? { ...r, ricevuta_censimento: newVal } : r))
    await supabase.from('ragazzi').update({ ricevuta_censimento: newVal } as Database['public']['Tables']['ragazzi']['Update']).eq('id', id)
  }

  const updateImportoRagazzo = async (id: string, val: number | null) => {
    setRagazzi(prev => prev.map(r => r.id === id ? { ...r, importo_censimento: val } : r))
    await supabase.from('ragazzi').update({ importo_censimento: val } as Database['public']['Tables']['ragazzi']['Update']).eq('id', id)
  }

  const pattuglie = Array.from(new Set(ragazzi.map(r => r.pattuglia).filter(Boolean))) as string[]

  const ragazziFiltrati = ragazzi.filter(r => {
    if (filterPattuglia === 'TUTTE') return true
    return r.pattuglia === filterPattuglia
  })

  return (
    <div className="p-6 md:p-10 space-y-8 max-w-6xl mx-auto text-foreground">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Censimento Annuale Reparto</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Gestisci le quote del censimento, le riduzioni fratelli e la consegna delle ricevute cartacee</p>
      </div>

      {/* Widget Calcolatore Quota Censimento Fratelli (ESCLUSIVAMENTE IN CENSIMENTO) */}
      <Card className="border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 p-5 rounded-2xl shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-amber-950 dark:text-amber-300 font-bold text-base">
              <Calculator className="w-5 h-5 text-amber-600 shrink-0" />
              Calcolatore Quota Censimento Fratelli
            </div>
            <p className="text-xs text-amber-900/80 dark:text-amber-400">
              Calcola la spesa totale censimento per famiglie con più ragazzi iscritti (1° figlio: €{numStandard} • Fratelli: €{numFratelli}).
            </p>
          </div>

          <div className="flex items-center gap-4 bg-white dark:bg-slate-900 p-3 rounded-xl border border-amber-200 shadow-2xs shrink-0">
            <div className="space-y-1 text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-300">Numero Fratelli:</span>
              <div className="flex items-center gap-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="h-7 w-7 p-0" 
                  onClick={() => setCalcNumFratelli(Math.max(1, calcNumFratelli - 1))}
                >-</Button>
                <span className="font-bold text-sm w-5 text-center">{calcNumFratelli}</span>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="h-7 w-7 p-0" 
                  onClick={() => setCalcNumFratelli(calcNumFratelli + 1)}
                >+</Button>
              </div>
            </div>

            <div className="border-l border-slate-200 dark:border-slate-800 pl-4 space-y-0.5">
              <div className="text-xs text-slate-500 font-medium">Totale Famiglia:</div>
              <div className="text-lg font-bold text-amber-950 dark:text-amber-200 tabular-nums">€{totaleCensimentoCalc}.00</div>
              {risparmioFratelli > 0 && (
                <div className="text-[10px] font-semibold text-emerald-600">Risparmio: €{risparmioFratelli}.00</div>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Card Impostazioni Censimento */}
      <div className="border rounded-xl p-6 bg-card space-y-4 shadow-2xs">
        <div>
          <h2 className="text-sm font-semibold">Impostazioni Tariffe Censimento</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Definisci la quota standard e la quota scontata per i fratelli per quest'anno</p>
        </div>

        <div className="flex flex-wrap items-center gap-6 pt-1">
          <div className="flex items-center gap-2">
            <Label className="text-xs font-medium">Quota Annuale (€):</Label>
            <Input 
              type="number"
              value={quotaStandard}
              onChange={e => setQuotaStandard(e.target.value)}
              className="w-20 h-9 text-xs font-bold"
            />
          </div>

          <div className="flex items-center gap-2">
            <Label className="text-xs font-bold text-amber-700 dark:text-amber-400">Quota Fratelli (€):</Label>
            <Input 
              type="number"
              value={quotaFratelli}
              onChange={e => setQuotaFratelli(e.target.value)}
              className="w-20 h-9 text-xs font-bold border-amber-500 bg-amber-50/50 dark:bg-amber-950/20"
            />
          </div>

          <Button 
            onClick={handleSaveQuota} 
            disabled={isSaving}
            size="sm"
            className="bg-black hover:bg-black/90 text-white font-medium px-4 h-9 text-xs"
          >
            <Save className="w-3.5 h-3.5 mr-1.5" />
            Salva Quota
          </Button>
        </div>
      </div>

      {/* Tabellone Censimento */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Tabellone Censimento</h2>
          <Select value={filterPattuglia} onValueChange={(v) => setFilterPattuglia(v || 'TUTTE')}>
            <SelectTrigger className="w-32 h-8 text-xs bg-background">
              <SelectValue placeholder="TUTTE" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TUTTE">TUTTE</SelectItem>
              {pattuglie.map(p => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="border rounded-xl bg-card overflow-hidden">
          <table className="w-full text-xs text-left">
            <thead className="border-b bg-muted/20 text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Esploratore</th>
                <th className="px-4 py-3 font-medium">Pattuglia</th>
                <th className="px-4 py-3 font-medium text-center w-36">Ricevuta Cartacea</th>
                <th className="px-4 py-3 font-medium text-center w-36">Quota Pagata</th>
                <th className="px-4 py-3 font-medium text-center w-48">Tipo Quota</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {ragazziFiltrati.map((r) => {
                const isPaid = r.quota_censimento === true

                return (
                  <tr key={r.id} className="hover:bg-muted/10 transition-colors">
                    <td className="px-4 py-3 font-medium">{r.nome} {r.cognome}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.pattuglia || '-'}</td>
                    
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center">
                        <Checkbox 
                          checked={r.ricevuta_censimento === true}
                          onCheckedChange={() => toggleRicevuta(r.id, r.ricevuta_censimento)}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                      </div>
                    </td>

                    <td className="px-4 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => toggleQuotaPagata(r.id, r.quota_censimento)}
                        className={cn(
                          "px-3 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer inline-block",
                          isPaid 
                            ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" 
                            : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                        )}
                      >
                        {isPaid ? 'Saldato' : 'Da Saldare'}
                      </button>
                    </td>

                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => updateImportoRagazzo(r.id, numStandard)}
                          className={cn(
                            "text-[10px] px-2 py-0.5 rounded border transition-colors font-medium cursor-pointer",
                            (r.importo_censimento === null || r.importo_censimento === undefined || Number(r.importo_censimento) === numStandard)
                              ? 'bg-black text-white font-bold dark:bg-white dark:text-black'
                              : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                          )}
                        >
                          Std {numStandard}€
                        </button>

                        <button
                          type="button"
                          onClick={() => updateImportoRagazzo(r.id, numFratelli)}
                          className={cn(
                            "text-[10px] px-2 py-0.5 rounded border transition-colors font-medium cursor-pointer",
                            (Number(r.importo_censimento) === numFratelli)
                              ? 'bg-amber-600 text-white font-bold'
                              : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                          )}
                        >
                          Fratello {numFratelli}€
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
