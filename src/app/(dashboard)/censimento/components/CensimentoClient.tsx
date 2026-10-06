'use client'

import { annualBoyUpdate, annualBoys } from '@/lib/annualRoster/client'
import { useState } from 'react'
import { Database } from '@/types/database.types'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Save, Calculator, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'

import { createClient } from '@/lib/supabase/client'
import { CENSUS_INCOME_SETTING } from '@/lib/utils/censusAccounting'
import { useRouter } from 'next/navigation'

import { useEffect } from 'react'
import { toast } from 'sonner'

type Ragazzo = Database['public']['Tables']['ragazzi']['Row']

export default function CensimentoClient({
  initialRagazzi,
  initialQuotaStandard = '45',
  initialQuotaFratelli = '35',
  currentYear,
  initialIncludeCensus = false,
  canManageSettings = false,
}: {
  initialRagazzi: Ragazzo[]
  initialQuotaStandard?: string
  initialQuotaFratelli?: string
  currentYear: string
  canManageSettings?: boolean
  initialIncludeCensus?: boolean
}) {
  const [ragazzi, setRagazzi] = useState<Ragazzo[]>(initialRagazzi)
  const [quotaStandard, setQuotaStandard] = useState(initialQuotaStandard)
  const [quotaFratelli, setQuotaFratelli] = useState(initialQuotaFratelli)
  const [isSaving, setIsSaving] = useState(false)
  const [includeCensus, setIncludeCensus] = useState(initialIncludeCensus)
  const [savingAccounting, setSavingAccounting] = useState(false)
  const router = useRouter()
  useEffect(() => { setRagazzi(initialRagazzi) }, [initialRagazzi])
  useEffect(() => { setIncludeCensus(initialIncludeCensus) }, [initialIncludeCensus])
  const [filterPattuglia, setFilterPattuglia] = useState<string>('TUTTE')
  const [calcNumFratelli, setCalcNumFratelli] = useState<number>(2)

  const supabase = createClient()

  useEffect(() => {
    const refresh = async () => {
      const { data } = await annualBoys(currentYear)
      if (data) setRagazzi(data.filter(item => item.attivo))
    }
    const channel = supabase
      .channel('censimento_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ragazzi' }, refresh)
      .subscribe()
    window.addEventListener('focus', refresh)

    return () => {
      supabase.removeChannel(channel)
      window.removeEventListener('focus', refresh)
    }
  }, [supabase, currentYear])

  const numStandard = Number(quotaStandard) || 45
  const numFratelli = Number(quotaFratelli) || 35

  const saveAccountingSetting = async (enabled: boolean) => {
    if (savingAccounting) return
    setSavingAccounting(true)
    try {
      const { error } = await supabase.from('impostazioni').upsert({ chiave: CENSUS_INCOME_SETTING, valore: String(enabled) })
      if (error) throw error
      setIncludeCensus(enabled)
      window.dispatchEvent(new Event('accounting-settings-changed'))
      router.refresh()
      toast.success(enabled ? 'Censimento incluso nelle entrate' : 'Censimento escluso dalle entrate. Pagamenti saldati conservati.')
    } catch {
      toast.error('Impostazione non salvata. Il criterio precedente resta attivo.')
    } finally { setSavingAccounting(false) }
  }

  // Calcolatore Quota Censimento Fratelli
  const totaleCensimentoCalc = calcNumFratelli > 1 
    ? numStandard + (calcNumFratelli - 1) * numFratelli 
    : numStandard
  const risparmioFratelli = calcNumFratelli > 1 
    ? (calcNumFratelli * numStandard) - totaleCensimentoCalc 
    : 0

  const handleSaveQuota = async () => {
    const standard = Number(quotaStandard)
    const fratelli = Number(quotaFratelli)
    if (!Number.isFinite(standard) || standard <= 0 || !Number.isFinite(fratelli) || fratelli <= 0) {
      toast.error('Le quote devono essere importi maggiori di zero')
      return
    }
    setIsSaving(true)
    const { error } = await supabase.from('impostazioni').upsert([
      { chiave: 'quota_censimento_standard', valore: quotaStandard },
      { chiave: 'quota_censimento_fratelli', valore: quotaFratelli }
    ])
    setIsSaving(false)

    if (error) toast.error('Impossibile salvare le quote censimento')
    else toast.success('Quote censimento salvate')
  }

  const toggleQuotaPagata = async (id: string, current: boolean | null) => {
    const newVal = !current
    const ragazzo = ragazzi.find(item => item.id === id)
    if (!ragazzo) return

    setRagazzi(prev => prev.map(item => item.id === id ? { ...item, quota_censimento: newVal } : item))

    const { error: ragazzoError } = await annualBoyUpdate(id, { quota_censimento: newVal }, currentYear)

    if (ragazzoError) {
      setRagazzi(prev => prev.map(item => item.id === id ? { ...item, quota_censimento: current } : item))
      toast.error('Impossibile aggiornare il censimento')
      return
    }

    toast.success(newVal ? 'Censimento saldato' : 'Pagamento censimento annullato')
  }

  const toggleRicevuta = async (id: string, current: boolean | null) => {
    const newVal = !current
    setRagazzi(prev => prev.map(r => r.id === id ? { ...r, ricevuta_censimento: newVal } : r))
    const { error } = await annualBoyUpdate(id, { ricevuta_censimento: newVal } as Database['public']['Tables']['ragazzi']['Update'], currentYear)

    if (error) {
      setRagazzi(prev => prev.map(r => r.id === id ? { ...r, ricevuta_censimento: current } : r))
      toast.error('Ricevuta non aggiornata')
    }
  }

  const updateImportoRagazzo = async (id: string, val: number | null) => {
    const previous = ragazzi.find(item => item.id === id)
    setRagazzi(prev => prev.map(item => item.id === id ? { ...item, importo_censimento: val } : item))

    const { error } = await annualBoyUpdate(id, { importo_censimento: val }, currentYear)
    if (error) {
      setRagazzi(prev => prev.map(item => item.id === id ? { ...item, importo_censimento: previous?.importo_censimento ?? null } : item))
      toast.error('Importo censimento non aggiornato')
      return
    }

  }

  const pattuglie = Array.from(new Set(ragazzi.map(r => r.pattuglia).filter(Boolean))) as string[]

  const ragazziFiltrati = ragazzi.filter(r => {
    if (filterPattuglia === 'TUTTE') return true
    return r.pattuglia === filterPattuglia
  })

  return (
    <div className="space-y-5 max-w-6xl mx-auto text-foreground">
      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold tracking-tight">Censimento Annuale Reparto</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Gestisci le quote del censimento, le riduzioni fratelli e la consegna delle ricevute cartacee</p>
      </div>

      <div className="space-y-2">
        <details className="rounded-xl border bg-card">
          <summary className="cursor-pointer rounded-xl px-4 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            Censimento nelle entrate
            <span className="ml-2 text-xs font-normal text-muted-foreground">{includeCensus ? 'Incluso' : 'Escluso'}</span>
          </summary>
          <Card className="rounded-none border-0 border-t bg-transparent p-4 space-y-3 shadow-none">
            <div className="flex items-center gap-3">
              <Checkbox id="census-income" checked={includeCensus} disabled={savingAccounting || !canManageSettings} onCheckedChange={value => saveAccountingSetting(value === true)} />
              <Label htmlFor="census-income">Includi il censimento nelle entrate</Label>
            </div>
            <p className="text-sm text-muted-foreground">Disattivato per impostazione predefinita. Il censimento resta saldato, ma non modifica entrate, saldi di cassa e banca o report. Attivando l’opzione vengono conteggiati anche i pagamenti già registrati, in tutti gli anni. Disattivandola, i pagamenti restano conservati.</p>
          </Card>
        </details>

        <details className="rounded-xl border bg-card">
          <summary className="cursor-pointer rounded-xl px-4 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            Tariffe e calcolatore
            <span className="ml-2 text-xs font-normal text-muted-foreground">€{numStandard} / €{numFratelli}</span>
          </summary>
          {/* Widget Calcolatore Quota Censimento Fratelli (ESCLUSIVAMENTE IN CENSIMENTO) */}
          <Card className="border-0 border-t bg-amber-50/60 dark:bg-amber-950/20 p-4 rounded-none shadow-none">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-amber-950 dark:text-amber-300 font-semibold text-sm">
                  <Calculator className="w-4 h-4 text-amber-600 shrink-0" />
                  Calcolatore Quota Censimento Fratelli
                </div>
                <p className="text-xs text-amber-900/80 dark:text-amber-400">
                  Calcola la spesa totale censimento per famiglie con più ragazzi iscritti (1° figlio: €{numStandard} • Fratelli: €{numFratelli}).
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-4 bg-white dark:bg-slate-900 p-3 rounded-xl border border-amber-200 shadow-2xs md:shrink-0">
                <div className="space-y-1 text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Numero Fratelli:</span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-10 w-10 p-0 md:h-7 md:w-7"
                      onClick={() => setCalcNumFratelli(Math.max(1, calcNumFratelli - 1))}
                    >-</Button>
                    <span className="font-bold text-sm w-5 text-center">{calcNumFratelli}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-10 w-10 p-0 md:h-7 md:w-7"
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
          <div className="border-t p-4 space-y-3">
            <div>
              <h2 className="text-sm font-semibold">Impostazioni Tariffe Censimento</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Definisci la quota standard e la quota scontata per i fratelli per quest&apos;anno</p>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <div className="flex items-center gap-2">
                <Label className="text-xs font-medium">Quota Annuale (€):</Label>
                <Input
                  type="number"
                  disabled={!canManageSettings}
                  value={quotaStandard}
                  onChange={e => setQuotaStandard(e.target.value)}
                  className="w-20 h-10 text-base font-bold md:h-9 md:text-xs"
                />
              </div>

              <div className="flex items-center gap-2">
                <Label className="text-xs font-bold text-amber-700 dark:text-amber-400">Quota Fratelli (€):</Label>
                <Input
                  type="number"
                  disabled={!canManageSettings}
                  value={quotaFratelli}
                  onChange={e => setQuotaFratelli(e.target.value)}
                  className="w-20 h-10 text-base font-bold border-amber-500 bg-amber-50/50 dark:bg-amber-950/20 md:h-9 md:text-xs"
                />
              </div>

              <Button
                onClick={handleSaveQuota}
                disabled={isSaving || !canManageSettings}
                size="sm"
                className="bg-black hover:bg-black/90 text-white font-medium px-4 h-10 text-xs md:h-9"
              >
                <Save className="w-3.5 h-3.5 mr-1.5" />
                Salva Quota
              </Button>
            </div>
          </div>
        </details>
      </div>

      {/* Tabellone Censimento */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
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

        {/* Vista Tabellare Desktop */}
        <div className="hidden md:block border rounded-xl bg-card overflow-hidden">
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

        {/* Vista Card Mobile */}
        <div className="md:hidden space-y-2">
          {ragazziFiltrati.map((r) => {
            const isPaid = r.quota_censimento === true
            const isFratello = Number(r.importo_censimento) === numFratelli

            return (
              <div key={r.id} className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-2xs space-y-2">
                <div className="flex justify-between items-center gap-3">
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-900 text-sm break-words">{r.nome} {r.cognome}</h3>
                    <span className="text-xs text-slate-500">{r.pattuglia || 'Senza Pattuglia'}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleQuotaPagata(r.id, r.quota_censimento)}
                    className={cn(
                      "shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all min-h-[38px] touch-min border",
                      isPaid 
                        ? "bg-emerald-600 text-white border-emerald-700 shadow-2xs" 
                        : "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                    )}
                  >
                    {isPaid ? '✓ Saldato' : 'Da Saldare'}
                  </button>
                </div>

                <div className="flex flex-wrap justify-between items-center gap-2">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer touch-min">
                    <Checkbox 
                      checked={r.ricevuta_censimento === true}
                      onCheckedChange={() => toggleRicevuta(r.id, r.ricevuta_censimento)}
                      className="h-4 w-4"
                    />
                    Ricevuta Cartacea
                  </label>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => updateImportoRagazzo(r.id, numStandard)}
                      className={cn(
                        "text-[10px] px-2.5 py-1.5 rounded-xl border transition-all font-bold touch-min",
                        (!isFratello)
                          ? 'bg-agesci-blue text-white border-agesci-blue shadow-2xs'
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                      )}
                    >
                      Std {numStandard}€
                    </button>
                    <button
                      type="button"
                      onClick={() => updateImportoRagazzo(r.id, numFratelli)}
                      className={cn(
                        "text-[10px] px-2.5 py-1.5 rounded-xl border transition-all font-bold touch-min",
                        (isFratello)
                          ? 'bg-amber-600 text-white border-amber-700 shadow-2xs'
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                      )}
                    >
                      Fratello {numFratelli}€
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
