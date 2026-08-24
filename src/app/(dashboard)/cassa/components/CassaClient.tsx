'use client'

import { useState, useEffect } from 'react'
import { Database } from '@/types/database.types'
import { createBrowserClient } from '@supabase/ssr'
import { toCanonicalMetodo } from '@/lib/utils/payment'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Camera, Plus, Trash2, Settings2, Pencil, Check, X, Loader2, Receipt, Paperclip } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type Spesa = Database['public']['Tables']['registro_spese']['Row']
type Categoria = Database['public']['Tables']['categorie_spesa']['Row']

export default function CassaClient({ 
  initialSpese,
  initialCategorie,
  saldi
}: { 
  initialSpese: Spesa[]
  initialCategorie: Categoria[]
  saldi?: { entrateContanti: number, entrateBanca: number, usciteContanti: number, usciteBanca: number }
}) {
  const [spese, setSpese] = useState<Spesa[]>(initialSpese)
  const [categorie, setCategorie] = useState<Categoria[]>(initialCategorie)
  const [isOpen, setIsOpen] = useState(false)
  const [isCatOpen, setIsCatOpen] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatTipo, setNewCatTipo] = useState('USCITA')
  const [editingCatId, setEditingCatId] = useState<string | null>(null)
  const [editingCatNome, setEditingCatNome] = useState('')
  const [editingCatTipo, setEditingCatTipo] = useState('USCITA')
  const [editingSpesa, setEditingSpesa] = useState<Spesa | null>(null)
  const [activeTab, setActiveTab] = useState('TUTTI')
  const [isSyncing, setIsSyncing] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Scanner Scontrino State
  const [isScannerOpen, setIsScannerOpen] = useState(false)
  const [scannerFile, setScannerFile] = useState<File | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [ocrData, setOcrData] = useState<{
    importo_totale?: string,
    data?: string,
    metodo_pagamento?: string,
    fornitore_voce?: string,
    categoria_suggerita?: string
  } | null>(null)
  
  const [formData, setFormData] = useState<{
    voce_spesa: string;
    importo: string;
    metodo: string;
    momento_anno: string;
    note: string;
    tipo_movimento: string;
    data?: string;
  }>({
    voce_spesa: initialCategorie[0]?.nome || '',
    importo: '',
    metodo: 'Contanti',
    momento_anno: 'ANNO',
    note: '',
    tipo_movimento: 'USCITA'
  })

  const supabase = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const searchParams = useSearchParams()

  // Auto-open scanner from query parameter
  useEffect(() => {
    if (searchParams?.get('scan') === 'true') {
      const timer = setTimeout(() => {
        setIsScannerOpen(true)
        window.history.replaceState({}, '', '/cassa')
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [searchParams])

  // Subiscrizione Supabase Realtime per registro_spese
  useEffect(() => {
    const channel = supabase
      .channel('cassa_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'registro_spese' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const newSpesa = payload.new as Spesa
            setSpese(prev => prev.some(s => s.id === newSpesa.id) ? prev : [newSpesa, ...prev])
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Spesa
            setSpese(prev => prev.map(s => s.id === updated.id ? updated : s))
          } else if (payload.eventType === 'DELETE') {
            const deleted = payload.old as Spesa
            setSpese(prev => prev.filter(s => s.id !== deleted.id))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase])

  // Alias per compatibilità UI display
  const normalizeMetodoDisplay = toCanonicalMetodo

  // Filtra ed escludi categoricamente il Censimento dai movimenti e dai saldi della Cassa
  const cassaSpese = spese.filter(s => {
    const voce = (s.voce_spesa || '').toLowerCase()
    const note = (s.note || '').toLowerCase()
    return !voce.includes('censimento') && !note.includes('censimento')
  })

  // Spese filtrate in base al tab selezionato
  const speseFiltrate = cassaSpese.filter(s => activeTab === 'TUTTI' ? true : s.tipo_movimento === activeTab)

  // Calcolo Dinamico dei Saldi in base allo stato locale "cassaSpese"
  let saldoEntrateContanti = 0
  let saldoEntrateBanca = 0
  let saldoUsciteContanti = 0
  let saldoUsciteBanca = 0

  cassaSpese.forEach((spesa) => {
    const isEntrata = spesa.tipo_movimento === 'ENTRATA'
    const met = normalizeMetodoDisplay(spesa.metodo)
    if (met === 'Contanti') {
      if (isEntrata) saldoEntrateContanti += Number(spesa.importo)
      else saldoUsciteContanti += Number(spesa.importo)
    } else {
      if (isEntrata) saldoEntrateBanca += Number(spesa.importo)
      else saldoUsciteBanca += Number(spesa.importo)
    }
  })

  // Integra con le entrate storiche calcolate a server se necessario, ma dato che ora tutto va in registro_spese 
  // e spese contiene tutti i record (il server li fetchava tutti), i saldi locali calcolati sono esatti per i dati presenti.
  // Tuttavia per sicurezza sommiamo il differenziale. In questo caso li calcoliamo ESCLUSIVAMENTE sulle spese.
  const saldoContanti = saldoEntrateContanti - saldoUsciteContanti
  const saldoBanca = saldoEntrateBanca - saldoUsciteBanca

  // Helper per la sincronizzazione inversa da Cassa verso Eventi / Uscite / Partecipazioni
  const syncSpesaMetodoWithDB = async (spesa: Spesa, newMetodo: string) => {
    const safeMetodo = toCanonicalMetodo(newMetodo)

    // 1. Se collegata a una specifica partecipazione evento
    if (spesa.partecipazione_evento_id) {
      let res = await supabase.from('partecipazioni_eventi')
        .update({ metodo_pagamento: safeMetodo })
        .eq('id', spesa.partecipazione_evento_id)
      if (res.error && (res.error.code === '23514' || res.error.message?.includes('metodo'))) {
        await supabase.from('partecipazioni_eventi')
          .update({ metodo_pagamento: safeMetodo.toUpperCase() })
          .eq('id', spesa.partecipazione_evento_id)
      }
    }

    // 2. Se la voce spesa riguarda un evento (es. "Evento: Invernale")
    const voce = spesa.voce_spesa || ''
    if (voce.toLowerCase().includes('evento:')) {
      const nomeEv = voce.replace(/evento:/i, '').trim()
      if (nomeEv) {
        const { data: evList } = await supabase.from('eventi').select('id').ilike('nome_evento', nomeEv)
        if (evList && evList.length > 0) {
          for (const ev of evList) {
            let resEv = await supabase.from('eventi').update({ metodo_pagamento: safeMetodo }).eq('id', ev.id)
            if (resEv.error && (resEv.error.code === '23514' || resEv.error.message?.includes('metodo'))) {
              await supabase.from('eventi').update({ metodo_pagamento: safeMetodo.toUpperCase() }).eq('id', ev.id)
            }
            let resPart = await supabase.from('partecipazioni_eventi').update({ metodo_pagamento: safeMetodo }).eq('evento_id', ev.id)
            if (resPart.error && (resPart.error.code === '23514' || resPart.error.message?.includes('metodo'))) {
              await supabase.from('partecipazioni_eventi').update({ metodo_pagamento: safeMetodo.toUpperCase() }).eq('evento_id', ev.id)
            }
          }
        }
      }
    }
  }

  const handleUpdateMetodoSpesa = async (spesa: Spesa, newMetodo: string) => {
    const safeMetodo = toCanonicalMetodo(newMetodo)

    // Ottimistic UI update immediato
    setSpese(prev => prev.map(s => s.id === spesa.id ? { ...s, metodo: safeMetodo } : s))

    // Prova 1: Valore canonico ('Bonifico', 'Contanti', 'Carta')
    let res = await supabase.from('registro_spese').update({ metodo: safeMetodo }).eq('id', spesa.id).select()

    // Prova 2: MAIUSCOLO ('BONIFICO', 'CONTANTI', 'CARTA')
    if (res.error && (res.error.code === '23514' || res.error.message?.includes('metodo'))) {
      res = await supabase.from('registro_spese').update({ metodo: safeMetodo.toUpperCase() }).eq('id', spesa.id).select()
    }

    // Prova 3: minuscolo ('bonifico', 'contanti', 'carta')
    if (res.error && (res.error.code === '23514' || res.error.message?.includes('metodo'))) {
      res = await supabase.from('registro_spese').update({ metodo: safeMetodo.toLowerCase() }).eq('id', spesa.id).select()
    }

    // Prova 4: null
    if (res.error && (res.error.code === '23514' || res.error.message?.includes('metodo'))) {
      res = await supabase.from('registro_spese').update({ metodo: null }).eq('id', spesa.id).select()
    }

    if (!res.error) {
      const updatedItem = res.data?.[0] || { ...spesa, metodo: safeMetodo }
      setSpese(prev => prev.map(s => s.id === spesa.id ? updatedItem : s))
      await syncSpesaMetodoWithDB(spesa, safeMetodo)
      toast.success(`Metodo aggiornato: ${safeMetodo}`)
    } else {
      console.error("Errore aggiornamento metodo in Cassa:", res.error?.message || res.error)
      toast.error(`Errore aggiornamento metodo: ${res.error?.message || 'Operazione non riuscita'}`)
    }
  }

  const unlinkAndCleanupRelatedRecords = async (spesa: Spesa) => {
    if (spesa.partecipazione_evento_id) {
      await supabase.from('partecipazioni_eventi')
        .update({ riscosso: false })
        .eq('id', spesa.partecipazione_evento_id)
    }
    if (spesa.quota_mensile_id && spesa.riferimento_quota) {
      await supabase.from('quote_mensili')
        .update({ [spesa.riferimento_quota]: false } as Database['public']['Tables']['quote_mensili']['Update'])
        .eq('id', spesa.quota_mensile_id)
    }
    if (spesa.ragazzo_id && spesa.voce_spesa?.toLowerCase().includes('censimento')) {
      await supabase.from('ragazzi')
        .update({ quota_censimento: false } as unknown as Database['public']['Tables']['ragazzi']['Update'])
        .eq('id', spesa.ragazzo_id)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (editingSpesa) {
      const safeMetodo = toCanonicalMetodo(formData.metodo)
      let { data, error } = await supabase
        .from('registro_spese')
        .update({
          voce_spesa: formData.voce_spesa,
          importo: Number(formData.importo),
          metodo: safeMetodo,
          momento_anno: formData.momento_anno,
          note: formData.note,
          tipo_movimento: formData.tipo_movimento
        })
        .eq('id', editingSpesa.id)
        .select()
        .single()

      if (error && (error.code === '23514' || error.message?.includes('metodo'))) {
        const retry = await supabase
          .from('registro_spese')
          .update({
            voce_spesa: formData.voce_spesa,
            importo: Number(formData.importo),
            metodo: safeMetodo.toUpperCase(),
            momento_anno: formData.momento_anno,
            note: formData.note,
            tipo_movimento: formData.tipo_movimento
          })
          .eq('id', editingSpesa.id)
          .select()
          .single()
        data = retry.data
        error = retry.error
      }

      if (!error && data) {
        setSpese(spese.map(s => s.id === editingSpesa.id ? data : s))
        setIsOpen(false)
        await syncSpesaMetodoWithDB(editingSpesa, safeMetodo)
        
        // Background Sync (Update)
        fetch('/api/sheets/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: data.id, type: 'cassa' })
        }).catch(e => console.error("Errore background sync sheets:", e))
      } else if (error) {
        toast.error(`Errore salvataggio: ${error.message}`)
      }
    } else {
      const safeMetodo = toCanonicalMetodo(formData.metodo)
      let { data, error } = await supabase
        .from('registro_spese')
        .insert({
          voce_spesa: formData.voce_spesa,
          importo: Number(formData.importo),
          metodo: safeMetodo,
          momento_anno: formData.momento_anno,
          note: formData.note,
          tipo_movimento: formData.tipo_movimento,
          data: new Date().toISOString().split('T')[0],
        })
        .select()
        .single()

      if (error && (error.code === '23514' || error.message?.includes('metodo'))) {
        const retry = await supabase
          .from('registro_spese')
          .insert({
            voce_spesa: formData.voce_spesa,
            importo: Number(formData.importo),
            metodo: safeMetodo.toUpperCase(),
            momento_anno: formData.momento_anno,
            note: formData.note,
            tipo_movimento: formData.tipo_movimento,
            data: new Date().toISOString().split('T')[0],
          })
          .select()
          .single()
        data = retry.data
        error = retry.error
      }

      if (!error && data) {
        setSpese([data, ...spese])
        setIsOpen(false)
        
        // Background Sync (Insert)
        fetch('/api/sheets/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: data.id, type: 'cassa' })
        }).catch(e => console.error("Errore background sync sheets:", e))
      } else if (error) {
        toast.error(`Errore inserimento: ${error.message}`)
      }
    }
  }

  const deleteSpesa = async (id: string) => {
    if(!confirm("Vuoi davvero eliminare questa spesa?")) return;
    const spesaToDelete = spese.find(s => s.id === id)
    const { error } = await supabase.from('registro_spese').delete().eq('id', id)
    if (!error) {
      if (spesaToDelete) await unlinkAndCleanupRelatedRecords(spesaToDelete)
      setSpese(spese.filter(s => s.id !== id))
    }
  }

  const handleAddCategoria = async (e: React.FormEvent) => {
    e.preventDefault()
    if(!newCatName) return;
    const { data, error } = await supabase.from('categorie_spesa').insert({ nome: newCatName, tipo_movimento: newCatTipo }).select().single()
    if(error) {
      alert("Errore inserimento categoria: " + error.message)
    }
    if(!error && data) {
      setCategorie([...categorie, data].sort((a,b) => a.nome.localeCompare(b.nome)))
      setNewCatName('')
    }
  }

  const handleDeleteCategoria = async (id: string) => {
    if(!confirm("Vuoi eliminare questa categoria?")) return;
    const { error } = await supabase.from('categorie_spesa').delete().eq('id', id)
    if(!error) {
      setCategorie(categorie.filter(c => c.id !== id))
    }
  }

  const saveEditCategoria = async (id: string) => {
    if (!editingCatNome.trim()) {
      setEditingCatId(null)
      return
    }
    const { error } = await supabase.from('categorie_spesa').update({ nome: editingCatNome.trim(), tipo_movimento: editingCatTipo }).eq('id', id)
    if(error) {
      alert("Errore modifica categoria: " + error.message)
    }
    if (!error) {
      setCategorie(prev => prev.map(c => c.id === id ? { ...c, nome: editingCatNome.trim(), tipo_movimento: editingCatTipo } : c).sort((a,b) => a.nome.localeCompare(b.nome)))
      setEditingCatId(null)
    }
  }

  // --- LOGICA OCR SCONTRINO ---
  const handleScannerFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      setScannerFile(file)
      await analyzeScontrino(file)
    }
  }

  const analyzeScontrino = async (fileToAnalyze: File) => {
    setIsProcessing(true)
    setOcrData(null)
    toast.info('Analisi scontrino in corso...', { id: 'ocr-scontrino' })
    try {
      const bodyData = new FormData()
      bodyData.append('file', fileToAnalyze)
      bodyData.append('categorie', categorie.map(c => c.nome).join(', '))
      
      const res = await fetch('/api/ocr-scontrini', { method: 'POST', body: bodyData })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.details || errorData.error || 'Errore durante l\'analisi OCR')
      }
      
      const data = await res.json()
      
      setOcrData(data)
      
      // Pre-compila formData per la revisione
      setFormData(prev => ({
        ...prev,
        importo: data.importo_totale?.toString() || '',
        data: data.data || new Date().toISOString().split('T')[0],
        metodo: ['Contanti', 'Carta', 'Bonifico'].includes(data.metodo_pagamento) ? data.metodo_pagamento : 'Contanti',
        voce_spesa: categorie.find(c => c.nome === data.categoria_suggerita)?.nome || categorie[0]?.nome || '',
        note: data.fornitore_voce || '',
        tipo_movimento: 'USCITA' // Assumiamo uscita per gli scontrini
      }))

      toast.success('Scontrino letto con successo! Controlla i dati.', { id: 'ocr-scontrino' })
    } catch (err: unknown) {
      console.error(err)
      const errMsg = err instanceof Error ? err.message : 'Errore sconosciuto'
      toast.error(`Impossibile analizzare lo scontrino: ${errMsg}`, { id: 'ocr-scontrino' })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleSaveScannedScontrino = async () => {
    if (!scannerFile) return
    setIsProcessing(true)
    toast.loading('Salvataggio scontrino in corso...', { id: 'save-scontrino' })
    
    try {
      const fileExt = scannerFile.name.split('.').pop()
      const fileName = `scontrino_${Date.now()}.${fileExt}`
      const { error: uploadError } = await supabase.storage
        .from('scontrini')
        .upload(fileName, scannerFile)
        
      if (uploadError) throw uploadError

      const { data, error } = await supabase
        .from('registro_spese')
        .insert({
          voce_spesa: formData.voce_spesa,
          importo: Number(formData.importo),
          metodo: formData.metodo,
          momento_anno: formData.momento_anno,
          note: formData.note,
          tipo_movimento: formData.tipo_movimento,
          data: formData.data || new Date().toISOString().split('T')[0],
          ricevuta_presente: true,
          foto_scontrino_url: fileName
        })
        .select()
        .single()

      if (error) throw error

      setSpese([data, ...spese])
      setIsScannerOpen(false)
      setScannerFile(null)
      toast.success('Scontrino salvato in cassa!', { id: 'save-scontrino' })
      
      // Background Sync
      fetch('/api/sheets/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: data.id, type: 'cassa' })
      }).catch(e => console.error("Errore background sync sheets:", e))
      
    } catch (error: unknown) {
      console.error(error)
      toast.error('Errore salvataggio scontrino', { id: 'save-scontrino' })
    } finally {
      setIsProcessing(false)
    }
  }

  const viewSecureScontrino = async (fileUrl: string) => {
    try {
      const { data, error } = await supabase.storage.from('scontrini').createSignedUrl(fileUrl, 60)
      if (error || !data) {
        toast.error('Impossibile accedere allo scontrino protetto.')
      } else {
        window.open(data.signedUrl, '_blank')
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleImportSheets = async () => {
    setIsSyncing(true)
    toast.loading('Importazione da Google Sheets in corso...', { id: 'import-sheets' })
    try {
      const res = await fetch('/api/sheets/import?type=cassa')
      const data = await res.json()
      
      if (!res.ok) throw new Error(data.error || 'Errore importazione')
      
      toast.success(data.message || 'Sincronizzazione completata!', { id: 'import-sheets' })
      
      // Ricarica i dati (hard refresh)
      window.location.reload()
      
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Errore importazione'
      toast.error(msg, { id: 'import-sheets' })
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Dashboard Saldi */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-purple-50 dark:bg-purple-950/20 border-purple-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-purple-800 dark:text-purple-300">Totale Generale</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-700 dark:text-purple-400">€{(saldoContanti + saldoBanca).toFixed(2)}</div>
            <p className="text-sm text-purple-600 mt-1">
              Contanti: €{saldoContanti.toFixed(2)} | Banca: €{saldoBanca.toFixed(2)}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-green-50 dark:bg-green-950/20 border-green-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-green-800 dark:text-green-300">Cassa Fisica (Contanti)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-700 dark:text-green-400">€{saldoContanti.toFixed(2)}</div>
            <p className="text-sm text-green-600 mt-1">Entrate: €{saldoEntrateContanti} | Uscite: €{saldoUsciteContanti}</p>
          </CardContent>
        </Card>
        
        <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg text-blue-800 dark:text-blue-300">Conto Corrente (Bonifici)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-700 dark:text-blue-400">€{saldoBanca.toFixed(2)}</div>
            <p className="text-sm text-blue-600 mt-1">Entrate: €{saldoEntrateBanca} | Uscite: €{saldoUsciteBanca}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-4">
        <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if(!open) setEditingSpesa(null); }}>
          <DialogTrigger className="flex-1 md:flex-none inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2" onClick={() => {
            setEditingSpesa(null)
            setFormData({
              voce_spesa: categorie[0]?.nome || '',
              importo: '',
              metodo: 'Contanti',
              momento_anno: 'ANNO',
              note: '',
              tipo_movimento: 'USCITA'
            })
          }}>
            <Plus className="mr-2 h-4 w-4" /> Nuovo Movimento
          </DialogTrigger>

          <Button 
            variant="outline" 
            className="flex-1 md:flex-none border-purple-200 text-purple-700 hover:bg-purple-50"
            onClick={handleImportSheets}
            disabled={isSyncing}
          >
            {isSyncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Settings2 className="mr-2 h-4 w-4" />}
            {isSyncing ? 'Sincronizzazione...' : 'Sincronizza da Google Sheets'}
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingSpesa ? 'Modifica Movimento' : 'Registra Movimento'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo Movimento</Label>
                  <Select value={formData.tipo_movimento || ''} onValueChange={v => setFormData({...formData, tipo_movimento: v || 'USCITA'})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ENTRATA" className="text-green-600 font-bold">Entrata (+)</SelectItem>
                      <SelectItem value="USCITA" className="text-red-600 font-bold">Uscita (-)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Importo (€)</Label>
                  <Input type="number" step="0.01" required value={formData.importo || ''} onChange={e => setFormData({...formData, importo: e.target.value})} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Categoria (Voce)</Label>
                <Select value={formData.voce_spesa || ''} onValueChange={v => setFormData({...formData, voce_spesa: v || ''})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {categorie.filter(c => c.tipo_movimento === formData.tipo_movimento || !c.tipo_movimento).map(c => (
                      <SelectItem key={c.id} value={c.nome}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Metodo</Label>
                  <Select value={formData.metodo || ''} onValueChange={v => setFormData({...formData, metodo: v || ''})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Contanti">Contanti</SelectItem>
                      <SelectItem value="Carta">Carta</SelectItem>
                      <SelectItem value="Bonifico">Bonifico</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Momento Anno</Label>
                  <Select value={formData.momento_anno || ''} onValueChange={v => setFormData({...formData, momento_anno: v || ''})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ANNO">ANNO</SelectItem>
                      <SelectItem value="CI">Campo Invernale</SelectItem>
                      <SelectItem value="CE">Campo Estivo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Note</Label>
                <Input value={formData.note || ''} onChange={e => setFormData({...formData, note: e.target.value})} placeholder="Es. Chiodi dal ferramenta..." />
              </div>
              <Button type="submit" className="w-full">Salva</Button>
            </form>
          </DialogContent>
        </Dialog>

        <Button variant="secondary" className="flex-1 md:flex-none text-blue-600 bg-blue-100 hover:bg-blue-200" onClick={() => {
          setScannerFile(null)
          setOcrData(null)
          setIsScannerOpen(true)
        }}>
          <Camera className="mr-2 h-4 w-4" /> Scansiona Scontrino
        </Button>
        
        <Dialog open={isCatOpen} onOpenChange={setIsCatOpen}>
          <DialogTrigger render={<Button variant="outline" size="sm"><Settings2 className="mr-2 h-4 w-4" /> Gestione Categorie</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Gestisci Categorie Spesa</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddCategoria} className="flex gap-2">
              <Input placeholder="Nuova Categoria" value={newCatName} onChange={e => setNewCatName(e.target.value)} required />
              <Select value={newCatTipo} onValueChange={(v) => setNewCatTipo(v || 'USCITA')}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USCITA">Uscita</SelectItem>
                  <SelectItem value="ENTRATA">Entrata</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit">Aggiungi</Button>
            </form>
            <div className="mt-4 border rounded-md max-h-60 overflow-y-auto">
              <Table>
                <TableBody>
                  {categorie.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="p-2">
                        {editingCatId === c.id ? (
                          <div className="flex gap-2 w-full">
                            <Input className="h-8 flex-1" value={editingCatNome} onChange={e => setEditingCatNome(e.target.value)} autoFocus />
                            <Select value={editingCatTipo} onValueChange={(v) => setEditingCatTipo(v || 'USCITA')}>
                              <SelectTrigger className="w-24 h-8"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="USCITA">Uscita</SelectItem>
                                <SelectItem value="ENTRATA">Entrata</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={() => saveEditCategoria(c.id)}>
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500" onClick={() => setEditingCatId(null)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex justify-between items-center w-full">
                            <div>
                              <span>{c.nome}</span>
                              <span className={`ml-2 text-[10px] px-1 py-0.5 rounded-full ${c.tipo_movimento === 'ENTRATA' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                {c.tipo_movimento || 'USCITA'}
                              </span>
                            </div>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600" onClick={() => { setEditingCatId(c.id); setEditingCatNome(c.nome || ''); setEditingCatTipo(c.tipo_movimento || 'USCITA') }}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => handleDeleteCategoria(c.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </DialogContent>
        </Dialog>

        {/* MODAL SCANNER SCONTRINO */}
        <Dialog open={isScannerOpen} onOpenChange={setIsScannerOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Acquisisci Scontrino</DialogTitle>
              <DialogDescription>
                Scatta o carica uno scontrino. Gemini estrarrà in automatico l&apos;importo e i dati.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              {!scannerFile ? (
                <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50" onClick={() => document.getElementById('scontrino-upload')?.click()}>
                  <Camera className="w-12 h-12 text-muted-foreground mb-4" />
                  <p className="font-medium">Tocca per scattare una foto</p>
                  <p className="text-sm text-muted-foreground mt-1">o carica un&apos;immagine o un PDF</p>
                  <input id="scontrino-upload" type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={handleScannerFileChange} />
                </div>
              ) : (
                <div className="space-y-4">
                  {isProcessing && !ocrData && (
                    <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                      <Loader2 className="w-8 h-8 animate-spin mb-2" />
                      <p className="text-sm">Lettura scontrino in corso...</p>
                    </div>
                  )}

                  {ocrData && (
                    <div className="space-y-4 animate-in fade-in">
                      <div className="flex items-center gap-2 p-3 bg-muted rounded-md mb-2">
                        <Receipt className="w-5 h-5 text-primary" />
                        <span className="text-sm font-medium">Lettura completata. Controlla i dati:</span>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Importo Estratto (€)</Label>
                          <Input type="number" step="0.01" value={formData.importo || ''} onChange={e => setFormData({...formData, importo: e.target.value})} />
                        </div>
                        <div className="space-y-2">
                          <Label>Data</Label>
                          <Input type="date" value={formData.data || ''} onChange={e => setFormData({...formData, data: e.target.value})} />
                        </div>
                        <div className="space-y-2 col-span-2">
                          <Label>Voce Spesa (Fornitore / Negozio)</Label>
                          <Input value={formData.note || ''} onChange={e => setFormData({...formData, note: e.target.value})} />
                        </div>
                        <div className="space-y-2">
                          <Label>Categoria Spesa</Label>
                          <Select value={formData.voce_spesa || ''} onValueChange={v => setFormData({...formData, voce_spesa: v || ''})}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {categorie.filter(c => c.tipo_movimento === 'USCITA' || !c.tipo_movimento).map(c => (
                                <SelectItem key={c.id} value={c.nome}>{c.nome}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Metodo Pagamento</Label>
                          <Select value={formData.metodo || ''} onValueChange={v => setFormData({...formData, metodo: v || ''})}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Contanti">Contanti</SelectItem>
                              <SelectItem value="Carta">Carta</SelectItem>
                              <SelectItem value="Bonifico">Bonifico</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsScannerOpen(false)}>Annulla</Button>
              {scannerFile && ocrData && (
                <Button onClick={handleSaveScannedScontrino} disabled={isProcessing}>
                  {isProcessing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Conferma e Salva
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="TUTTI" onValueChange={setActiveTab} className="w-full">
        <div className="flex justify-between items-center mb-4">
          <TabsList>
            <TabsTrigger value="TUTTI">Tutti i Movimenti</TabsTrigger>
            <TabsTrigger value="ENTRATA" className="text-green-600 data-[state=active]:text-green-700">Solo Entrate</TabsTrigger>
            <TabsTrigger value="USCITA" className="text-red-600 data-[state=active]:text-red-700">Solo Uscite</TabsTrigger>
          </TabsList>
          
          {selectedIds.size > 0 && (
            <Button variant="destructive" size="sm" onClick={async () => {
              if (confirm(`Sei sicuro di voler eliminare in modo definitivo ${selectedIds.size} movimenti? Questa azione è irreversibile.`)) {
                toast.loading('Eliminazione in corso...', { id: 'bulk-delete' })
                const { error } = await supabase.from('registro_spese').delete().in('id', Array.from(selectedIds))
                if (error) {
                  toast.error('Errore durante l\'eliminazione: ' + error.message, { id: 'bulk-delete' })
                } else {
                  setSpese(spese.filter(s => !selectedIds.has(s.id)))
                  setSelectedIds(new Set())
                  toast.success(`${selectedIds.size} movimenti eliminati.`, { id: 'bulk-delete' })
                }
              }
            }}>
              <Trash2 className="w-4 h-4 mr-2" /> Elimina selezionati ({selectedIds.size})
            </Button>
          )}
        </div>

        <div className="rounded-md border bg-card overflow-hidden">
          <Table className="table-fixed text-xs">
            <TableHeader className="bg-muted text-muted-foreground border-b">
              <TableRow className="h-8">
              <TableHead className="w-8 text-center border-r px-2">
                <Checkbox 
                  checked={speseFiltrate.length > 0 && selectedIds.size === speseFiltrate.length}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedIds(new Set(speseFiltrate.map(s => s.id)))
                    } else {
                      setSelectedIds(new Set())
                    }
                  }}
                />
              </TableHead>
              <TableHead className="w-12 text-center border-r px-2">N°</TableHead>
              <TableHead className="w-24 border-r px-2">Data</TableHead>
              <TableHead className="w-32 border-r px-2">Momento</TableHead>
              <TableHead className="w-48 border-r px-2">Categoria</TableHead>
              <TableHead className="border-r px-2">Note</TableHead>
              <TableHead className="w-24 border-r px-2">Metodo</TableHead>
              <TableHead className="w-20 border-r px-2 text-center">Fattura</TableHead>
              <TableHead className="w-24 text-right px-2">Importo</TableHead>
              <TableHead className="w-20 px-2 text-center">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {speseFiltrate.map((spesa, i) => (
              <TableRow key={spesa.id} className="h-8 border-b">
                <TableCell className="text-center border-r px-2 py-0">
                  <Checkbox 
                    checked={selectedIds.has(spesa.id)} 
                    onCheckedChange={(checked) => {
                      const newSet = new Set(selectedIds)
                      if (checked) newSet.add(spesa.id)
                      else newSet.delete(spesa.id)
                      setSelectedIds(newSet)
                    }} 
                  />
                </TableCell>
                <TableCell className="text-center font-mono border-r px-2 py-0 text-muted-foreground">
                  {spesa.numero_operazione || spese.length - i}
                </TableCell>
                <TableCell className="border-r px-2 py-0">{spesa.data}</TableCell>
                <TableCell className="border-r px-2 py-0">{spesa.momento_anno}</TableCell>
                <TableCell className="border-r px-2 py-0 truncate">{spesa.voce_spesa}</TableCell>
                <TableCell className="text-muted-foreground border-r px-2 py-0 truncate">{spesa.note}</TableCell>
                <TableCell className="border-r px-1 py-0 font-medium">
                  <Select 
                    value={normalizeMetodoDisplay(spesa.metodo)} 
                    onValueChange={(newVal) => handleUpdateMetodoSpesa(spesa, newVal || 'Contanti')}
                  >
                    <SelectTrigger className="h-6 w-full text-xs border-0 focus:ring-0 shadow-none bg-transparent font-semibold px-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Contanti" className="text-xs">Contanti</SelectItem>
                      <SelectItem value="Bonifico" className="text-xs">Bonifico</SelectItem>
                      <SelectItem value="Carta" className="text-xs">Carta</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="border-r px-2 py-0 text-center">
                  {spesa.foto_scontrino_url ? (
                    <div 
                      className="inline-flex items-center justify-center p-1 rounded-md bg-secondary text-primary cursor-pointer hover:bg-secondary/80" 
                      onClick={() => viewSecureScontrino(spesa.foto_scontrino_url!)}
                      title="Vedi scontrino allegato"
                    >
                      <Paperclip className="w-4 h-4" />
                    </div>
                  ) : spesa.ricevuta_presente ? 'SI' : ''}
                </TableCell>
                <TableCell className={`text-right font-bold px-2 py-0 ${spesa.tipo_movimento === 'ENTRATA' ? 'text-green-600' : 'text-red-600'}`}>
                  {spesa.tipo_movimento === 'ENTRATA' ? '+' : '-'}€{spesa.importo.toFixed(2)}
                </TableCell>
                <TableCell className="text-center px-1 py-0">
                  <div className="flex justify-center">
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-blue-600" onClick={() => {
                      setEditingSpesa(spesa)
                      setFormData({
                        voce_spesa: spesa.voce_spesa || '',
                        importo: spesa.importo.toString(),
                        metodo: toCanonicalMetodo(spesa.metodo),
                        momento_anno: spesa.momento_anno || 'ANNO',
                        note: spesa.note || '',
                        tipo_movimento: spesa.tipo_movimento || 'USCITA'
                      })
                      setIsOpen(true)
                    }}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500" onClick={() => deleteSpesa(spesa.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {speseFiltrate.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-4">Nessun movimento trovato per questa vista.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      </Tabs>
    </div>
  )
}
