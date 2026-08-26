'use client'

import React, { useState, useEffect } from 'react'
import { Database } from '@/types/database.types'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { 
  Search, 
  CheckCircle2, 
  CreditCard, 
  Calendar, 
  Users, 
  Wallet, 
  Sparkles, 
  CheckCheck,
  Shield,
  Loader2,
  X,
  ArrowLeft
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { normalizeAnnoScout } from '@/lib/utils/payment'

type Ragazzo = Database['public']['Tables']['ragazzi']['Row']
type Evento = Database['public']['Tables']['eventi']['Row']
type Partecipazione = Database['public']['Tables']['partecipazioni_eventi']['Row']
type Quota = Database['public']['Tables']['quote_mensili']['Row']
type Pattuglia = Database['public']['Tables']['pattuglie']['Row']

const MONTHS: (keyof Quota)[] = ['ott', 'nov', 'dic', 'gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'sep']
const MONTH_LABELS: Record<string, string> = {
  ott: 'Ottobre', nov: 'Novembre', dic: 'Dicembre', gen: 'Gennaio',
  feb: 'Febbraio', mar: 'Marzo', apr: 'Aprile', mag: 'Maggio',
  giu: 'Giugno', lug: 'Luglio', ago: 'Agosto', sep: 'Settembre'
}

const getScoutMonthsUpToNow = (): (keyof Quota)[] => {
  const m = new Date().getMonth()
  let limit = 7
  if (m === 9) limit = 0
  else if (m === 10) limit = 1
  else if (m === 11) limit = 2
  else if (m === 0) limit = 3
  else if (m === 1) limit = 4
  else if (m === 2) limit = 5
  else if (m === 3) limit = 6
  else if (m === 4) limit = 7
  else if (m === 5) limit = 8
  else if (m === 6) limit = 9
  else if (m === 7) limit = 10
  else if (m === 8) limit = 11

  return MONTHS.slice(0, limit + 1)
}

export default function SaldaOraClient({
  initialRagazzi,
  eventi,
  partecipazioni: initialPartecipazioni,
  quote: initialQuote,
  pattuglie,
  quotaMensileStandard,
  quotaCensimentoStandard,
  quotaCensimentoFratelli = '35',
  currentYear
}: {
  initialRagazzi: Ragazzo[]
  eventi: Evento[]
  partecipazioni: Partecipazione[]
  quote: Quota[]
  pattuglie: Pattuglia[]
  quotaMensileStandard: string
  quotaCensimentoStandard: string
  quotaCensimentoFratelli?: string
  currentYear: string
}) {
  const supabase = createClient()
  const [ragazzi, setRagazzi] = useState<Ragazzo[]>(initialRagazzi)
  const [partecipazioni, setPartecipazioni] = useState<Partecipazione[]>(initialPartecipazioni)
  const [quote, setQuote] = useState<Quota[]>(initialQuote)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterPattuglia, setFilterPattuglia] = useState<string>('TUTTE')
  const [loadingBoyId, setLoadingBoyId] = useState<string | null>(null)

  // Dialog Gestisci Pagamenti Modal
  const [selectedBoyForModal, setSelectedBoyForModal] = useState<Ragazzo | null>(null)
  const [modalSelections, setModalSelections] = useState<{
    censimento: boolean
    months: string[]
    eventi: string[]
  }>({ censimento: false, months: [], eventi: [] })

  const quotaMensileNum = Number(quotaMensileStandard) || 10
  const quotaCensimentoNum = Number(quotaCensimentoStandard) || 45
  const activeMonths = getScoutMonthsUpToNow()

  // Realtime Syncing
  useEffect(() => {
    const channel = supabase
      .channel('salda_ora_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'partecipazioni_eventi' }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const updated = payload.new as Partecipazione
          setPartecipazioni(prev => {
            const filtered = prev.filter(p => !(p.ragazzo_id === updated.ragazzo_id && p.evento_id === updated.evento_id))
            return [...filtered, updated]
          })
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quote_mensili' }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const updated = payload.new as Quota
          setQuote(prev => {
            const filtered = prev.filter(q => q.id !== updated.id)
            return [...filtered, updated]
          })
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ragazzi' }, (payload) => {
        if (payload.eventType === 'UPDATE') {
          const updated = payload.new as Ragazzo
          setRagazzi(prev => prev.map(r => r.id === updated.id ? updated : r))
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase])

  // Helper per calcolare le pendenze dettagliate di un ragazzo
  const computeBoyDebt = (ragazzo: Ragazzo) => {
    const normYear = normalizeAnnoScout(currentYear)
    const boyQuote = quote.find(q => q.ragazzo_id === ragazzo.id && normalizeAnnoScout(q.anno_scout) === normYear)

    // 1. Mesi arretrati
    const unpaidMonths = activeMonths.filter(m => !boyQuote || boyQuote[m] !== true)
    const quoteDebt = unpaidMonths.length * quotaMensileNum

    // 2. Eventi non saldati
    const boyParts = partecipazioni.filter(p => p.ragazzo_id === ragazzo.id && p.riscosso !== true)
    const unpaidEventDetails = boyParts.map(p => {
      const ev = eventi.find(e => e.id === p.evento_id)
      const cost = (p.quota_dovuta !== null && p.quota_dovuta !== undefined) 
        ? Number(p.quota_dovuta) 
        : (ev?.quota_standard || 0)
      return {
        eventoId: p.evento_id,
        nome: ev?.nome_evento || 'Evento Reparto',
        cost
      }
    })
    const eventiDebt = unpaidEventDetails.reduce((acc, curr) => acc + curr.cost, 0)

    // 3. Censimento non saldato
    const censimentoDue = ragazzo.quota_censimento !== true
    const censimentoCost = (ragazzo.importo_censimento !== null && ragazzo.importo_censimento !== undefined)
      ? Number(ragazzo.importo_censimento)
      : quotaCensimentoNum
    const censimentoDebt = censimentoDue ? censimentoCost : 0

    const totalDebt = quoteDebt + eventiDebt + censimentoDebt
    const pendenzeCount = unpaidMonths.length + unpaidEventDetails.length + (censimentoDue ? 1 : 0)

    return {
      unpaidMonths,
      quoteDebt,
      unpaidEventDetails,
      eventiDebt,
      censimentoDue,
      censimentoCost,
      censimentoDebt,
      totalDebt,
      pendenzeCount
    }
  }

  // Azione 1: Salda Tutto per un singolo ragazzo in 1-Click
  const handleSaldaTutto = async (ragazzo: Ragazzo) => {
    setLoadingBoyId(ragazzo.id)
    const debtInfo = computeBoyDebt(ragazzo)
    toast.loading(`Salvataggio in corso per ${ragazzo.nome}...`, { id: `salda-${ragazzo.id}` })

    try {
      const normYear = normalizeAnnoScout(currentYear)

      // A. Salda Censimento
      if (debtInfo.censimentoDue) {
        await supabase.from('ragazzi').update({ quota_censimento: true } as Database['public']['Tables']['ragazzi']['Update']).eq('id', ragazzo.id)
        setRagazzi(prev => prev.map(r => r.id === ragazzo.id ? { ...r, quota_censimento: true } : r))
      }

      // B. Salda Quote Mensili
      if (debtInfo.unpaidMonths.length > 0) {
        const updatePayload: Record<string, boolean> = {}
        debtInfo.unpaidMonths.forEach(m => { updatePayload[m] = true })

        const { data: existingQ } = await supabase.from('quote_mensili').select('id').eq('ragazzo_id', ragazzo.id).eq('anno_scout', normYear).maybeSingle()
        if (existingQ?.id) {
          await supabase.from('quote_mensili').update(updatePayload).eq('id', existingQ.id)
        } else {
          await supabase.from('quote_mensili').insert({ ragazzo_id: ragazzo.id, anno_scout: normYear, ...updatePayload })
        }
      }

      // C. Salda Eventi
      if (debtInfo.unpaidEventDetails.length > 0) {
        for (const evDetail of debtInfo.unpaidEventDetails) {
          const { data: existingP } = await supabase.from('partecipazioni_eventi').select('id').eq('ragazzo_id', ragazzo.id).eq('evento_id', evDetail.eventoId).maybeSingle()
          if (existingP?.id) {
            await supabase.from('partecipazioni_eventi').update({ riscosso: true } as Database['public']['Tables']['partecipazioni_eventi']['Update']).eq('id', existingP.id)
          } else {
            await supabase.from('partecipazioni_eventi').insert({ ragazzo_id: ragazzo.id, evento_id: evDetail.eventoId, riscosso: true, stato_presenza: 'Presente' } as Database['public']['Tables']['partecipazioni_eventi']['Insert'])
          }
        }
      }

      toast.success(`Tutte le pendenze di ${ragazzo.nome} ${ragazzo.cognome} sono state saldate!`, { id: `salda-${ragazzo.id}` })
    } catch (err: any) {
      toast.error(`Errore nel saldare: ${err.message}`, { id: `salda-${ragazzo.id}` })
    } finally {
      setLoadingBoyId(null)
    }
  }

  // Apertura Modal Gestisci Pagamenti
  const openGestisciModal = (ragazzo: Ragazzo) => {
    const debt = computeBoyDebt(ragazzo)
    setSelectedBoyForModal(ragazzo)
    setModalSelections({
      censimento: debt.censimentoDue,
      months: [...debt.unpaidMonths],
      eventi: debt.unpaidEventDetails.map(e => e.eventoId)
    })
  }

  // Salvataggio Selettivo dal Modal Gestisci Pagamenti
  const handleSaveModalSelections = async () => {
    if (!selectedBoyForModal) return
    const r = selectedBoyForModal
    setLoadingBoyId(r.id)
    toast.loading(`Aggiornamento pagamenti di ${r.nome}...`, { id: `save-modal-${r.id}` })

    try {
      const normYear = normalizeAnnoScout(currentYear)

      // Censimento
      await supabase.from('ragazzi').update({ quota_censimento: !modalSelections.censimento } as Database['public']['Tables']['ragazzi']['Update']).eq('id', r.id)
      setRagazzi(prev => prev.map(item => item.id === r.id ? { ...item, quota_censimento: !modalSelections.censimento } : item))

      // Quote Mensili
      const monthUpdatePayload: Record<string, boolean> = {}
      activeMonths.forEach(m => {
        monthUpdatePayload[m] = !modalSelections.months.includes(m)
      })

      const { data: existingQ } = await supabase.from('quote_mensili').select('id').eq('ragazzo_id', r.id).eq('anno_scout', normYear).maybeSingle()
      if (existingQ?.id) {
        await supabase.from('quote_mensili').update(monthUpdatePayload).eq('id', existingQ.id)
      } else {
        await supabase.from('quote_mensili').insert({ ragazzo_id: r.id, anno_scout: normYear, ...monthUpdatePayload })
      }

      // Eventi
      const allBoyParts = partecipazioni.filter(p => p.ragazzo_id === r.id)
      for (const ev of eventi) {
        const isUnpaidInModal = modalSelections.eventi.includes(ev.id)
        const isPaid = !isUnpaidInModal

        const existingP = allBoyParts.find(p => p.evento_id === ev.id)
        if (existingP?.id) {
          await supabase.from('partecipazioni_eventi').update({ riscosso: isPaid } as Database['public']['Tables']['partecipazioni_eventi']['Update']).eq('id', existingP.id)
        } else if (isPaid) {
          await supabase.from('partecipazioni_eventi').insert({ ragazzo_id: r.id, evento_id: ev.id, riscosso: true, stato_presenza: 'Presente' } as Database['public']['Tables']['partecipazioni_eventi']['Insert'])
        }
      }

      toast.success(`Pagamenti aggiornati per ${r.nome}!`, { id: `save-modal-${r.id}` })
      setSelectedBoyForModal(null)
    } catch (err: any) {
      toast.error(`Errore: ${err.message}`, { id: `save-modal-${r.id}` })
    } finally {
      setLoadingBoyId(null)
    }
  }

  // Raggruppamento per Squadriglia
  const ragazziFiltrati = ragazzi.filter(r => {
    const fullName = `${r.nome} ${r.cognome}`.toLowerCase()
    const matchesSearch = fullName.includes(searchTerm.toLowerCase())
    const matchesPattuglia = filterPattuglia === 'TUTTE' || r.pattuglia === filterPattuglia
    return matchesSearch && matchesPattuglia
  })

  // Lista dinamica delle squadriglie
  const squadriglieNomi = Array.from(new Set(ragazzi.map(r => r.pattuglia).filter(Boolean))) as string[]

  return (
    <div className="min-h-screen bg-[#071930] text-slate-100 p-4 md:p-8 space-y-6 font-sans">
      {/* Top Header & Controlli */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#0d2647] p-5 rounded-2xl border border-slate-700/60 shadow-lg">
        <div>
          <div className="flex items-center gap-2">
            <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-xs font-bold uppercase tracking-wider">
              1-Click Fast Clear
            </Badge>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white mt-1">Salda Ora</h1>
          <p className="text-xs text-slate-300">Gestisci rapidamente le pendenze di ogni esploratore e salda in 1-tap</p>
        </div>

        {/* Toolbar Cerca & Filtri */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Cerca esploratore..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
              className="h-9 text-xs pl-9 w-48 bg-[#091e3a] border-slate-700 text-white placeholder:text-slate-400 rounded-xl focus:border-emerald-500"
            />
          </div>

          <Select value={filterPattuglia} onValueChange={(v) => setFilterPattuglia(v || 'TUTTE')}>
            <SelectTrigger className="h-9 text-xs w-40 bg-[#091e3a] border-slate-700 text-white rounded-xl">
              <SelectValue placeholder="Tutte le Squadriglie" />
            </SelectTrigger>
            <SelectContent className="bg-[#0d2647] border-slate-700 text-white">
              <SelectItem value="TUTTE" className="text-xs">Tutte le Squadriglie</SelectItem>
              {squadriglieNomi.map(sq => (
                <SelectItem key={sq} value={sq} className="text-xs">{sq}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Lista Squadriglie con Card Esploratori */}
      <div className="space-y-8">
        {(filterPattuglia === 'TUTTE' ? squadriglieNomi : [filterPattuglia]).map(sqNome => {
          const membriSquadriglia = ragazziFiltrati.filter(r => r.pattuglia === sqNome)
          if (membriSquadriglia.length === 0) return null

          return (
            <div key={sqNome} className="space-y-3">
              {/* Intestazione Squadriglia (es. CORMORANI - 5 membri) */}
              <div className="flex items-center justify-between bg-[#0a213f]/80 px-4 py-2.5 rounded-xl border border-slate-700/50">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-emerald-400" />
                  <h2 className="text-sm font-extrabold uppercase tracking-wider text-slate-100">{sqNome}</h2>
                </div>
                <Badge className="bg-slate-800 text-slate-300 border-slate-700 text-xs font-semibold px-2.5">
                  {membriSquadriglia.length} membri
                </Badge>
              </div>

              {/* Grid Card Esploratori */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {membriSquadriglia.map(ragazzo => {
                  const debt = computeBoyDebt(ragazzo)
                  const hasDebt = debt.totalDebt > 0
                  const isBoyLoading = loadingBoyId === ragazzo.id

                  const initials = `${ragazzo.nome[0] || ''}${ragazzo.cognome[0] || ''}`.toUpperCase()

                  return (
                    <div 
                      key={ragazzo.id} 
                      className={cn(
                        "rounded-2xl p-4 transition-all duration-200 border shadow-md space-y-3 flex flex-col justify-between",
                        hasDebt 
                          ? "bg-white text-slate-900 border-slate-200" 
                          : "bg-white/95 text-slate-900 border-slate-200 opacity-90"
                      )}
                    >
                      {/* Top Bar Card: Avatar, Nome, Importo */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          {/* Circle Avatar */}
                          <div className={cn(
                            "h-12 w-12 rounded-full flex items-center justify-center font-bold text-white text-sm shadow-md shrink-0",
                            hasDebt ? "bg-rose-500" : "bg-emerald-600"
                          )}>
                            {initials}
                          </div>

                          <div>
                            <h3 className="font-extrabold text-base text-slate-900 leading-snug">
                              {ragazzo.nome} {ragazzo.cognome}
                            </h3>
                            <p className="text-xs font-semibold text-slate-500">
                              {hasDebt ? `${debt.pendenzeCount} pendenze` : '0 pendenze'}
                            </p>
                          </div>
                        </div>

                        {/* Top Right Debt Badge */}
                        <div className="text-right">
                          <span className={cn(
                            "text-lg font-black tabular-nums block leading-none",
                            hasDebt ? "text-rose-600" : "text-emerald-600"
                          )}>
                            €{debt.totalDebt.toFixed(2)}
                          </span>
                          <span className={cn(
                            "text-[10px] font-bold uppercase tracking-wider block mt-1",
                            hasDebt ? "text-rose-500" : "text-emerald-600"
                          )}>
                            {hasDebt ? 'Da pagare' : 'In regola'}
                          </span>
                        </div>
                      </div>

                      {/* Dettaglio Pendenze (Eventi, Quote, Censimento) */}
                      {hasDebt && (
                        <div className="border-t border-slate-100 pt-3 space-y-1.5 text-xs text-slate-600">
                          {debt.unpaidEventDetails.length > 0 && (
                            <div className="flex items-center justify-between text-slate-700">
                              <span className="flex items-center gap-1.5 font-medium">
                                <Calendar className="h-3.5 w-3.5 text-blue-600" /> Eventi:
                              </span>
                              <span className="font-bold tabular-nums">€{debt.eventiDebt.toFixed(2)}</span>
                            </div>
                          )}

                          {debt.unpaidMonths.length > 0 && (
                            <div className="flex items-center justify-between text-slate-700">
                              <span className="flex items-center gap-1.5 font-medium">
                                <CreditCard className="h-3.5 w-3.5 text-emerald-600" /> Quote ({debt.unpaidMonths.length} mesi):
                              </span>
                              <span className="font-bold tabular-nums">€{debt.quoteDebt.toFixed(2)}</span>
                            </div>
                          )}

                          {debt.censimentoDue && (
                            <div className="flex items-center justify-between text-slate-700">
                              <span className="flex items-center gap-1.5 font-medium">
                                <Shield className="h-3.5 w-3.5 text-amber-600" /> Censimento:
                              </span>
                              <span className="font-bold tabular-nums">€{debt.censimentoCost.toFixed(2)}</span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Pulsanti Azione Tattili */}
                      <div className="pt-2 grid grid-cols-1 gap-2">
                        {hasDebt ? (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openGestisciModal(ragazzo)}
                              className="w-full h-10 text-xs font-bold text-sky-600 border-sky-300 hover:bg-sky-50 rounded-xl gap-1.5"
                            >
                              <CreditCard className="h-4 w-4 text-sky-600" /> Gestisci Pagamenti
                            </Button>

                            <Button
                              size="sm"
                              disabled={isBoyLoading}
                              onClick={() => handleSaldaTutto(ragazzo)}
                              className="w-full h-11 text-xs font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-md gap-1.5 active:scale-95 transition-all"
                            >
                              {isBoyLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <CheckCircle2 className="h-4 w-4" /> Salda Tutto
                                </>
                              )}
                            </Button>
                          </>
                        ) : (
                          <div className="w-full py-2 bg-emerald-50 text-emerald-700 rounded-xl text-center text-xs font-bold border border-emerald-200 flex items-center justify-center gap-1.5">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Esploratore in Regola
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal / Bottom-Sheet Gestisci Pagamenti Puntuali */}
      {selectedBoyForModal && (
        <Dialog open={!!selectedBoyForModal} onOpenChange={(open) => !open && setSelectedBoyForModal(null)}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto bg-white text-slate-900 rounded-2xl p-6">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-sky-600" /> Gestisci Pendenze per {selectedBoyForModal.nome} {selectedBoyForModal.cognome}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-3">
              {/* Sezione Censimento */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                  <Checkbox 
                    checked={modalSelections.censimento} 
                    onCheckedChange={(c) => setModalSelections(prev => ({ ...prev, censimento: c === true }))}
                  />
                  <span>Censimento Annuale (€{selectedBoyForModal.importo_censimento ?? quotaCensimentoStandard})</span>
                </label>
              </div>

              {/* Sezione Mesi Non Saldati */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <span className="text-xs font-bold text-slate-800 block">Quote Mensili Arretrate (€{quotaMensileStandard}/mese)</span>
                <div className="grid grid-cols-3 gap-1.5 pt-1">
                  {activeMonths.map(m => {
                    const isUnpaid = modalSelections.months.includes(m)
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => {
                          setModalSelections(prev => ({
                            ...prev,
                            months: isUnpaid ? prev.months.filter(x => x !== m) : [...prev.months, m]
                          }))
                        }}
                        className={cn(
                          "px-2 py-1.5 rounded-lg text-[11px] font-bold border transition-colors",
                          isUnpaid 
                            ? "bg-rose-100 text-rose-800 border-rose-300" 
                            : "bg-emerald-100 text-emerald-800 border-emerald-300"
                        )}
                      >
                        {MONTH_LABELS[m]} {isUnpaid ? '❌' : '✓'}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Sezione Eventi */}
              {eventi.length > 0 && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <span className="text-xs font-bold text-slate-800 block">Uscite ed Eventi Reparto</span>
                  <div className="space-y-1.5 pt-1">
                    {eventi.map(ev => {
                      const isUnpaid = modalSelections.eventi.includes(ev.id)
                      return (
                        <label key={ev.id} className="flex items-center justify-between p-2 rounded-lg bg-white border border-slate-200 text-xs cursor-pointer">
                          <div className="flex items-center gap-2">
                            <Checkbox 
                              checked={isUnpaid}
                              onCheckedChange={(c) => {
                                setModalSelections(prev => ({
                                  ...prev,
                                  eventi: c === true ? [...prev.eventi, ev.id] : prev.eventi.filter(x => x !== ev.id)
                                }))
                              }}
                            />
                            <span className="font-semibold text-slate-800">{ev.nome_evento}</span>
                          </div>
                          <span className="font-bold text-blue-600">€{ev.quota_standard}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setSelectedBoyForModal(null)} className="h-10 text-xs rounded-xl">
                Annulla
              </Button>
              <Button size="sm" onClick={handleSaveModalSelections} className="h-10 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl">
                Salva Modifiche
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
