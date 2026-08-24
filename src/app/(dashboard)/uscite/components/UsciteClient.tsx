'use client'

import { useState, useEffect } from 'react'
import { Database } from '@/types/database.types'
import { createBrowserClient } from '@supabase/ssr'
import { toCanonicalMetodo } from '@/lib/utils/payment'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { TableRow, TableCell } from '@/components/ui/table'
import { Settings2, Plus, Pencil, Trash2, CheckCheck, XCircle, CheckCircle2, Wallet } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useRouter } from 'next/navigation'

type Evento = Database['public']['Tables']['eventi']['Row']
type Ragazzo = Database['public']['Tables']['ragazzi']['Row']
type Partecipazione = Database['public']['Tables']['partecipazioni_eventi']['Row']

export default function UsciteClient({ 
  initialEventi, 
  ragazzi: initialRagazzi, 
  initialPartecipazioni 
}: { 
  initialEventi: Evento[],
  ragazzi: Ragazzo[],
  initialPartecipazioni: Partecipazione[]
}) {
  const router = useRouter()
  const [eventi, setEventi] = useState<Evento[]>(initialEventi)
  const [ragazzi] = useState<Ragazzo[]>(initialRagazzi)
  const [partecipazioni, setPartecipazioni] = useState<Partecipazione[]>(initialPartecipazioni)
  const [filtroPattuglia, setFiltroPattuglia] = useState<string>('Tutte')
  const [isBulkLoading, setIsBulkLoading] = useState(false)
  
  const [isEventiOpen, setIsEventiOpen] = useState(false)
  const [editingEvento, setEditingEvento] = useState<Evento | null>(null)
  const [formData, setFormData] = useState({
    nome_evento: '',
    quota_standard: '',
    tipo_evento: 'CI',
    data_inizio: '',
    metodo_pagamento: 'Contanti'
  })

  const supabase = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Subiscrizione Supabase Realtime in tempo reale per Eventi e Partecipazioni
  useEffect(() => {
    const channel = supabase
      .channel('uscite_realtime_sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'partecipazioni_eventi' },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const updated = payload.new as Partecipazione
            setPartecipazioni(prev => {
              const filtered = prev.filter(p => !(p.ragazzo_id === updated.ragazzo_id && p.evento_id === updated.evento_id))
              return [...filtered, updated]
            })
          } else if (payload.eventType === 'DELETE') {
            const deleted = payload.old as Partecipazione
            setPartecipazioni(prev => prev.filter(p => p.id !== deleted.id))
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'eventi' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newEv = payload.new as Evento
            setEventi(prev => prev.some(e => e.id === newEv.id) ? prev : [...prev, newEv])
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Evento
            setEventi(prev => prev.map(e => e.id === updated.id ? updated : e))
          } else if (payload.eventType === 'DELETE') {
            const deleted = payload.old as Evento
            setEventi(prev => prev.filter(e => e.id !== deleted.id))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase])

  // Helper per l'upsert sicuro su Supabase con fallback automatico per i vincoli di stato_presenza
  const upsertPartecipazioneDB = async (payload: {
    ragazzo_id: string
    evento_id: string
    stato_presenza: string
    riscosso: boolean
    metodo_pagamento: string | null
    quota_dovuta: number | null
  }) => {
    // 1. Verifica se esiste già un record per questo ragazzo ed evento
    const { data: existing } = await supabase
      .from('partecipazioni_eventi')
      .select('id')
      .eq('ragazzo_id', payload.ragazzo_id)
      .eq('evento_id', payload.evento_id)
      .maybeSingle()

    let data: { id: string } | null = null
    let error: { code?: string; message?: string; details?: string } | null = null

    if (existing?.id) {
      const res = await supabase
        .from('partecipazioni_eventi')
        .update(payload as Database['public']['Tables']['partecipazioni_eventi']['Update'])
        .eq('id', existing.id)
        .select('id')
      data = res.data?.[0] || null
      error = res.error
    } else {
      const res = await supabase
        .from('partecipazioni_eventi')
        .insert(payload as Database['public']['Tables']['partecipazioni_eventi']['Insert'])
        .select('id')
      data = res.data?.[0] || null
      error = res.error
    }

    // 2. Se c'è un vincolo check su stato_presenza o metodo_pagamento (23514), riprova in MAIUSCOLO
    if (error && (error.code === '23514' || error.message?.includes('stato_presenza') || error.message?.includes('metodo'))) {
      const retryPayload = { 
        ...payload, 
        stato_presenza: payload.stato_presenza ? payload.stato_presenza.toUpperCase() : 'PRESENTE',
        metodo_pagamento: payload.metodo_pagamento ? payload.metodo_pagamento.toUpperCase() : 'CONTANTI'
      }
      if (existing?.id) {
        const retry = await supabase
          .from('partecipazioni_eventi')
          .update(retryPayload as Database['public']['Tables']['partecipazioni_eventi']['Update'])
          .eq('id', existing.id)
          .select('id')
        data = retry.data?.[0] || null
        error = retry.error
      } else {
        const retry = await supabase
          .from('partecipazioni_eventi')
          .insert(retryPayload as Database['public']['Tables']['partecipazioni_eventi']['Insert'])
          .select('id')
        data = retry.data?.[0] || null
        error = retry.error
      }
    }    if (error) {
      console.error('Errore durante salvataggio partecipazione:', error.message || error.details || error.code || error)
    }

    // Se data è nullo o l'insert non ha restituito l'id, effettua una refetch immediata su DB per recuperare l'ID
    if (!data?.id) {
      const { data: refetch } = await supabase
        .from('partecipazioni_eventi')
        .select('id')
        .eq('ragazzo_id', payload.ragazzo_id)
        .eq('evento_id', payload.evento_id)
        .maybeSingle()
      if (refetch?.id) {
        data = { id: refetch.id }
      } else if (existing?.id) {
        data = { id: existing.id }
      }
    }

    return { data, error }
  }

  // Helper per l'upsert sicuro su registro_spese
  const upsertSpesaCassaDB = async (payload: {
    importo: number,
    metodo?: string | null,
    voce_spesa: string,
    tipo_movimento?: string,
    data?: string,
    ragazzo_id?: string | null,
    partecipazione_evento_id?: string | null,
    note?: string | null
  }, existingId?: string | null) => {
    const safeMetodo = toCanonicalMetodo(payload.metodo, 'Bonifico')
    const dateStr = payload.data || new Date().toISOString().split('T')[0]

    const spesaObj = {
      importo: payload.importo,
      metodo: safeMetodo,
      voce_spesa: payload.voce_spesa,
      tipo_movimento: payload.tipo_movimento || 'ENTRATA',
      data: dateStr,
      ragazzo_id: payload.ragazzo_id || null,
      partecipazione_evento_id: payload.partecipazione_evento_id || null,
      note: payload.note || null
    }

    let res
    let targetId = existingId
    if (targetId) {
      const { data: checkExist } = await supabase.from('registro_spese').select('id').eq('id', targetId).maybeSingle()
      if (!checkExist?.id) targetId = null
    }

    if (targetId) {
      res = await supabase.from('registro_spese').update(spesaObj).eq('id', targetId).select('id')
    } else {
      res = await supabase.from('registro_spese').insert(spesaObj).select('id')
    }

    // Fallback 1: UPPERCASE ('BONIFICO', 'CONTANTI', 'CARTA')
    if (res.error && (res.error.code === '23514' || res.error.message?.includes('metodo'))) {
      spesaObj.metodo = safeMetodo.toUpperCase() as unknown as 'Contanti' | 'Bonifico' | 'Carta'
      if (targetId) {
        res = await supabase.from('registro_spese').update(spesaObj).eq('id', targetId).select('id')
      } else {
        res = await supabase.from('registro_spese').insert(spesaObj).select('id')
      }
    }

    // Fallback 2: lowercase ('bonifico', 'contanti', 'carta')
    if (res.error && (res.error.code === '23514' || res.error.message?.includes('metodo'))) {
      spesaObj.metodo = safeMetodo.toLowerCase() as unknown as 'Contanti' | 'Bonifico' | 'Carta'
      if (targetId) {
        res = await supabase.from('registro_spese').update(spesaObj).eq('id', targetId).select('id')
      } else {
        res = await supabase.from('registro_spese').insert(spesaObj).select('id')
      }
    }

    // Fallback 3: null
    if (res.error && (res.error.code === '23514' || res.error.message?.includes('metodo'))) {
      spesaObj.metodo = null as unknown as 'Contanti' | 'Bonifico' | 'Carta'
      if (targetId) {
        res = await supabase.from('registro_spese').update(spesaObj).eq('id', targetId).select('id')
      } else {
        res = await supabase.from('registro_spese').insert(spesaObj).select('id')
      }
    }

    if (res.error) {
      console.error("Errore inserimento in cassa:", res.error.message || res.error.details || res.error.code)
    }
  }

  // Helper per aggiornare in modo atomico e coerente il metodo di pagamento di un evento in Cassa, Partecipazioni ed Evento
  const updateRegistroSpeseMetodoPerEvento = async (eventoId: string, nomeEvento: string, metodo: string) => {
    const safeMetodo = toCanonicalMetodo(metodo, 'Bonifico')

    // 1. Aggiorna tabella eventi
    await supabase.from('eventi').update({ metodo_pagamento: safeMetodo }).eq('id', eventoId)

    // 2. Troviamo tutte le partecipazioni dell'evento
    const { data: parts } = await supabase.from('partecipazioni_eventi').select('id').eq('evento_id', eventoId)
    const partIds = (parts || []).map(p => p.id)

    // 3. Aggiorna tutte le partecipazioni con il nuovo metodo
    await supabase.from('partecipazioni_eventi').update({ metodo_pagamento: safeMetodo }).eq('evento_id', eventoId)

    // 4. Aggiorna lo stato locale partecipazioni ed eventi
    setPartecipazioni(prev => prev.map(p => p.evento_id === eventoId ? { ...p, metodo_pagamento: safeMetodo } : p))
    setEventi(prev => prev.map(e => e.id === eventoId ? { ...e, metodo_pagamento: safeMetodo } : e))

    // 5. Aggiorna registro_spese con fallback per vincolo check
    if (partIds.length > 0) {
      let res1 = await supabase.from('registro_spese').update({ metodo: safeMetodo }).in('partecipazione_evento_id', partIds)
      if (res1.error && (res1.error.code === '23514' || res1.error.message?.includes('metodo'))) {
        res1 = await supabase.from('registro_spese').update({ metodo: safeMetodo.toUpperCase() }).in('partecipazione_evento_id', partIds)
      }
      if (res1.error && (res1.error.code === '23514' || res1.error.message?.includes('metodo'))) {
        res1 = await supabase.from('registro_spese').update({ metodo: safeMetodo.toLowerCase() }).in('partecipazione_evento_id', partIds)
      }
      if (res1.error && (res1.error.code === '23514' || res1.error.message?.includes('metodo'))) {
        await supabase.from('registro_spese').update({ metodo: null }).in('partecipazione_evento_id', partIds)
      }
    }

    if (nomeEvento) {
      let res2 = await supabase.from('registro_spese').update({ metodo: safeMetodo }).eq('voce_spesa', `Evento: ${nomeEvento}`)
      if (res2.error && (res2.error.code === '23514' || res2.error.message?.includes('metodo'))) {
        res2 = await supabase.from('registro_spese').update({ metodo: safeMetodo.toUpperCase() }).eq('voce_spesa', `Evento: ${nomeEvento}`)
      }
      if (res2.error && (res2.error.code === '23514' || res2.error.message?.includes('metodo'))) {
        res2 = await supabase.from('registro_spese').update({ metodo: safeMetodo.toLowerCase() }).eq('voce_spesa', `Evento: ${nomeEvento}`)
      }
      if (res2.error && (res2.error.code === '23514' || res2.error.message?.includes('metodo'))) {
        await supabase.from('registro_spese').update({ metodo: null }).eq('voce_spesa', `Evento: ${nomeEvento}`)
      }
    }
  }

  const updatePartecipazione = async (ragazzoId: string, eventoId: string, field: keyof Partecipazione, value: string | boolean | number | null) => {
    const existing = partecipazioni.find(p => p.ragazzo_id === ragazzoId && p.evento_id === eventoId)
    const evento = eventi.find(e => e.id === eventoId)
    
    const newStato = field === 'stato_presenza' ? (value as string) : (existing?.stato_presenza || 'Assente')
    const newRiscosso = field === 'riscosso' ? (value as boolean) : (existing?.riscosso || false)
    const newMetodo = field === 'metodo_pagamento' ? toCanonicalMetodo(value as string) : toCanonicalMetodo(existing?.metodo_pagamento || evento?.metodo_pagamento)
    const newQuota = field === 'quota_dovuta' ? (value as number | null) : (existing?.quota_dovuta ?? null)

    const payloadState: Partecipazione = {
      id: existing?.id || 'temp-' + ragazzoId + '-' + eventoId,
      ragazzo_id: ragazzoId,
      evento_id: eventoId,
      stato_presenza: newStato,
      riscosso: newRiscosso,
      metodo_pagamento: newMetodo,
      quota_dovuta: newQuota,
      scheda_medica_consegnata: existing?.scheda_medica_consegnata || false
    }

    // Optimistic update immediato per reattività UI in tempo reale
    setPartecipazioni((prev) => {
      const filtered = prev.filter(p => !(p.ragazzo_id === ragazzoId && p.evento_id === eventoId))
      return [...filtered, payloadState]
    })

    try {
      const res = await fetch('/api/uscite/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ragazziIds: [ragazzoId],
          eventoId,
          statoPresenza: field === 'stato_presenza' ? (value as string) : undefined,
          riscosso: field === 'riscosso' ? (value as boolean) : undefined,
          metodoPagamento: field === 'metodo_pagamento' ? (value as string) : undefined,
          quotaDovuta: field === 'quota_dovuta' ? (value as number | null) : undefined
        })
      })

      const data = await res.json()
      if (data.updatedPartecipazioni && data.updatedPartecipazioni.length > 0) {
        const serverPart = data.updatedPartecipazioni[0]
        setPartecipazioni(prev => prev.map(p => p.ragazzo_id === ragazzoId && p.evento_id === eventoId ? serverPart : p))
      }
      if (data.updatedEventoMetodo) {
        setEventi(prev => prev.map(e => e.id === eventoId ? { ...e, metodo_pagamento: data.updatedEventoMetodo } : e))
      }
    } catch (e) {
      console.error("Errore sync partecipazione:", e)
    }
  }

  // --- AZIONI IN AGGREGATO PER PRESENZE, PAGAMENTI E METODO DI PAGAMENTO ---

  const bulkUpdatePartecipazioni = async ({
    ragazziIds,
    eventiIds,
    statoPresenza,
    riscosso,
    metodoPagamento
  }: {
    ragazziIds: string[],
    eventiIds: string[],
    statoPresenza?: 'Presente' | 'Assente' | 'Pendolare',
    riscosso?: boolean,
    metodoPagamento?: 'Contanti' | 'Bonifico'
  }) => {
    setIsBulkLoading(true)

    // 1. Optimistic Update nella UI in tempo reale
    setPartecipazioni(prev => {
      const next = [...prev]
      for (const rId of ragazziIds) {
        for (const eId of eventiIds) {
          const idx = next.findIndex(p => p.ragazzo_id === rId && p.evento_id === eId)
          const ev = eventi.find(e => e.id === eId)
          if (idx >= 0) {
            next[idx] = {
              ...next[idx],
              ...(statoPresenza !== undefined && { stato_presenza: statoPresenza }),
              ...(riscosso !== undefined && { riscosso }),
              ...(metodoPagamento !== undefined && { metodo_pagamento: metodoPagamento || toCanonicalMetodo(ev?.metodo_pagamento) })
            }
          } else {
            next.push({
              id: 'temp-' + rId + '-' + eId,
              ragazzo_id: rId,
              evento_id: eId,
              stato_presenza: statoPresenza || 'Assente',
              riscosso: riscosso || false,
              metodo_pagamento: metodoPagamento || toCanonicalMetodo(ev?.metodo_pagamento),
              quota_dovuta: null,
              scheda_medica_consegnata: false
            })
          }
        }
      }
      return next
    })

    if (metodoPagamento !== undefined) {
      setEventi(prev => prev.map(e => eventiIds.includes(e.id) ? { ...e, metodo_pagamento: metodoPagamento } : e))
    }

    // 2. Chiamata server atomica per ogni evento
    try {
      for (const eId of eventiIds) {
        const ev = eventi.find(e => e.id === eId)
        const targetMetodo = metodoPagamento || toCanonicalMetodo(ev?.metodo_pagamento, 'Bonifico')
        const res = await fetch('/api/uscite/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ragazziIds,
            eventoId: eId,
            statoPresenza,
            riscosso,
            metodoPagamento: targetMetodo
          })
        })

        const data = await res.json()
        if (data.updatedPartecipazioni) {
          const updatedParts = data.updatedPartecipazioni as Partecipazione[]
          const updatedMap = new Map(updatedParts.map(p => [`${p.ragazzo_id}-${p.evento_id}`, p]))
          
          setPartecipazioni(prev => prev.map(p => {
            const match = updatedMap.get(`${p.ragazzo_id}-${p.evento_id}`)
            return match || p
          }))
        }
        if (data.updatedEventoMetodo) {
          setEventi(prev => prev.map(e => e.id === eId ? { ...e, metodo_pagamento: data.updatedEventoMetodo } : e))
        }
      }
    } catch (e) {
      console.error("Errore bulk sync uscite:", e)
    } finally {
      setIsBulkLoading(false)
    }
  }

  const handleEventSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (editingEvento) {
      const { data, error } = await supabase.from('eventi').update({
        nome_evento: formData.nome_evento,
        quota_standard: Number(formData.quota_standard),
        tipo_evento: formData.tipo_evento,
        data_inizio: formData.data_inizio || null,
        metodo_pagamento: formData.metodo_pagamento
      }).eq('id', editingEvento.id).select().single()
      
      if (error) {
        alert("Errore modifica evento: " + error.message)
      }
      if (!error && data) {
        // Sincronizza subito la Cassa ed i record collegati in tempo reale per tutte le entrate di questo evento
        await updateRegistroSpeseMetodoPerEvento(editingEvento.id, formData.nome_evento, formData.metodo_pagamento)

        setEventi(eventi.map(ev => ev.id === editingEvento.id ? data : ev))
        setEditingEvento(null)
        setFormData({ nome_evento: '', quota_standard: '', tipo_evento: 'CI', data_inizio: '', metodo_pagamento: 'Contanti' })
        router.refresh()
      }
    } else {
      const { data, error } = await supabase.from('eventi').insert({
        nome_evento: formData.nome_evento,
        quota_standard: Number(formData.quota_standard),
        tipo_evento: formData.tipo_evento,
        data_inizio: formData.data_inizio || null,
        metodo_pagamento: formData.metodo_pagamento
      }).select().single()
      
      if (error) {
        alert("Errore inserimento evento: " + error.message)
      }
      if (!error && data) {
        setEventi([...eventi, data])
        
        await supabase.from('categorie_spesa').insert({ 
          nome: `Evento: ${data.nome_evento}`, 
          tipo_movimento: 'ENTRATA' 
        })

        setFormData({ nome_evento: '', quota_standard: '', tipo_evento: 'CI', data_inizio: '', metodo_pagamento: 'Contanti' })
        setTimeout(() => router.refresh(), 500) 
      }
    }
  }

  const deleteEvento = async (id: string) => {
    if (!confirm('Sei sicuro di voler eliminare questo evento? Tutti i dati di pagamento andranno persi.')) return
    
    // Cancella prima le voci in registro_spese collegate alle partecipazioni dell'evento
    const { data: eventParts } = await supabase.from('partecipazioni_eventi').select('id').eq('evento_id', id)
    if (eventParts && eventParts.length > 0) {
      const partIds = eventParts.map(p => p.id)
      await supabase.from('registro_spese').delete().in('partecipazione_evento_id', partIds)
    }

    const { error } = await supabase.from('eventi').delete().eq('id', id)
    if (!error) {
      setEventi(eventi.filter(e => e.id !== id))
      router.refresh()
    }
  }

  const pattuglie = Array.from(new Set(ragazzi.map(r => r.pattuglia).filter(Boolean)))
  const ragazziFiltrati = filtroPattuglia === 'Tutte' 
    ? ragazzi 
    : ragazzi.filter(r => r.pattuglia === filtroPattuglia)

  const visibleRagazziIds = ragazziFiltrati.map(r => r.id)
  const visibleEventiIds = eventi.map(e => e.id)

  return (
    <div className="space-y-4 p-4 md:p-6 flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Intestazione e Controlli Globali in Aggregato */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 bg-muted/40 p-4 rounded-xl border">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Presenze & Quote Uscite</h1>
          <p className="text-xs text-muted-foreground">Gestisci presenze, quote e metodo di pagamento (con quote ridotte per Pendolari)</p>
        </div>

        {/* Toolbar Azioni in Aggregato */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filtroPattuglia} onValueChange={(val) => setFiltroPattuglia(val || 'Tutte')}>
            <SelectTrigger className="w-[150px] h-8 text-xs bg-background">
              <SelectValue placeholder="Filtra Pattuglia" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Tutte">Tutte le Pattuglie</SelectItem>
              {pattuglie.map(p => (
                <SelectItem key={p!} value={p!}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select onValueChange={(val) => val && bulkUpdatePartecipazioni({ ragazziIds: ragazzi.map(r => r.id), eventiIds: visibleEventiIds, metodoPagamento: val as 'Contanti' | 'Bonifico' })}>
            <SelectTrigger className="w-[140px] h-8 text-xs bg-background">
              <Wallet className="mr-1 h-3.5 w-3.5" />
              <SelectValue placeholder="Metodo Tutti" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Contanti" className="text-xs">Tutti Contanti</SelectItem>
              <SelectItem value="Bonifico" className="text-xs">Tutti Bonifico</SelectItem>
            </SelectContent>
          </Select>

          <Button 
            size="sm" 
            variant="outline" 
            disabled={isBulkLoading}
            onClick={() => bulkUpdatePartecipazioni({ ragazziIds: visibleRagazziIds, eventiIds: visibleEventiIds, statoPresenza: 'Presente' })}
            className="h-8 text-xs bg-blue-500/10 hover:bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-200"
          >
            <CheckCheck className="h-3.5 w-3.5 mr-1" />
            Tutti Presenti
          </Button>

          <Button 
            size="sm" 
            variant="outline" 
            disabled={isBulkLoading}
            onClick={() => bulkUpdatePartecipazioni({ ragazziIds: visibleRagazziIds, eventiIds: visibleEventiIds, riscosso: true })}
            className="h-8 text-xs bg-green-500/10 hover:bg-green-500/20 text-green-700 dark:text-green-400 border-green-200"
          >
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            Tutti Pagati
          </Button>

          <Button 
            size="sm" 
            variant="outline" 
            disabled={isBulkLoading}
            onClick={() => bulkUpdatePartecipazioni({ ragazziIds: visibleRagazziIds, eventiIds: visibleEventiIds, riscosso: false })}
            className="h-8 text-xs bg-red-500/10 hover:bg-red-500/20 text-red-700 dark:text-red-400 border-red-200"
          >
            <XCircle className="h-3.5 w-3.5 mr-1" />
            Deseleziona Pagati
          </Button>

          <Dialog open={isEventiOpen} onOpenChange={open => { setIsEventiOpen(open); if(!open) setEditingEvento(null); }}>
            <DialogTrigger render={<Button size="sm" variant="outline" className="h-8 text-xs"><Settings2 className="mr-1 h-3.5 w-3.5" /> Gestisci Eventi</Button>} />
            <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
              <DialogHeader>
                <DialogTitle>Gestione Eventi e Uscite Reparto</DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-auto space-y-4">
                <form onSubmit={handleEventSubmit} className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
                  <div className="space-y-1 col-span-2">
                    <Label className="text-xs">Nome Evento</Label>
                    <Input value={formData.nome_evento} onChange={e => setFormData({...formData, nome_evento: e.target.value})} required className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Quota (€)</Label>
                    <Input type="number" step="0.01" value={formData.quota_standard} onChange={e => setFormData({...formData, quota_standard: e.target.value})} required className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Metodo Pag.</Label>
                    <Select value={formData.metodo_pagamento} onValueChange={v => setFormData({...formData, metodo_pagamento: v || 'Contanti'})}>
                      <SelectTrigger className="h-8 text-xs min-w-[100px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Contanti">Contanti</SelectItem>
                        <SelectItem value="Bonifico">Bonifico</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Tipo</Label>
                    <Select value={formData.tipo_evento} onValueChange={v => setFormData({...formData, tipo_evento: v || 'CI'})}>
                      <SelectTrigger className="h-8 text-xs min-w-[80px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CI">CI (Invernale)</SelectItem>
                        <SelectItem value="CE">CE (Estivo)</SelectItem>
                        <SelectItem value="USCITA">Uscita</SelectItem>
                        <SelectItem value="ALTRO">Altro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" className="h-8 text-xs bg-green-600 hover:bg-green-700">
                    {editingEvento ? <Pencil className="h-3 w-3 mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
                    {editingEvento ? 'Salva' : 'Aggiungi'}
                  </Button>
                </form>

                <div className="border rounded-md mt-4 text-sm">
                  <table className="w-full">
                    <thead className="bg-muted text-left">
                      <tr>
                        <th className="p-2">Evento</th>
                        <th className="p-2">Quota</th>
                        <th className="p-2">Tipo</th>
                        <th className="p-2">Azioni</th>
                      </tr>
                    </thead>
                    <tbody>
                      {eventi.map(ev => (
                        <tr key={ev.id} className="border-t">
                          <td className="p-2 font-medium">{ev.nome_evento}</td>
                          <td className="p-2">€{ev.quota_standard}</td>
                          <td className="p-2">{ev.tipo_evento}</td>
                          <td className="p-2 flex gap-1">
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-blue-600" onClick={() => {
                              setEditingEvento(ev)
                              setFormData({ nome_evento: ev.nome_evento, quota_standard: ev.quota_standard?.toString()||'', tipo_evento: ev.tipo_evento||'USCITA', data_inizio: ev.data_inizio||'', metodo_pagamento: ev.metodo_pagamento || 'Contanti' })
                            }}>
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500" onClick={() => deleteEvento(ev.id)}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Griglia Tabellare con Controlli di Aggregato per Colonna (Evento) e Riga (Ragazzo) */}
      <div className="rounded-2xl border border-slate-200/80 bg-white flex-1 overflow-auto relative shadow-2xs">
        <table className="w-full text-xs text-left border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200/80 sticky top-0 z-10 shadow-2xs">
            <tr>
              <th className="px-3 py-2.5 font-bold border-b border-r border-slate-200/80 bg-slate-50 sticky left-0 min-w-[170px] z-20 text-[11px] text-slate-600 uppercase tracking-wider">Esploratore</th>
              {eventi.map(e => {
                const allPresentForEvent = visibleRagazziIds.length > 0 && visibleRagazziIds.every(rId => {
                  const p = partecipazioni.find(part => part.ragazzo_id === rId && part.evento_id === e.id)
                  return p?.stato_presenza === 'Presente' || p?.stato_presenza === 'Pendolare' || p?.stato_presenza === 'PRESENTE' || p?.stato_presenza === 'PENDOLARE'
                })
                const allPaidForEvent = visibleRagazziIds.length > 0 && visibleRagazziIds.every(rId => {
                  const p = partecipazioni.find(part => part.ragazzo_id === rId && part.evento_id === e.id)
                  return p?.riscosso === true
                })

                return (
                  <th key={e.id} className="px-3 py-2 font-medium border-b border-r border-slate-200/80 text-center w-52 min-w-[200px]">
                    <div className="font-bold truncate text-[11px] leading-tight text-slate-800" title={e.nome_evento}>{e.nome_evento}</div>
                    <div className="text-[10px] text-agesci-blue font-semibold mb-1 tabular-nums">Standard: €{e.quota_standard}</div>
                    
                    {/* Controlli in Aggregato per Colonna Evento */}
                    <div className="flex items-center justify-center gap-1 flex-wrap">
                      <button
                        type="button"
                        onClick={() => bulkUpdatePartecipazioni({ ragazziIds: visibleRagazziIds, eventiIds: [e.id], statoPresenza: allPresentForEvent ? 'Assente' : 'Presente' })}
                        title={allPresentForEvent ? "Segna tutti assenti per questo evento" : "Segna tutti presenti per questo evento"}
                        className="text-[9px] bg-white border border-slate-200 px-1.5 py-0.5 rounded-md hover:bg-slate-100 font-semibold transition-colors shadow-2xs"
                      >
                        {allPresentForEvent ? '🟢 Pres' : 'Presenze'}
                      </button>
                      <button
                        type="button"
                        onClick={() => bulkUpdatePartecipazioni({ ragazziIds: visibleRagazziIds, eventiIds: [e.id], riscosso: !allPaidForEvent })}
                        title={allPaidForEvent ? "Deseleziona tutti i pagati" : "Segna tutti i pagati per questo evento"}
                        className="text-[9px] bg-white border border-slate-200 px-1.5 py-0.5 rounded-md hover:bg-slate-100 font-semibold transition-colors shadow-2xs"
                      >
                        {allPaidForEvent ? '💵 Pagati' : 'Pagati'}
                      </button>
                      <Select value={toCanonicalMetodo(e.metodo_pagamento)} onValueChange={(val) => val && bulkUpdatePartecipazioni({ ragazziIds: ragazzi.map(r => r.id), eventiIds: [e.id], metodoPagamento: val as 'Contanti' | 'Bonifico' })}>
                        <SelectTrigger className="h-5 w-14 text-[9px] px-1 border-slate-200 bg-white font-medium">
                          <SelectValue placeholder="Metodo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Contanti" className="text-[10px]">💵 Contanti</SelectItem>
                          <SelectItem value="Bonifico" className="text-[10px]">🏦 Bonifico</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </th>
                )
              })}
              <th className="px-3 py-2 font-bold border-b border-slate-200/80 text-center bg-slate-50 sticky right-0 z-20 w-28 text-[11px] text-slate-600 uppercase tracking-wider">
                Totale Pagato
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ragazziFiltrati.map((r, i) => {
              const rowParts = partecipazioni.filter(p => p.ragazzo_id === r.id && p.riscosso)
              const totalRow = rowParts.reduce((acc, p) => {
                const ev = eventi.find(e => e.id === p.evento_id)
                const quotaEffettiva = (p.quota_dovuta !== null && p.quota_dovuta !== undefined) 
                  ? Number(p.quota_dovuta) 
                  : (ev?.quota_standard || 0)
                return acc + quotaEffettiva
              }, 0)

              const isAllRagazzoPresent = visibleEventiIds.every(eId => {
                const p = partecipazioni.find(part => part.ragazzo_id === r.id && part.evento_id === eId)
                return p?.stato_presenza === 'Presente' || p?.stato_presenza === 'Pendolare' || p?.stato_presenza === 'PRESENTE' || p?.stato_presenza === 'PENDOLARE'
              })
              const isAllRagazzoPaid = visibleEventiIds.every(eId => {
                const p = partecipazioni.find(part => part.ragazzo_id === r.id && part.evento_id === eId)
                return p?.riscosso === true
              })

              return (
                <TableRow key={r.id} className={cn("hover:bg-blue-50/40 transition-colors h-14", i % 2 === 0 ? "bg-white" : "bg-slate-50/40")}>
                  <TableCell className="px-3 py-1.5 border-r border-slate-200/80 font-medium sticky left-0 bg-inherit z-10">
                    <div className="flex items-center justify-between gap-1">
                      <div>
                        <div className="truncate font-semibold text-slate-900 max-w-[110px]">{r.nome} {r.cognome}</div>
                        <div className="text-[10px] text-slate-500 truncate font-normal">{r.pattuglia || 'Non assegnata'}</div>
                      </div>
                      
                      {/* Controlli per Singolo Ragazzo */}
                      <div className="flex flex-col gap-0.5 items-end">
                        <button
                          type="button"
                          onClick={() => bulkUpdatePartecipazioni({ ragazziIds: [r.id], eventiIds: visibleEventiIds, statoPresenza: isAllRagazzoPresent ? 'Assente' : 'Presente' })}
                          title={isAllRagazzoPresent ? "Segna assente a tutti gli eventi" : "Segna presente a tutti gli eventi"}
                          className="text-[9px] border border-slate-200 px-1 py-0.5 rounded bg-white hover:bg-agesci-blue hover:text-white transition-colors font-medium"
                        >
                          {isAllRagazzoPresent ? '🟢 Pres' : '+ Pres'}
                        </button>
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => bulkUpdatePartecipazioni({ ragazziIds: [r.id], eventiIds: visibleEventiIds, riscosso: !isAllRagazzoPaid })}
                            title={isAllRagazzoPaid ? "Deseleziona tutti i pagamenti" : "Segna pagato a tutti gli eventi"}
                            className="text-[9px] border border-slate-200 px-1 py-0.5 rounded bg-white hover:bg-emerald-600 hover:text-white transition-colors font-medium"
                          >
                            {isAllRagazzoPaid ? '💵 Pag' : '+ Pag'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  
                  {eventi.map(e => {
                    const p = partecipazioni.find(part => part.ragazzo_id === r.id && part.evento_id === e.id)
                    const isPresent = p?.stato_presenza === 'Presente' || p?.stato_presenza === 'Pendolare' || p?.stato_presenza === 'PRESENTE' || p?.stato_presenza === 'PENDOLARE'
                    const isPendolare = p?.stato_presenza === 'Pendolare' || p?.stato_presenza === 'PENDOLARE'
                    const isAssente = !p?.stato_presenza || p?.stato_presenza === 'Assente' || p?.stato_presenza === 'ASSENTE'
                    
                    return (
                      <TableCell key={e.id} className="p-1 border-r border-slate-200/80 align-top">
                        <div className="flex flex-col gap-1 w-full h-full justify-center">
                          {/* Badge Pillola Presenza */}
                          <Select
                            value={p?.stato_presenza || 'Assente'}
                            onValueChange={(val) => updatePartecipazione(r.id, e.id, 'stato_presenza', val)}
                          >
                            <SelectTrigger className={cn("h-6 w-full text-[10px] px-1.5 rounded-full font-semibold transition-all border", 
                              isPresent 
                                ? isPendolare
                                  ? "bg-amber-50 text-amber-800 border-amber-200"
                                  : "bg-emerald-50 text-emerald-800 border-emerald-200"
                                : "bg-rose-50 text-rose-700 border-rose-200"
                            )}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Presente" className="text-[10px] text-emerald-700 font-semibold">🟢 Presente</SelectItem>
                              <SelectItem value="Pendolare" className="text-[10px] text-amber-700 font-semibold">🟡 Pendolare</SelectItem>
                              <SelectItem value="Assente" className="text-[10px] text-rose-700 font-semibold">🔴 Assente</SelectItem>
                            </SelectContent>
                          </Select>

                          {/* Pagamento, Metodo e Quota Personalizzata */}
                          <div className={cn("flex items-center gap-1 w-full justify-between px-1", isAssente && "opacity-40")}>
                            <div className="flex items-center gap-1">
                              <Checkbox
                                checked={p?.riscosso || false}
                                onCheckedChange={(checked) => updatePartecipazione(r.id, e.id, 'riscosso', checked === true)}
                                className="h-4 w-4 touch-min"
                              />
                              <Select
                                value={toCanonicalMetodo(p?.metodo_pagamento || e.metodo_pagamento)}
                                onValueChange={(val) => updatePartecipazione(r.id, e.id, 'metodo_pagamento', val)}
                              >
                                <SelectTrigger className="h-5 w-14 text-[9px] px-1 border-0 shadow-none bg-transparent font-medium">
                                  <SelectValue placeholder="Metodo" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Contanti" className="text-[10px]">💵 Contanti</SelectItem>
                                  <SelectItem value="Bonifico" className="text-[10px]">🏦 Bonifico</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Campo Quota Dovuta (€) */}
                            <div className="flex items-center gap-0.5" title="Quota dovuta per questo ragazzo">
                              <span className="text-[9px] text-slate-400 font-semibold">€</span>
                              <Input
                                type="number"
                                step="0.5"
                                placeholder={e.quota_standard?.toString()}
                                value={p?.quota_dovuta !== null && p?.quota_dovuta !== undefined ? p.quota_dovuta : ''}
                                onChange={(evt) => {
                                  const val = evt.target.value === '' ? null : Number(evt.target.value)
                                  updatePartecipazione(r.id, e.id, 'quota_dovuta', val)
                                }}
                                className={cn("h-5 w-11 text-[9px] px-1 py-0 text-right font-bold tabular-nums border-slate-200 rounded-md", 
                                  isPendolare && "border-amber-400 bg-amber-50 text-amber-900"
                                )}
                              />
                            </div>
                          </div>
                        </div>
                      </TableCell>
                    )
                  })}
                  
                  <TableCell className="px-3 py-1 text-center font-bold text-emerald-800 bg-inherit sticky right-0 z-10 border-l border-slate-200/80 tabular-nums">
                    €{totalRow}
                  </TableCell>
                </TableRow>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

