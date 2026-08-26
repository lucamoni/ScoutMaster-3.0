'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Compass, Calendar, MapPin, ExternalLink, Plus, Users, Search, Loader2, MessageCircle, AlertCircle, Clock, Trash2, Edit, Banknote } from 'lucide-react'
import { createBrowserClient } from '@supabase/ssr'
import { Database } from '@/types/database.types'
import { toast } from 'sonner'
import { format, isBefore, isAfter, differenceInDays } from 'date-fns'
import { it } from 'date-fns/locale'

type Evento = {
  id?: string
  titolo?: string
  categoria?: string
  branca?: string | null
  regione?: string | null
  data_inizio?: string | null
  data_fine?: string | null
  apertura_iscrizioni?: string | null
  chiusura_iscrizioni?: string | null
  scadenza_iscrizioni?: string | null
  costo_evento?: number | null
  quota?: number | null
  luogo?: string | null
  url_evento?: string | null
  note?: string | null
  [key: string]: any
}
type Candidatura = {
  id: string
  evento_id?: string | null
  ragazzo_id?: string | null
  stato_iscrizione?: string | null
  specialita_competenza_scelta?: string | null
  quota_pagata?: boolean | null
  note?: string | null
  ragazzi?: { nome: string, cognome: string, telefono_ragazzo: string | null, genitore_1_telefono: string | null, genitore_2_telefono: string | null } | null
  [key: string]: any
}
type Ragazzo = Database['public']['Tables']['ragazzi']['Row']

interface EventStatus {
  label: string
  color: string
  icon: React.ComponentType<{ className?: string }>
}

export function BuonacacciaClient({ initialEventi, initialCandidature, ragazzi }: { initialEventi: Evento[], initialCandidature: Candidatura[], ragazzi: Ragazzo[] }) {
  const supabase = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [eventi, setEventi] = useState<Evento[]>(initialEventi)
  const [candidature, setCandidature] = useState<Candidatura[]>(initialCandidature)
  
  // Modale Aggiungi/Modifica Evento
  const [isEventoModalOpen, setIsEventoModalOpen] = useState(false)
  const [editingEvento, setEditingEvento] = useState<Partial<Evento>>({ branca: 'EG', categoria: 'Specialita' })
  const [importUrl, setImportUrl] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [isSavingEvento, setIsSavingEvento] = useState(false)

  // Modale Gestione Iscrizioni Evento
  const [selectedEvento, setSelectedEvento] = useState<Evento | null>(null)
  
  // Modale Link Rapidi
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false)
  const [fetchedEvents, setFetchedEvents] = useState<{id: string, titolo: string, luogo?: string, date?: string}[]>([])
  const [isFetchingList, setIsFetchingList] = useState(false)
  
  // Nuovo candidato
  const [newCandidatoId, setNewCandidatoId] = useState<string>('')
  const [isAddingCandidato, setIsAddingCandidato] = useState(false)

  const fetchData = useCallback(async () => {
    const [eventiRes, candRes] = await Promise.all([
      supabase.from('eventi_buonacaccia' as any).select('*').order('data_inizio', { ascending: true }),
      supabase.from('candidature_buonacaccia' as any).select('*, ragazzi(nome, cognome, telefono_ragazzo, genitore_1_telefono, genitore_2_telefono)')
    ])
    if (eventiRes.data) setEventi(eventiRes.data as unknown as Evento[])
    if (candRes.data) setCandidature(candRes.data as unknown as Candidatura[])
  }, [supabase])

  const fetchEventList = async (type: 'EG' | 'CAPI') => {
    setIsFetchingList(true)
    setFetchedEvents([])
    try {
      const res = await fetch(`/api/buonacaccia/list?type=${type}`)
      const { data, error } = await res.json()
      if (error) throw new Error(error)
      setFetchedEvents(data)
      toast.success(`Trovati ${data.length} eventi!`)
    } catch (error: unknown) {
      const err = error as Error
      toast.error(err.message)
    } finally {
      setIsFetchingList(false)
    }
  }

  // Helper parsing date string da italiano (es: "17-20 Aprile 2026")
  const parseDateRangeString = (dateStr?: string) => {
    if (!dateStr) return {}
    const months: Record<string, string> = {
      'gennaio': '01', 'febbraio': '02', 'marzo': '03', 'aprile': '04',
      'maggio': '05', 'giugno': '06', 'luglio': '07', 'agosto': '08',
      'settembre': '09', 'ottobre': '10', 'novembre': '11', 'dicembre': '12'
    }

    const yearMatch = dateStr.match(/20\d\d/)
    const year = yearMatch ? yearMatch[0] : '2026'

    const foundMonths: { month: string; index: number }[] = []
    const lower = dateStr.toLowerCase()
    Object.keys(months).forEach(m => {
      const idx = lower.indexOf(m)
      if (idx !== -1) foundMonths.push({ month: months[m], index: idx })
    })
    foundMonths.sort((a, b) => a.index - b.index)

    const numbers = dateStr.match(/\b\d{1,2}\b/g)
    if (!numbers || numbers.length === 0 || foundMonths.length === 0) return {}

    const startDay = numbers[0].padStart(2, '0')
    const endDay = numbers.length > 1 ? numbers[1].padStart(2, '0') : startDay
    const startMonth = foundMonths[0].month
    const endMonth = foundMonths.length > 1 ? foundMonths[1].month : startMonth

    const data_inizio = `${year}-${startMonth}-${startDay}`
    const data_fine = `${year}-${endMonth}-${endDay}`

    const startDateObj = new Date(data_inizio)
    const aperturaObj = new Date(startDateObj.getTime() - 30 * 24 * 60 * 60 * 1000)
    const chiusuraObj = new Date(startDateObj.getTime() - 7 * 24 * 60 * 60 * 1000)

    return {
      data_inizio,
      data_fine,
      apertura_iscrizioni: aperturaObj.toISOString(),
      chiusura_iscrizioni: chiusuraObj.toISOString()
    }
  }

  const deriveEventMetadata = (title: string) => {
    const upper = title.toUpperCase()
    let branca = 'EG'
    let categoria = 'Specialita'
    let costo = 35

    if (upper.includes('CFT') || upper.includes('CFM') || upper.includes('CFA') || upper.includes('ROSS') || upper.includes('CAPI') || upper.includes('FORMAZIONE')) {
      branca = 'CAPI'
      if (upper.includes('CFT')) categoria = 'CFT'
      else if (upper.includes('CFM')) categoria = 'CFM'
      else if (upper.includes('CFA')) categoria = 'CFA'
      else categoria = 'Altro'
      costo = 60
    } else {
      branca = 'EG'
      if (upper.includes('COMPETENZA')) categoria = 'Competenza'
      else if (upper.includes('ORME') || upper.includes('PICCOLE')) categoria = 'Piccole Orme'
      else if (upper.includes('ESTIVO')) { categoria = 'Specialita'; costo = 150; }
      else categoria = 'Specialita'
    }

    return { branca, categoria, costo }
  }

  // Auto-import via URL o Catalogo
  const handleImport = useCallback(async (urlParam?: string, directTitle?: string, directDate?: string, directLuogo?: string) => {
    const targetUrl = typeof urlParam === 'string' ? urlParam : importUrl
    if (!targetUrl) {
      toast.error('Inserisci l\'URL dell\'evento BuonaCaccia')
      return
    }
    setIsImporting(true)
    try {
      const derivedMeta = deriveEventMetadata(directTitle || 'Evento BuonaCaccia')
      const parsedDates = parseDateRangeString(directDate)

      let eventPayload: Partial<Evento> = {
        titolo: directTitle || 'Evento BuonaCaccia',
        categoria: derivedMeta.categoria,
        branca: derivedMeta.branca,
        luogo: directLuogo || null,
        costo_evento: derivedMeta.costo,
        url_evento: targetUrl,
        ...parsedDates
      }

      try {
        const res = await fetch('/api/buonacaccia', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: targetUrl })
        })
        const { data } = await res.json()
        if (data && data.titolo) {
          eventPayload = { ...eventPayload, ...data }
        }
      } catch (err) {
        console.warn('Fallback estrazione BuonaCaccia:', err)
      }

      const insertData = {
        titolo: eventPayload.titolo || directTitle || 'Evento BuonaCaccia',
        categoria: eventPayload.categoria || derivedMeta.categoria,
        branca: eventPayload.branca || derivedMeta.branca,
        regione: eventPayload.regione || null,
        luogo: eventPayload.luogo || directLuogo || null,
        data_inizio: eventPayload.data_inizio || null,
        data_fine: eventPayload.data_fine || null,
        apertura_iscrizioni: eventPayload.apertura_iscrizioni || null,
        chiusura_iscrizioni: eventPayload.chiusura_iscrizioni || null,
        costo_evento: eventPayload.costo_evento || derivedMeta.costo,
        url_evento: targetUrl,
        note: eventPayload.note || null
      }

      const { error: insertErr } = await supabase
        .from('eventi_buonacaccia' as any)
        .insert(insertData)

      if (insertErr) {
        console.error('Errore salvataggio evento BuonaCaccia:', insertErr)
        throw insertErr
      }

      toast.success(`🎉 Evento "${insertData.titolo}" importato nella scheda di monitoraggio!`)
      setIsLinkModalOpen(false)
      setIsEventoModalOpen(false)
      fetchData()
    } catch (error: unknown) {
      const err = error as Error
      toast.error(err.message || 'Errore durante l\'importazione')
    } finally {
      setIsImporting(false)
    }
  }, [importUrl, supabase, fetchData])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlToImport = params.get('import')
    
    if (urlToImport) {
      window.history.replaceState({}, document.title, window.location.pathname)
      Promise.resolve().then(() => {
        handleImport(urlToImport)
      })
    }
  }, [handleImport])

  const handleSaveEvento = async () => {
    if (!editingEvento.titolo || !editingEvento.categoria || !editingEvento.branca) {
      toast.error('Compila i campi obbligatori (Titolo, Categoria, Branca)')
      return
    }
    setIsSavingEvento(true)
    try {
      if (editingEvento.id) {
        const { error } = await supabase.from('eventi_buonacaccia' as any).update(editingEvento).eq('id', editingEvento.id)
        if (error) throw error
        toast.success('Evento aggiornato')
      } else {
        const { error } = await supabase.from('eventi_buonacaccia' as any).insert(editingEvento)
        if (error) throw error
        toast.success('Evento creato')
      }
      setIsEventoModalOpen(false)
      fetchData()
    } catch (error: unknown) {
      const err = error as Error
      toast.error(err.message)
    } finally {
      setIsSavingEvento(false)
    }
  }

  const handleDeleteEvento = async (id: string) => {
    if (!confirm('Eliminare questo evento e tutte le candidature associate?')) return
    try {
      const { error } = await supabase.from('eventi_buonacaccia' as any).delete().eq('id', id)
      if (error) throw error
      toast.success('Evento eliminato')
      if (selectedEvento?.id === id) setSelectedEvento(null)
      setIsEventoModalOpen(false)
      fetchData()
    } catch (error: unknown) {
      const err = error as Error
      toast.error(err.message)
    }
  }

  // Gestione Candidature
  const handleAddCandidato = async () => {
    if (!selectedEvento || !newCandidatoId) return
    setIsAddingCandidato(true)
    try {
      const exists = candidature.find(c => c.evento_id === selectedEvento.id && c.ragazzo_id === newCandidatoId)
      if (exists) {
        toast.error('Ragazzo già candidato a questo evento')
        return
      }

      const { error } = await supabase.from('candidature_buonacaccia' as any).insert({
        evento_id: selectedEvento.id,
        ragazzo_id: newCandidatoId,
        stato_iscrizione: 'Interessato',
        quota_pagata: false
      })
      if (error) throw error
      toast.success('Candidato aggiunto')
      setNewCandidatoId('')
      fetchData()
    } catch (error: unknown) {
      const err = error as Error
      toast.error(err.message)
    } finally {
      setIsAddingCandidato(false)
    }
  }

  const updateCandidatura = async (id: string, field: string, value: string | boolean | null) => {
    try {
      setCandidature(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c))
      const { error } = await supabase.from('candidature_buonacaccia' as any).update({ [field]: value }).eq('id', id)
      if (error) throw error
    } catch (error: unknown) {
      const err = error as Error
      toast.error('Errore aggiornamento: ' + err.message)
      fetchData()
    }
  }

  const handleDeleteCandidatura = async (id: string) => {
    if (!confirm('Rimuovere questa candidatura?')) return
    try {
      const { error } = await supabase.from('candidature_buonacaccia' as any).delete().eq('id', id)
      if (error) throw error
      toast.success('Candidatura rimossa')
      fetchData()
    } catch (error: unknown) {
      const err = error as Error
      toast.error(err.message)
    }
  }

  const getWhatsAppLink = (c: Candidatura) => {
    const telefono = c.ragazzi?.genitore_1_telefono || c.ragazzi?.genitore_2_telefono || c.ragazzi?.telefono_ragazzo
    if (!telefono) return null
    
    const cleanPhone = telefono.replace(/\D/g, '')
    const finalPhone = cleanPhone.startsWith('39') ? cleanPhone : '39' + cleanPhone

    const testo = `Ciao! Ti scriviamo per l'evento scout "${selectedEvento?.titolo}".\nLo stato della candidatura di ${c.ragazzi?.nome} è: *${c.stato_iscrizione}*.\n\nLink evento: ${selectedEvento?.url_evento || 'Non disponibile'}\nCosto previsto: ${selectedEvento?.costo_evento ? '€'+selectedEvento.costo_evento : 'Da definire'}\n${c.quota_pagata ? '✅ Quota già rimborsata allo Staff Capi.' : '⚠️ Quota da rimborsare allo Staff Capi (via Bonifico / PayPal / Satispay / Contanti).'}`
    return `https://wa.me/${finalPhone}?text=${encodeURIComponent(testo)}`
  }

  const getEventStatus = (evento: Evento): EventStatus => {
    const now = new Date()
    if (evento.apertura_iscrizioni && isBefore(now, new Date(evento.apertura_iscrizioni))) {
      return { label: `Apre in ${differenceInDays(new Date(evento.apertura_iscrizioni), now)} giorni`, color: 'bg-yellow-500', icon: Clock }
    }
    if (evento.chiusura_iscrizioni) {
      if (isAfter(now, new Date(evento.chiusura_iscrizioni))) {
        return { label: 'Iscrizioni Chiuse', color: 'bg-destructive', icon: AlertCircle }
      } else {
        const days = differenceInDays(new Date(evento.chiusura_iscrizioni), now)
        return { label: `Chiude in ${days} giorni`, color: days < 3 ? 'bg-orange-500' : 'bg-green-600', icon: Clock }
      }
    }
    return { label: 'Nessuna Scadenza', color: 'bg-muted-foreground', icon: Calendar }
  }

  const [activeTab, setActiveTab] = useState<'eg' | 'capi'>('eg')

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-primary flex items-center gap-2">
            <Compass className="w-8 h-8" />
            Monitoraggio BuonaCaccia
          </h1>
          <p className="text-muted-foreground">Gestisci le iscrizioni agli eventi formativi e ai campi di specialità/competenza.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setIsLinkModalOpen(true)} className="gap-2">
            <ExternalLink className="w-4 h-4" /> Esplora BuonaCaccia
          </Button>
          <Button onClick={() => { 
            setEditingEvento(activeTab === 'capi' ? { branca: 'CAPI', categoria: 'CFT' } : { branca: 'EG', categoria: 'Specialita' }); 
            setImportUrl(''); 
            setIsEventoModalOpen(true); 
          }} className="gap-2">
            <Plus className="w-4 h-4" /> Nuovo Evento
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'eg' | 'capi')} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="eg" className="flex items-center gap-2"><Compass className="w-4 h-4"/> Eventi Ragazzi E/G</TabsTrigger>
          <TabsTrigger value="capi" className="flex items-center gap-2"><Users className="w-4 h-4"/> Formazione Capi</TabsTrigger>
        </TabsList>

        <TabsContent value="eg" className="mt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {eventi.filter(e => e.branca === 'EG').length === 0 && (
              <div className="col-span-full py-12 text-center text-muted-foreground border border-dashed rounded-lg">Nessun evento E/G monitorato.</div>
            )}
            {eventi.filter(e => e.branca === 'EG').map(evento => (
              <EventCard key={evento.id} evento={evento} getStatus={getEventStatus} onSelect={() => setSelectedEvento(evento)} onEdit={() => {setEditingEvento(evento); setIsEventoModalOpen(true);}} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="capi" className="mt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {eventi.filter(e => e.branca === 'CAPI').length === 0 && (
              <div className="col-span-full py-12 text-center text-muted-foreground border border-dashed rounded-lg">Nessun corso formazione capi monitorato.</div>
            )}
            {eventi.filter(e => e.branca === 'CAPI').map(evento => (
              <EventCard key={evento.id} evento={evento} getStatus={getEventStatus} onSelect={() => setSelectedEvento(evento)} onEdit={() => {setEditingEvento(evento); setIsEventoModalOpen(true);}} />
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* MODALE AGGIUNGI/MODIFICA EVENTO */}
      <Dialog open={isEventoModalOpen} onOpenChange={setIsEventoModalOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingEvento.id ? 'Modifica Evento' : 'Aggiungi Evento BuonaCaccia'}</DialogTitle>
            <DialogDescription>
              Incolla il link dell&apos;evento per estrarre i dati automaticamente con l&apos;IA, oppure compila manualmente.
            </DialogDescription>
          </DialogHeader>

          {!editingEvento.id && (
            <div className="flex gap-2 p-3 bg-primary/5 rounded-lg border border-primary/20 mb-2">
              <Input 
                placeholder="https://buonacaccia.net/..." 
                value={importUrl} 
                onChange={e => setImportUrl(e.target.value)} 
                className="bg-background"
              />
              <Button variant="secondary" onClick={() => handleImport()} disabled={isImporting}>
                {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                <span className="ml-2 hidden sm:inline">Estrai Dati</span>
              </Button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            <div className="space-y-2 col-span-full">
              <Label>Titolo Evento *</Label>
              <Input value={editingEvento.titolo || ''} onChange={e => setEditingEvento({...editingEvento, titolo: e.target.value})} />
            </div>
            
            <div className="space-y-2">
              <Label>Branca *</Label>
              <Select value={editingEvento.branca || 'EG'} onValueChange={(v) => setEditingEvento({...editingEvento, branca: v || 'EG'})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="EG">Esploratori e Guide</SelectItem>
                  <SelectItem value="CAPI">Comunità Capi</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Categoria *</Label>
              <Select value={editingEvento.categoria || ''} onValueChange={(v) => setEditingEvento({...editingEvento, categoria: v || ''})}>
                <SelectTrigger><SelectValue placeholder="Seleziona..."/></SelectTrigger>
                <SelectContent>
                  {editingEvento.branca === 'EG' ? (
                    <>
                      <SelectItem value="Specialita">Campo di Specialità</SelectItem>
                      <SelectItem value="Competenza">Campo di Competenza</SelectItem>
                      <SelectItem value="Piccole Orme">Piccole Orme</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="CFT">CFT (Campo Form. Tirocinanti)</SelectItem>
                      <SelectItem value="CFM">CFM (Campo Form. Metodologica)</SelectItem>
                      <SelectItem value="CFA">CFA (Campo Form. Associativa)</SelectItem>
                      <SelectItem value="Altro">Altro / Aggiornamento</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Data Inizio</Label>
              <Input type="date" value={editingEvento.data_inizio || ''} onChange={e => setEditingEvento({...editingEvento, data_inizio: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Data Fine</Label>
              <Input type="date" value={editingEvento.data_fine || ''} onChange={e => setEditingEvento({...editingEvento, data_fine: e.target.value})} />
            </div>

            <div className="space-y-2">
              <Label>Apertura Iscrizioni</Label>
              <Input type="datetime-local" value={editingEvento.apertura_iscrizioni ? editingEvento.apertura_iscrizioni.slice(0,16) : ''} onChange={e => setEditingEvento({...editingEvento, apertura_iscrizioni: e.target.value ? new Date(e.target.value).toISOString() : null})} />
            </div>
            <div className="space-y-2">
              <Label>Chiusura Iscrizioni</Label>
              <Input type="datetime-local" value={editingEvento.chiusura_iscrizioni ? editingEvento.chiusura_iscrizioni.slice(0,16) : ''} onChange={e => setEditingEvento({...editingEvento, chiusura_iscrizioni: e.target.value ? new Date(e.target.value).toISOString() : null})} />
            </div>

            <div className="space-y-2">
              <Label>Luogo / Regione</Label>
              <Input value={editingEvento.luogo || editingEvento.regione || ''} onChange={e => setEditingEvento({...editingEvento, luogo: e.target.value})} />
            </div>
            <div className="space-y-2">
              <Label>Costo Previsto (€)</Label>
              <Input type="number" step="0.01" value={editingEvento.costo_evento || ''} onChange={e => setEditingEvento({...editingEvento, costo_evento: parseFloat(e.target.value) || null})} />
            </div>

            <div className="space-y-2 col-span-full">
              <div className="flex items-center justify-between">
                <Label>Link Evento BuonaCaccia</Label>
                {editingEvento.url_evento && (
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="sm" 
                    className="h-7 text-xs text-blue-700 bg-blue-50 border-blue-200 hover:bg-blue-100 gap-1 font-medium"
                    disabled={isImporting}
                    onClick={async () => {
                      if (!editingEvento.url_evento) return
                      setIsImporting(true)
                      try {
                        const res = await fetch('/api/buonacaccia', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ url: editingEvento.url_evento })
                        })
                        const { data } = await res.json()
                        if (data && data.titolo) {
                          setEditingEvento(prev => ({
                            ...prev,
                            titolo: data.titolo || prev.titolo,
                            luogo: data.luogo || prev.luogo,
                            costo_evento: data.costo_evento || prev.costo_evento,
                            data_inizio: data.data_inizio || prev.data_inizio,
                            data_fine: data.data_fine || prev.data_fine,
                            apertura_iscrizioni: data.apertura_iscrizioni || prev.apertura_iscrizioni,
                            chiusura_iscrizioni: data.chiusura_iscrizioni || prev.chiusura_iscrizioni,
                            categoria: data.categoria || prev.categoria,
                            branca: data.branca || prev.branca
                          }))
                          toast.success(`✨ Dati dell'evento "${data.titolo}" estratti con successo!`)
                        } else {
                          toast.error('Nessun dato aggiuntivo trovato dal link')
                        }
                      } catch (err: any) {
                        toast.error(err.message || 'Errore estrazione dati')
                      } finally {
                        setIsImporting(false)
                      }
                    }}
                  >
                    {isImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    ✨ Estrai Dati da Link (AI)
                  </Button>
                )}
              </div>
              <Input type="url" placeholder="https://buonacaccia.net/Event.aspx?e=..." value={editingEvento.url_evento || ''} onChange={e => setEditingEvento({...editingEvento, url_evento: e.target.value})} />
            </div>
          </div>
          <DialogFooter className="mt-4">
            {editingEvento.id && (
              <Button type="button" variant="destructive" className="mr-auto" onClick={() => handleDeleteEvento(editingEvento.id!)}>
                Elimina Evento
              </Button>
            )}
            <Button variant="outline" onClick={() => setIsEventoModalOpen(false)}>Annulla</Button>
            <Button onClick={handleSaveEvento} disabled={isSavingEvento}>{isSavingEvento ? <Loader2 className="w-4 h-4 animate-spin"/> : 'Salva Evento'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODALE / CASSETTO GESTIONE ISCRIZIONI (CANDIDATI) */}
      <Dialog open={!!selectedEvento} onOpenChange={(open) => !open && setSelectedEvento(null)}>
        <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between pr-6">
              <DialogTitle className="text-xl">{selectedEvento?.titolo}</DialogTitle>
              {selectedEvento?.url_evento && (
                <Button variant="outline" size="sm" className="gap-2" onClick={() => window.open(selectedEvento.url_evento!, '_blank')}>
                  <ExternalLink className="w-4 h-4"/> Apri BuonaCaccia
                </Button>
              )}
            </div>
            <DialogDescription>
              Gestisci i ragazzi candidati per questo evento.
            </DialogDescription>
          </DialogHeader>

          <div className="p-4 bg-muted/30 rounded-lg flex flex-wrap gap-4 items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-muted-foreground"/>
              <span className="text-sm font-medium">
                {selectedEvento?.data_inizio ? format(new Date(selectedEvento.data_inizio), 'dd MMM yyyy', { locale: it }) : 'Data non definita'} 
                {selectedEvento?.data_fine ? ` - ${format(new Date(selectedEvento.data_fine), 'dd MMM yyyy', { locale: it })}` : ''}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-muted-foreground"/>
              <span className="text-sm font-medium">{selectedEvento?.luogo || selectedEvento?.regione || 'Luogo non definito'}</span>
            </div>
            {selectedEvento?.costo_evento && (
              <Badge variant="secondary" className="text-sm border-primary/20">€ {selectedEvento.costo_evento}</Badge>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex gap-2 items-end">
              <div className="flex-1 space-y-2">
                <Label>Aggiungi Candidato al Reparto</Label>
                <Select value={newCandidatoId} onValueChange={(v) => setNewCandidatoId(v || '')}>
                  <SelectTrigger><SelectValue placeholder="Seleziona esploratore/guida..."/></SelectTrigger>
                  <SelectContent>
                    {ragazzi.map(r => (
                      <SelectItem key={r.id} value={r.id}>{r.nome} {r.cognome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleAddCandidato} disabled={!newCandidatoId || isAddingCandidato} className="gap-2">
                {isAddingCandidato ? <Loader2 className="w-4 h-4 animate-spin"/> : <Plus className="w-4 h-4"/>} Aggiungi
              </Button>
            </div>

            <div className="border rounded-md overflow-hidden">
              <div className="grid grid-cols-12 bg-muted p-3 text-xs font-semibold text-muted-foreground">
                <div className="col-span-3">Candidato</div>
                <div className="col-span-2">Stato</div>
                <div className="col-span-3">Specialità / Note</div>
                <div className="col-span-3 text-center">Rimborso ai Capi & Metodo</div>
                <div className="col-span-1 text-center">Azioni</div>
              </div>
              <div className="divide-y max-h-[40vh] overflow-y-auto">
                {candidature.filter(c => c.evento_id === selectedEvento?.id).length === 0 && (
                  <div className="p-8 text-center text-muted-foreground">Nessun iscritto a questo evento.</div>
                )}
                {candidature.filter(c => c.evento_id === selectedEvento?.id).map(cand => (
                  <div key={cand.id} className="grid grid-cols-12 p-3 items-center gap-2 text-sm hover:bg-muted/10 transition-colors">
                    <div className="col-span-3 font-medium truncate" title={`${cand.ragazzi?.nome} ${cand.ragazzi?.cognome}`}>
                      {cand.ragazzi?.nome} {cand.ragazzi?.cognome}
                    </div>
                    <div className="col-span-2">
                      <Select value={cand.stato_iscrizione || ''} onValueChange={v => updateCandidatura(cand.id, 'stato_iscrizione', v)}>
                        <SelectTrigger className={`h-8 text-xs font-semibold ${
                          cand.stato_iscrizione === 'Accettato' ? 'text-green-600 border-green-200 bg-green-50' : 
                          cand.stato_iscrizione === 'Iscritto' ? 'text-blue-600 border-blue-200 bg-blue-50' : 
                          cand.stato_iscrizione === 'Rinunciato' ? 'text-red-600 border-red-200 bg-red-50' : 
                          cand.stato_iscrizione === 'In Lista Attesa' ? 'text-orange-600 border-orange-200 bg-orange-50' : ''
                        }`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Interessato">Interessato</SelectItem>
                          <SelectItem value="Iscritto">Iscritto</SelectItem>
                          <SelectItem value="In Lista Attesa">In Lista Attesa</SelectItem>
                          <SelectItem value="Accettato">Accettato</SelectItem>
                          <SelectItem value="Rinunciato">Rinunciato</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-3">
                      <Input 
                        placeholder="Es. Elettricista / Note" 
                        className="h-8 text-xs" 
                        value={cand.specialita_competenza_scelta || ''} 
                        onChange={e => updateCandidatura(cand.id, 'specialita_competenza_scelta', e.target.value)}
                      />
                    </div>
                    <div className="col-span-3 flex items-center justify-center gap-1.5">
                      <div className={`flex items-center space-x-1.5 border px-2 py-1 rounded text-xs transition-colors ${cand.quota_pagata ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-semibold' : 'bg-amber-50 border-amber-300 text-amber-800 font-medium'}`}>
                        <Checkbox 
                          id={`quota-${cand.id}`} 
                          checked={cand.quota_pagata || false} 
                          onCheckedChange={c => updateCandidatura(cand.id, 'quota_pagata', !!c)}
                        />
                        <Label htmlFor={`quota-${cand.id}`} className="text-xs cursor-pointer">
                          {cand.quota_pagata ? 'Rimborsato' : 'Da Rimborsare'}
                        </Label>
                      </div>
                      <Select value={cand.metodo_pagamento || ''} onValueChange={v => updateCandidatura(cand.id, 'metodo_pagamento', v)}>
                        <SelectTrigger className="h-8 text-xs w-[110px]"><SelectValue placeholder="Metodo..."/></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Bonifico">Bonifico Bancario</SelectItem>
                          <SelectItem value="PayPal">PayPal</SelectItem>
                          <SelectItem value="Satispay">Satispay</SelectItem>
                          <SelectItem value="Contanti">Contanti</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-1 flex justify-center gap-1">
                      {getWhatsAppLink(cand) && (
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => window.open(getWhatsAppLink(cand)!, '_blank')} title="Invia promemoria WhatsApp">
                          <MessageCircle className="w-4 h-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleDeleteCandidatura(cand.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>


      <Dialog open={isLinkModalOpen} onOpenChange={(open) => { setIsLinkModalOpen(open); if(!open) setFetchedEvents([]); }}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Esplora Eventi su BuonaCaccia</DialogTitle>
            <DialogDescription>
              Scarica in tempo reale la lista degli eventi dal portale ufficiale e importali direttamente in ScoutMaster.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="eg_links" className="w-full mt-4" onValueChange={() => setFetchedEvents([])}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="eg_links">Eventi Ragazzi E/G</TabsTrigger>
              <TabsTrigger value="capi_links">Formazione Capi</TabsTrigger>
            </TabsList>

            <TabsContent value="eg_links" className="space-y-3 mt-4">
              <div className="flex justify-between items-center bg-muted/30 p-4 rounded-md">
                <div className="text-sm">Scarica gli eventi attivi (Specialità, Competenza)</div>
                <Button onClick={() => fetchEventList('EG')} disabled={isFetchingList} size="sm">
                  {isFetchingList ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Ricerca in corso...</> : <><Search className="w-4 h-4 mr-2" /> Cerca Eventi E/G</>}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="capi_links" className="space-y-3 mt-4">
              <div className="flex justify-between items-center bg-muted/30 p-4 rounded-md">
                <div className="text-sm">Scarica gli eventi per Capi (CFT, CFM, CFA)</div>
                <Button onClick={() => fetchEventList('CAPI')} disabled={isFetchingList} size="sm">
                  {isFetchingList ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Ricerca in corso...</> : <><Search className="w-4 h-4 mr-2" /> Cerca Corsi</>}
                </Button>
              </div>
            </TabsContent>

            {fetchedEvents.length > 0 && (
              <div className="mt-4 border rounded-md divide-y max-h-96 overflow-y-auto">
                {fetchedEvents.map((ev, idx) => (
                  <div key={idx} className="p-3 flex justify-between items-center hover:bg-muted/10 transition-colors">
                    <div className="flex-1 pr-4">
                      <div className="font-semibold text-sm text-primary">{ev.titolo}</div>
                      <div className="text-xs text-muted-foreground flex gap-3 mt-1">
                        {ev.date && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {ev.date}</span>}
                        {ev.luogo && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {ev.luogo}</span>}
                      </div>
                    </div>
                    <Button size="sm" variant="secondary" className="whitespace-nowrap bg-blue-50 text-blue-700 hover:bg-blue-100" disabled={isImporting} onClick={() => {
                      handleImport(`https://buonacaccia.net/Event.aspx?e=${ev.id}`, ev.titolo, ev.date, ev.luogo)
                    }}>
                      {isImporting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                      📥 Importa
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function EventCard({ evento, getStatus, onSelect, onEdit }: { evento: Evento, getStatus: (e: Evento) => EventStatus, onSelect: () => void, onEdit: () => void }) {
  const status = getStatus(evento)
  const StatusIcon = status.icon
  
  return (
    <Card className="flex flex-col hover:border-primary/50 transition-all shadow-xs hover:shadow-md cursor-pointer rounded-xl bg-white border border-slate-200/80" onClick={onSelect}>
      <CardHeader className="p-4 pb-2 relative">
        <div className="flex justify-between items-start gap-2">
          <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-xs font-semibold">{evento.categoria || 'Evento'}</Badge>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-700" onClick={(e) => { e.stopPropagation(); onEdit(); }} title="Modifica Evento">
            <Edit className="w-4 h-4" />
          </Button>
        </div>
        <CardTitle className="text-base font-bold mt-2 text-slate-900 leading-snug">{evento.titolo}</CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-2 flex-1 space-y-2 text-xs text-slate-600">
        {evento.data_inizio && (
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary shrink-0" />
            <span>
              {format(new Date(evento.data_inizio), 'dd MMM yyyy', { locale: it })}
              {evento.data_fine && ` - ${format(new Date(evento.data_fine), 'dd MMM yyyy', { locale: it })}`}
            </span>
          </div>
        )}
        {evento.apertura_iscrizioni && (
          <div className="flex items-center gap-2 text-slate-500">
            <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>Apertura: {format(new Date(evento.apertura_iscrizioni), 'dd MMM yyyy', { locale: it })}</span>
          </div>
        )}
        {evento.chiusura_iscrizioni && (
          <div className="flex items-center gap-2 text-slate-500">
            <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
            <span>Chiusura: {format(new Date(evento.chiusura_iscrizioni), 'dd MMM yyyy', { locale: it })}</span>
          </div>
        )}
        {evento.luogo && (
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary shrink-0" />
            <span className="truncate">{evento.luogo}</span>
          </div>
        )}
        {evento.costo_evento !== undefined && evento.costo_evento !== null && (
          <div className="flex items-center gap-2 font-semibold text-slate-800">
            <Banknote className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Quota: €{Number(evento.costo_evento).toFixed(2)}</span>
          </div>
        )}
      </CardContent>
      <CardFooter className="p-0 mt-auto border-t border-slate-100">
        <div className={`w-full py-2.5 px-4 flex items-center justify-center gap-2 text-xs font-semibold text-white rounded-b-xl ${status.color}`}>
          <StatusIcon className="w-4 h-4" /> {status.label}
        </div>
      </CardFooter>
    </Card>
  )
}
