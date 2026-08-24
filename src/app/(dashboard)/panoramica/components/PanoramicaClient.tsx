'use client'

import React, { useState, useEffect } from 'react'
import { Database } from '@/types/database.types'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { 
  MessageCircle, 
  CheckSquare, 
  CheckCheck, 
  Loader2, 
  Calendar, 
  Users,
  CheckCircle2,
  Clock,
  XCircle,
  Banknote,
  Landmark,
  ShieldCheck,
  Compass
} from 'lucide-react'
import { createBrowserClient } from '@supabase/ssr'
import { toast } from 'sonner'
import { normalizeAnnoScout } from '@/lib/utils/payment'

type Ragazzo = Database['public']['Tables']['ragazzi']['Row']
type Evento = Database['public']['Tables']['eventi']['Row']
type Partecipazione = Database['public']['Tables']['partecipazioni_eventi']['Row']
type Quota = Database['public']['Tables']['quote_mensili']['Row']
type Pattuglia = Database['public']['Tables']['pattuglie']['Row']

const MONTH_ORDER = ['novembre', 'dicembre', 'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno']

const getCurrentScoutMonthIndex = () => {
  const m = new Date().getMonth()
  if (m === 10) return 0
  if (m === 11) return 1
  if (m === 0) return 2
  if (m === 1) return 3
  if (m === 2) return 4
  if (m === 3) return 5
  if (m === 4) return 6
  if (m === 5) return 7
  return 7
}

export function PanoramicaClient({
  initialRagazzi,
  eventi,
  partecipazioni,
  quote,
  pattuglie,
  quotaMensileStandard,
  initialQuotaCensimento,
  quotaCensimentoFratelli = '35',
  currentYear
}: {
  initialRagazzi: Ragazzo[]
  eventi: Evento[]
  partecipazioni: Partecipazione[]
  quote: Quota[]
  pattuglie: Pattuglia[]
  quotaMensileStandard: string
  initialQuotaCensimento: string
  quotaCensimentoFratelli?: string
  currentYear: string
}) {
  const supabase = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [ragazzi, setRagazzi] = useState<Ragazzo[]>(initialRagazzi)
  const [quoteState, setQuoteState] = useState<Quota[]>(quote)
  const [partecipazioniState, setPartecipazioniState] = useState<Partecipazione[]>(partecipazioni)
  const [filtroPattuglia, setFiltroPattuglia] = useState<string>('TUTTE')
  const [isProcessing, setIsProcessing] = useState<string | null>(null)

  useEffect(() => {
    const channel = supabase
      .channel('panoramica_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ragazzi' }, (payload) => {
        if (payload.eventType === 'UPDATE') {
          const updated = payload.new as Ragazzo
          setRagazzi(prev => prev.map(r => r.id === updated.id ? updated : r))
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quote_mensili' }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const updated = payload.new as Quota
          setQuoteState(prev => {
            const filtered = prev.filter(q => q.id !== updated.id)
            return [...filtered, updated]
          })
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'partecipazioni_eventi' }, (payload) => {
        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const updated = payload.new as Partecipazione
          setPartecipazioniState(prev => {
            const filtered = prev.filter(p => p.id !== updated.id)
            return [...filtered, updated]
          })
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase])

  type RagazzoSelection = { censimento: boolean, months: string[], eventi: string[] }
  const [selections, setSelections] = useState<Record<string, RagazzoSelection>>({})

  const quotaMensileNum = Number(quotaMensileStandard) || 0
  const quotaCensimentoNum = Number(initialQuotaCensimento) || 0
  const elapsedMonths = MONTH_ORDER.slice(0, getCurrentScoutMonthIndex() + 1)

  const toggleCensimento = (ragazzoId: string) => {
    setSelections(prev => {
      const curr = prev[ragazzoId] || { censimento: false, months: [], eventi: [] }
      return { ...prev, [ragazzoId]: { ...curr, censimento: !curr.censimento } }
    })
  }

  const toggleMonth = (ragazzoId: string, month: string) => {
    setSelections(prev => {
      const curr = prev[ragazzoId] || { censimento: false, months: [], eventi: [] }
      const newMonths = curr.months.includes(month) ? curr.months.filter(m => m !== month) : [...curr.months, month]
      return { ...prev, [ragazzoId]: { ...curr, months: newMonths } }
    })
  }

  const toggleEvento = (ragazzoId: string, eventoId: string) => {
    setSelections(prev => {
      const curr = prev[ragazzoId] || { censimento: false, months: [], eventi: [] }
      const newEventi = curr.eventi.includes(eventoId) ? curr.eventi.filter(e => e !== eventoId) : [...curr.eventi, eventoId]
      return { ...prev, [ragazzoId]: { ...curr, eventi: newEventi } }
    })
  }

  const selectAllRagazzo = (ragazzoId: string, missingCensimento: boolean, unpaidMonths: string[], unpaidEventi: string[]) => {
    setSelections(prev => ({
      ...prev,
      [ragazzoId]: { censimento: missingCensimento, months: unpaidMonths, eventi: unpaidEventi }
    }))
  }

  const saldaRagazzo = async (
    ragazzoId: string, 
    method: 'Contanti'|'Bonifico', 
    eventiDataMap: Record<string, { nome: string, quota: number }>,
    customSelection?: RagazzoSelection
  ) => {
    const sel = customSelection || selections[ragazzoId]
    if (!sel || (!sel.censimento && sel.months.length === 0 && sel.eventi.length === 0)) return

    setIsProcessing(ragazzoId)
    const ragazzo = ragazzi.find(r => r.id === ragazzoId)
    const dateStr = new Date().toISOString().split('T')[0]

    try {
      if (sel.censimento) {
        setRagazzi(prev => prev.map(r => r.id === ragazzoId ? { ...r, quota_censimento: true } : r))
        await supabase.from('ragazzi').update({ quota_censimento: true } as unknown as Database['public']['Tables']['ragazzi']['Update']).eq('id', ragazzoId)
      }

      if (sel.months.length > 0) {
        setQuoteState(prev => {
          const normCurrent = normalizeAnnoScout(currentYear)
          const existing = prev.find(q => q.ragazzo_id === ragazzoId && normalizeAnnoScout(q.anno_scout) === normCurrent)
          if (existing) {
            const updated = { ...existing } as Record<string, unknown>
            sel.months.forEach(m => updated[m] = true)
            return prev.map(q => q.ragazzo_id === ragazzoId ? (updated as Quota) : q)
          } else {
            const newRecord = { ragazzo_id: ragazzoId, anno_scout: currentYear } as Record<string, unknown>
            sel.months.forEach(m => newRecord[m] = true)
            return [...prev, newRecord as Quota]
          }
        })

        const updatesForSupabase = sel.months.reduce((acc, m) => ({ ...acc, [m]: true }), {})
        const { data: quoteData } = await supabase.from('quote_mensili')
          .upsert({ ragazzo_id: ragazzoId, anno_scout: currentYear, ...updatesForSupabase } as unknown as Database['public']['Tables']['quote_mensili']['Insert'], { onConflict: 'ragazzo_id,anno_scout' })
          .select('id').single()

        if (quoteData) {
          for (const month of sel.months) {
            await supabase.from('registro_spese').insert({
              importo: quotaMensileNum,
              metodo: method,
              voce_spesa: 'Quota Mensile',
              tipo_movimento: 'ENTRATA',
              data: dateStr,
              ragazzo_id: ragazzoId,
              quota_mensile_id: quoteData.id,
              riferimento_quota: month,
              note: `Quota ${month.substring(0,3).toUpperCase()} - ${ragazzo?.nome} ${ragazzo?.cognome}`
            })
          }
        }
      }

      if (sel.eventi.length > 0) {
        setPartecipazioniState(prev => prev.map(p => 
          (p.ragazzo_id === ragazzoId && p.evento_id != null && sel.eventi.includes(p.evento_id)) ? { ...p, riscosso: true, metodo_pagamento: method } : p
        ))

        for (const evId of sel.eventi) {
          const evData = eventiDataMap[evId]
          await fetch('/api/uscite/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ragazziIds: [ragazzoId],
              eventoId: evId,
              riscosso: true,
              metodoPagamento: method,
              quotaDovuta: evData?.quota
            })
          })
        }
      }

      setSelections(prev => ({ ...prev, [ragazzoId]: { censimento: false, months: [], eventi: [] } }))
      toast.success(`Quote saldate con successo per ${ragazzo?.nome}!`)
    } catch (err: unknown) {
      console.error(err)
      toast.error("Errore durante il salvataggio del saldo")
    } finally {
      setIsProcessing(null)
    }
  }

  const saldaTuttoRagazzo = (
    ragazzoId: string, 
    missingCensimento: boolean, 
    unpaidMonths: string[], 
    unpaidEventsData: { id: string, nome: string, quota: number }[],
    method: 'Contanti'|'Bonifico'
  ) => {
    const fullSelection: RagazzoSelection = {
      censimento: missingCensimento,
      months: unpaidMonths,
      eventi: unpaidEventsData.map(e => e.id)
    }
    const map = unpaidEventsData.reduce((acc, ev) => ({ ...acc, [ev.id]: { nome: ev.nome, quota: ev.quota } }), {})
    saldaRagazzo(ragazzoId, method, map, fullSelection)
  }

  const ragazziFiltrati = filtroPattuglia === 'TUTTE' 
    ? ragazzi 
    : ragazzi.filter(r => r.pattuglia === filtroPattuglia)

  const prossimaUscita = eventi.length > 0 ? eventi[0] : null
  const prossimePartecipazioni = prossimaUscita 
    ? partecipazioniState.filter(p => p.evento_id === prossimaUscita.id)
    : []
  const presentiConfermati = prossimePartecipazioni.filter(p => p.stato_presenza === 'Presente').length
  const pendolariConfermati = prossimePartecipazioni.filter(p => p.stato_presenza === 'Pendolare').length

  const totalBoys = ragazzi.length
  let inRegolaCount = 0
  let totaleDebitoGenerale = 0

  ragazzi.forEach(r => {
    const normCurrent = normalizeAnnoScout(currentYear)
    const boyQuotes = quoteState.filter(q => q.ragazzo_id === r.id && normalizeAnnoScout(q.anno_scout) === normCurrent)
    const isMonthPaid = (m: string) => boyQuotes.some(q => (q as Record<string, unknown>)[m] === true)
    const unpaidMonths = elapsedMonths.filter(m => !isMonthPaid(m))
    const missingCensimento = !r.quota_censimento
    const unpaidEventsParts = partecipazioniState.filter(p => 
      p.ragazzo_id === r.id && (p.stato_presenza === 'Presente' || p.stato_presenza === 'Pendolare') && !p.riscosso
    )
    
    let deb = unpaidMonths.length * quotaMensileNum + (missingCensimento ? (Number(r.importo_censimento) || quotaCensimentoNum) : 0)
    unpaidEventsParts.forEach(p => {
      const ev = eventi.find(e => e.id === p.evento_id)
      deb += p.quota_dovuta || ev?.quota_standard || 0
    })

    if (deb === 0) inRegolaCount++
    totaleDebitoGenerale += deb
  })

  const percentualeInRegola = totalBoys > 0 ? Math.round((inRegolaCount / totalBoys) * 100) : 100

  return (
    <div className="space-y-6">
      {/* Bento Grid Header Widgets */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        
        {/* Widget 1: Prossima Uscita / Evento */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs hover:shadow-sm transition-all flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Calendar className="h-24 w-24 text-agesci-blue" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-agesci-blue uppercase tracking-wider bg-sky-50 px-2.5 py-1 rounded-full border border-sky-100 flex items-center gap-1">
                <Calendar className="h-3 w-3 text-agesci-blue" /> Prossima Uscita
              </span>
              <span className="text-xs text-slate-500 font-medium">
                {prossimaUscita?.data_inizio ? new Date(prossimaUscita.data_inizio).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' }) : 'Da programmare'}
              </span>
            </div>
            <h3 className="text-lg font-heading font-bold text-slate-900 mt-1 line-clamp-1">
              {prossimaUscita?.nome_evento || 'Nessuna Uscita Imminente'}
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Quota: <span className="font-bold text-slate-800 tabular-nums">€{prossimaUscita?.quota_standard || 0}</span>
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                <CheckCircle2 className="h-3 w-3 text-emerald-600" /> {presentiConfermati} Presenti
              </span>
              {pendolariConfermati > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                  <Clock className="h-3 w-3 text-amber-600" /> {pendolariConfermati} Pendolari
                </span>
              )}
            </div>
            <Button size="sm" variant="ghost" className="h-7 text-xs text-agesci-blue font-semibold hover:bg-sky-50" onClick={() => window.location.href = '/uscite'}>
              Vedi Uscite →
            </Button>
          </div>
        </div>

        {/* Widget 2: Stato Quote & Debiti */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-2xs hover:shadow-sm transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100 flex items-center gap-1">
                <ShieldCheck className="h-3 w-3 text-emerald-600" /> Quote Reparto
              </span>
              <span className="text-xs font-bold text-emerald-700 tabular-nums">
                {percentualeInRegola}% In Regola
              </span>
            </div>
            <div className="flex items-baseline justify-between mt-2">
              <div>
                <span className="text-2xl font-bold text-slate-900 tabular-nums">{inRegolaCount}</span>
                <span className="text-xs text-slate-500 ml-1">/ {totalBoys} ragazzi saldati</span>
              </div>
              <span className="text-xs font-bold text-rose-600 tabular-nums bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                Mancanti: €{totaleDebitoGenerale}
              </span>
            </div>
            
            <div className="w-full bg-slate-100 rounded-full h-2.5 mt-3 overflow-hidden">
              <div 
                className="bg-emerald-600 h-2.5 rounded-full transition-all duration-500" 
                style={{ width: `${percentualeInRegola}%` }}
              />
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-500">
              {totalBoys - inRegolaCount} ragazzi con quote sospese
            </span>
            <Button 
              size="sm" 
              className="h-7 text-xs bg-[#25D366] hover:bg-[#1DA851] text-white font-medium shadow-2xs"
              onClick={() => {
                const text = `Ciao! Promemoria per il saldo delle quote scout del Reparto. Grazie!`
                window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
              }}
            >
              <MessageCircle className="w-3.5 h-3.5 mr-1" /> Promemoria WhatsApp
            </Button>
          </div>
        </div>

        {/* Widget 3: Quick Stats & Anno Scout */}
        <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-agesci-blue to-agesci-blue-light text-white p-5 shadow-2xs hover:shadow-sm transition-all flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-scout-gold uppercase tracking-wider bg-white/10 px-2.5 py-1 rounded-full border border-white/10 backdrop-blur-xs flex items-center gap-1">
                <Compass className="h-3 w-3 text-scout-gold" /> Anno Scout {currentYear}
              </span>
              <Users className="h-5 w-5 text-scout-gold" />
            </div>
            <h3 className="text-xl font-heading font-bold text-white mt-3">
              Panoramica Reparto
            </h3>
            <p className="text-xs text-slate-200 mt-1 leading-relaxed">
              Controllo rapido delle morosità, quote mensili e censimenti per l&apos;anno in corso.
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-white/15 flex items-center justify-between text-xs text-slate-200">
            <span>Pattuglie attive: <strong className="text-white font-bold">{pattuglie.length}</strong></span>
            <span>Ragazzi: <strong className="text-white font-bold">{totalBoys}</strong></span>
          </div>
        </div>

      </div>

      {/* Accordion / Table Navigation Tabs */}
      <Tabs defaultValue="ragazzo" className="w-full">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <TabsList className="bg-slate-100 p-1 rounded-xl">
            <TabsTrigger value="ragazzo" className="rounded-lg text-xs font-semibold px-4 py-2">Per Ragazzo</TabsTrigger>
            <TabsTrigger value="evento" className="rounded-lg text-xs font-semibold px-4 py-2">Per Evento / Mese</TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Label className="text-xs font-semibold text-slate-600 whitespace-nowrap">Pattuglia:</Label>
            <Select value={filtroPattuglia} onValueChange={(v) => setFiltroPattuglia(v || 'TUTTE')}>
              <SelectTrigger className="h-9 text-xs bg-white border-slate-200 rounded-xl min-w-[160px]">
                <SelectValue placeholder="Tutte le pattuglie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TUTTE">Tutte le pattuglie</SelectItem>
                {pattuglie.map(p => (
                  <SelectItem key={p.id} value={p.nome}>{p.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Tab Content 1: Per Ragazzo */}
        <TabsContent value="ragazzo" className="space-y-4">
          <Accordion type="multiple" className="w-full space-y-3">
            {ragazziFiltrati.map((ragazzoItem) => {
              const ragazzo = ragazzoItem as any
              const normCurrent = normalizeAnnoScout(currentYear)
              const boyQuotes = quoteState.filter(q => q.ragazzo_id === ragazzo.id && normalizeAnnoScout(q.anno_scout) === normCurrent)
              
              const isMonthPaid = (m: string) => boyQuotes.some(q => (q as Record<string, unknown>)[m] === true)
              const unpaidMonths = elapsedMonths.filter(m => !isMonthPaid(m))

              const unpaidEventsParts = partecipazioniState.filter(p => 
                p.ragazzo_id === ragazzo.id && 
                (p.stato_presenza === 'Presente' || p.stato_presenza === 'Pendolare') && 
                !p.riscosso
              )

              const missingCensimento = !ragazzo.quota_censimento
              const quotaCensimentoRagazzo = (ragazzo.importo_censimento !== null && ragazzo.importo_censimento !== undefined && Number(ragazzo.importo_censimento) > 0)
                ? Number(ragazzo.importo_censimento)
                : quotaCensimentoNum

              let totaleDebito = (unpaidMonths.length * quotaMensileNum) + (missingCensimento ? quotaCensimentoRagazzo : 0)
              
              const unpaidEventsData = unpaidEventsParts.map(p => {
                const ev = eventi.find(e => e.id === p.evento_id)
                const quota = p.quota_dovuta || ev?.quota_standard || 0
                totaleDebito += quota
                return { id: p.evento_id || p.id, nome: ev?.nome_evento || 'Evento Sconosciuto', quota }
              })

              if (totaleDebito === 0) {
                return (
                  <div key={ragazzo.id} className="flex items-center justify-between p-4 border border-slate-200/70 rounded-2xl bg-white shadow-2xs opacity-80">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-xs">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      </div>
                      <div>
                        <span className="font-semibold text-slate-900">{ragazzo.nome} {ragazzo.cognome}</span>
                        <span className="ml-2 text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">{ragazzo.pattuglia || 'Senza pattuglia'}</span>
                      </div>
                    </div>
                    <Badge variant="secondary" className="bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold">
                      In regola (€0)
                    </Badge>
                  </div>
                )
              }

              const waVoci: string[] = []
              if (missingCensimento) waVoci.push(`- Quota Censimento: €${quotaCensimentoRagazzo}`)
              if (unpaidMonths.length > 0) waVoci.push(`- Quote mensili (${unpaidMonths.map(m => m.substring(0,3).toUpperCase()).join(', ')}): €${unpaidMonths.length * quotaMensileNum}`)
              if (unpaidEventsData.length > 0) {
                unpaidEventsData.forEach(e => waVoci.push(`- ${e.nome}: €${e.quota}`))
              }

              const waText = `Ciao! Ti mando un rapido riepilogo delle quote scout in sospeso per ${ragazzo.nome}:\n`
                + waVoci.join('\n') + `\n\nTotale da saldare: €${totaleDebito}\nGrazie!`

              const phone = ragazzo.genitore_1_telefono || ragazzo.genitore_2_telefono || ragazzo.telefono_ragazzo || ''
              const waUrl = phone 
                ? `https://wa.me/${phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(waText)}`
                : `https://wa.me/?text=${encodeURIComponent(waText)}`

              const sel = selections[ragazzo.id] || { censimento: false, months: [], eventi: [] }
              const isCurrentProcessing = isProcessing === ragazzo.id

              return (
                <AccordionItem key={ragazzo.id} value={ragazzo.id} className="border border-slate-200/80 rounded-2xl bg-white px-2 overflow-hidden shadow-2xs hover:shadow-sm transition-shadow">
                  <AccordionTrigger className="hover:no-underline py-3 px-3">
                    <div className="flex flex-1 items-center justify-between mr-4">
                      <div className="flex flex-col items-start">
                        <span className="font-semibold text-base text-slate-900">{ragazzo.nome} {ragazzo.cognome}</span>
                        <span className="text-xs text-slate-500 font-medium">{ragazzo.pattuglia || 'Pattuglia non assegnata'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="destructive" className="text-xs font-bold px-3 py-1 bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 tabular-nums">
                          Debito Residuo: €{totaleDebito}
                        </Badge>
                      </div>
                    </div>
                  </AccordionTrigger>
                  
                  <AccordionContent className="bg-slate-50/60 -mx-2 px-4 py-4 border-t border-slate-100 space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/60 pb-3">
                      <div className="flex flex-wrap gap-2">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          className="h-8 text-xs bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                          onClick={() => selectAllRagazzo(ragazzo.id, missingCensimento, unpaidMonths, unpaidEventsData.map(e => e.id))}
                        >
                          <CheckSquare className="w-3.5 h-3.5 mr-1.5 text-agesci-blue" /> Seleziona Tutti
                        </Button>
                        
                        <Button
                          size="sm"
                          disabled={isCurrentProcessing}
                          onClick={() => saldaTuttoRagazzo(ragazzo.id, missingCensimento, unpaidMonths, unpaidEventsData, 'Contanti')}
                          className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-2xs"
                        >
                          {isCurrentProcessing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5 mr-1" />}
                          Salda tutto (<Banknote className="h-3.5 w-3.5 inline mr-1" /> Contanti)
                        </Button>

                        <Button
                          size="sm"
                          disabled={isCurrentProcessing}
                          onClick={() => saldaTuttoRagazzo(ragazzo.id, missingCensimento, unpaidMonths, unpaidEventsData, 'Bonifico')}
                          className="h-8 text-xs bg-agesci-blue hover:bg-agesci-blue-light text-white font-medium shadow-2xs"
                        >
                          {isCurrentProcessing ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5 mr-1" />}
                          Salda tutto (<Landmark className="h-3.5 w-3.5 inline mr-1" /> Bonifico)
                        </Button>
                      </div>

                      <Button 
                        size="sm"
                        onClick={() => window.open(waUrl, '_blank')}
                        className="h-8 text-xs bg-[#25D366] hover:bg-[#1DA851] text-white font-medium shadow-2xs"
                      >
                        <MessageCircle className="w-3.5 h-3.5 mr-1.5" /> Promemoria WhatsApp
                      </Button>
                    </div>

                    <div className="space-y-3">
                      {missingCensimento && (
                        <div className="space-y-1.5">
                          <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Censimento</h4>
                          <div 
                            className="flex items-center space-x-3 bg-white p-3 rounded-xl border border-slate-200 cursor-pointer hover:border-agesci-blue/40 transition-colors shadow-2xs"
                            onClick={() => toggleCensimento(ragazzo.id)}
                          >
                            <Checkbox checked={sel.censimento} onCheckedChange={() => toggleCensimento(ragazzo.id)} className="touch-min" />
                            <div className="flex-1 flex justify-between items-center text-sm">
                              <span className="font-medium text-slate-800">Quota Annuale Censimento</span>
                              <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const val = Number(initialQuotaCensimento) || 45
                                    setRagazzi(prev => prev.map(r => r.id === ragazzo.id ? { ...r, importo_censimento: val } : r))
                                    await supabase.from('ragazzi').update({ importo_censimento: val } as unknown as Database['public']['Tables']['ragazzi']['Update']).eq('id', ragazzo.id)
                                  }}
                                  className={`text-[10px] px-2 py-1 rounded-md border font-semibold transition-colors ${
                                    (ragazzo.importo_censimento === null || ragazzo.importo_censimento === undefined || Number(ragazzo.importo_censimento) === (Number(initialQuotaCensimento) || 45))
                                      ? 'bg-emerald-600 text-white border-emerald-600'
                                      : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-200'
                                  }`}
                                >
                                  Std €{initialQuotaCensimento || '45'}
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const val = Number(quotaCensimentoFratelli) || 35
                                    setRagazzi(prev => prev.map(r => r.id === ragazzo.id ? { ...r, importo_censimento: val } : r))
                                    await supabase.from('ragazzi').update({ importo_censimento: val } as unknown as Database['public']['Tables']['ragazzi']['Update']).eq('id', ragazzo.id)
                                  }}
                                  className={`text-[10px] px-2 py-1 rounded-md border font-semibold transition-colors ${
                                    (Number(ragazzo.importo_censimento) === (Number(quotaCensimentoFratelli) || 35))
                                      ? 'bg-amber-600 text-white border-amber-600'
                                      : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-200'
                                  }`}
                                >
                                  Fratello €{quotaCensimentoFratelli || '35'}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {unpaidMonths.length > 0 && (
                        <div className="space-y-1.5">
                          <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Quote Mensili Non Pagate</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {unpaidMonths.map(m => (
                              <div 
                                key={m} 
                                className="flex items-center space-x-3 bg-white p-3 rounded-xl border border-slate-200 cursor-pointer hover:border-agesci-blue/40 transition-colors shadow-2xs"
                                onClick={() => toggleMonth(ragazzo.id, m)}
                              >
                                <Checkbox checked={sel.months.includes(m)} onCheckedChange={() => toggleMonth(ragazzo.id, m)} className="touch-min" />
                                <div className="flex-1 flex justify-between items-center text-sm">
                                  <span className="font-medium text-slate-800 capitalize">Quota {m}</span>
                                  <span className="font-bold text-slate-700 tabular-nums">€{quotaMensileNum}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {unpaidEventsData.length > 0 && (
                        <div className="space-y-1.5">
                          <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Uscite / Eventi Non Pagati</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {unpaidEventsData.map(ev => (
                              <div 
                                key={ev.id} 
                                className="flex items-center space-x-3 bg-white p-3 rounded-xl border border-slate-200 cursor-pointer hover:border-agesci-blue/40 transition-colors shadow-2xs"
                                onClick={() => toggleEvento(ragazzo.id, ev.id)}
                              >
                                <Checkbox checked={sel.eventi.includes(ev.id)} onCheckedChange={() => toggleEvento(ragazzo.id, ev.id)} className="touch-min" />
                                <div className="flex-1 flex justify-between items-center text-sm">
                                  <span className="font-medium text-slate-800 line-clamp-1">{ev.nome}</span>
                                  <span className="font-bold text-slate-700 tabular-nums">€{ev.quota}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                  </AccordionContent>
                </AccordionItem>
              )
            })}
          </Accordion>
        </TabsContent>

        <TabsContent value="evento" className="space-y-4">
          <div className="p-5 border border-slate-200/80 rounded-2xl bg-white shadow-2xs space-y-4">
            <h3 className="text-sm font-heading font-bold text-slate-900 uppercase tracking-wider">Visualizzazione aggregata per Evento</h3>
            <p className="text-xs text-slate-500">Seleziona un evento per consultare la matrice delle morosità o saldare in blocco.</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
