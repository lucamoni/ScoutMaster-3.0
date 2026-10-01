'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { ReceiptDialog } from '@/components/receipts/ReceiptDialog'
import { ReceiptFilePicker } from '@/components/receipts/ReceiptFilePicker'
import { receiptFileName, withReceiptUpload, deleteExpenseRecord } from '@/lib/receipts'
import { Database } from '@/types/database.types'
import { createClient } from '@/lib/supabase/client'
import { calculateAccountingBalances } from '@/lib/utils/accounting'
import { toCanonicalMetodo } from '@/lib/utils/payment'
import { isIncludedInAccounting } from '@/lib/utils/censusAccounting'
import { ReceiptOcrResult, scanReceiptLocally } from '@/lib/ocr/receipt'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Camera, Plus, Trash2, Settings2, Pencil, Check, X, Loader2, Receipt, Paperclip, Filter, Search } from 'lucide-react'
import { useSearchParams, useRouter } from 'next/navigation'
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
  includeCensus = false,
  startDate,
  endDate,
  initialCategorie,
  initialBalances = { contanti: 0, banca: 0 },
}: {
  startDate: string
  includeCensus?: boolean
  endDate: string
  initialSpese: Spesa[]
  initialCategorie: Categoria[]
  initialBalances?: { contanti: number; banca: number }
}) {
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [receiptExpense, setReceiptExpense] = useState<Spesa | null>(null)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const [keepScannedPhoto, setKeepScannedPhoto] = useState(true)
  const [scannerPreview, setScannerPreview] = useState<string | null>(null)
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
  const [deleteTargets, setDeleteTargets] = useState<Spesa[]>([])
  const [deleteFiles, setDeleteFiles] = useState(false)
  const [deletingMovements, setDeletingMovements] = useState(false)
  const [activeTab, setActiveTab] = useState('TUTTI')
  const [filterCategoria, setFilterCategoria] = useState('TUTTE')
  const [filterMomento, setFilterMomento] = useState('TUTTI')
  const [filterMetodo, setFilterMetodo] = useState('TUTTI')
  const [filterDataDa, setFilterDataDa] = useState('')
  const [filterDataA, setFilterDataA] = useState('')
  const [filterImportoMin, setFilterImportoMin] = useState('')
  const [filterImportoMax, setFilterImportoMax] = useState('')
  const [filterRicerca, setFilterRicerca] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  useEffect(() => { setSelectedIds(new Set()) }, [includeCensus])

  useEffect(() => { setSpese(initialSpese) }, [initialSpese])

  // Scanner Scontrino State
  const [isScannerOpen, setIsScannerOpen] = useState(false)
  const [scannerFile, setScannerFile] = useState<File | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [ocrData, setOcrData] = useState<ReceiptOcrResult | null>(null)
  useEffect(() => {
    if (!scannerFile) { setScannerPreview(null); return }
    const url = URL.createObjectURL(scannerFile)
    setScannerPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [scannerFile])

  
  const [formData, setFormData] = useState<{
    voce_spesa: string;
    importo: string;
    metodo: string;
    momento_anno: string;
    note: string;
    tipo_movimento: string;
    data?: string;
    ricevuta_presente?: boolean;
  }>({
    voce_spesa: initialCategorie[0]?.nome || '',
    importo: '',
    metodo: 'Contanti',
    momento_anno: 'ANNO',
    note: '',
    tipo_movimento: 'USCITA'
  })

  const supabase = createClient()

  const searchParams = useSearchParams()
  const router = useRouter()

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
            setSpese(prev => prev.some(s => s.id === newSpesa.id) || !newSpesa.data || newSpesa.data < startDate || newSpesa.data > endDate ? prev : [newSpesa, ...prev])
          } else if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Spesa
            setSpese(prev => [...prev.filter(s => s.id !== updated.id), ...(updated.data && updated.data >= startDate && updated.data <= endDate ? [updated] : [])])
          } else if (payload.eventType === 'DELETE') {
            const deleted = payload.old as Spesa
            setSpese(prev => prev.filter(s => s.id !== deleted.id))
          }
        }
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'impostazioni' }, () => router.refresh())
      .subscribe()

    const refresh = () => router.refresh()
    window.addEventListener('focus', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      supabase.removeChannel(channel)
    }
  }, [supabase, startDate, endDate, router])

  // Alias per compatibilità UI display
  const normalizeMetodoDisplay = toCanonicalMetodo

  // Census payments stay recorded but affect cash accounting only by explicit opt-in.
  const cassaSpese = spese.filter(
    movimento => (movimento.tipo_movimento === 'ENTRATA' || movimento.tipo_movimento === 'USCITA') && isIncludedInAccounting(movimento, includeCensus)
  )

  const categorieDisponibili = Array.from(new Set([
    ...categorie.map(c => c.nome),
    ...cassaSpese.map(s => s.voce_spesa),
  ])).filter((value): value is string => Boolean(value)).sort((a, b) => a.localeCompare(b))

  const momentiDisponibili = Array.from(new Set(
    cassaSpese.map(s => s.momento_anno).filter((value): value is string => Boolean(value))
  )).sort()

  // I filtri sono combinabili: tipo movimento, categoria, momento dell'anno,
  // metodo di pagamento, intervallo date, intervallo importi e ricerca libera.
  const speseFiltrate = cassaSpese.filter((spesa) => {
    if (activeTab !== 'TUTTI' && spesa.tipo_movimento !== activeTab) return false
    if (filterCategoria !== 'TUTTE' && spesa.voce_spesa !== filterCategoria) return false
    if (filterMomento !== 'TUTTI' && spesa.momento_anno !== filterMomento) return false

    const metodo = normalizeMetodoDisplay(spesa.metodo)
    if (filterMetodo === 'Contanti' && metodo !== 'Contanti') return false
    if (filterMetodo === 'Bonifico' && metodo !== 'Bonifico') return false
    if (filterMetodo === 'Carta' && metodo !== 'Carta') return false
    if (filterMetodo === 'Bonifico/Carta' && metodo !== 'Bonifico' && metodo !== 'Carta') return false

    const dataMovimento = spesa.data || ''
    if (filterDataDa && (!dataMovimento || dataMovimento < filterDataDa)) return false
    if (filterDataA && (!dataMovimento || dataMovimento > filterDataA)) return false

    const importo = Number(spesa.importo) || 0
    if (filterImportoMin !== '' && importo < Number(filterImportoMin)) return false
    if (filterImportoMax !== '' && importo > Number(filterImportoMax)) return false

    const ricerca = filterRicerca.trim().toLowerCase()
    if (ricerca) {
      const testo = [
        spesa.voce_spesa,
        spesa.note,
        spesa.tipo_movimento,
        spesa.momento_anno,
        metodo,
      ].filter(Boolean).join(' ').toLowerCase()
      if (!testo.includes(ricerca)) return false
    }

    return true
  })

  const filtroEntrate = speseFiltrate
    .filter(spesa => spesa.tipo_movimento === 'ENTRATA')
    .reduce((totale, spesa) => totale + (Number(spesa.importo) || 0), 0)
  const filtroUscite = speseFiltrate
    .filter(spesa => spesa.tipo_movimento === 'USCITA')
    .reduce((totale, spesa) => totale + (Number(spesa.importo) || 0), 0)

  const resetFiltri = () => {
    setActiveTab('TUTTI')
    setFilterCategoria('TUTTE')
    setFilterMomento('TUTTI')
    setFilterMetodo('TUTTI')
    setFilterDataDa('')
    setFilterDataA('')
    setFilterImportoMin('')
    setFilterImportoMax('')
    setFilterRicerca('')
    setSelectedIds(new Set())
  }

  const { entrateContanti: saldoEntrateContanti, entrateBanca: saldoEntrateBanca,
    usciteContanti: saldoUsciteContanti, usciteBanca: saldoUsciteBanca,
    saldoFinaleCassa: saldoContanti, saldoFinaleBanca: saldoBanca,
  } = calculateAccountingBalances(cassaSpese, initialBalances.contanti, initialBalances.banca, includeCensus)


  // Helper per la sincronizzazione inversa da Cassa verso Eventi / Uscite / Partecipazioni
  const syncSpesaMetodoWithDB = async (spesa: Spesa, newMetodo: string) => {
    const safeMetodo = toCanonicalMetodo(newMetodo)

    // 1. Se collegata a una specifica partecipazione evento
    if (spesa.partecipazione_evento_id) {
      const res = await supabase.from('partecipazioni_eventi')
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
            const resEv = await supabase.from('eventi').update({ metodo_pagamento: safeMetodo }).eq('id', ev.id)
            if (resEv.error && (resEv.error.code === '23514' || resEv.error.message?.includes('metodo'))) {
              await supabase.from('eventi').update({ metodo_pagamento: safeMetodo.toUpperCase() }).eq('id', ev.id)
            }
            const resPart = await supabase.from('partecipazioni_eventi').update({ metodo_pagamento: safeMetodo }).eq('evento_id', ev.id)
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

  const saveMovement = async (expense: Spesa | null, file: File | null) => {
    const amount = Number(formData.importo)
    const movementDate = formData.data || expense?.data || new Date().toISOString().split('T')[0]
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Inserisci un importo maggiore di zero')
    if (!formData.voce_spesa.trim()) throw new Error('Seleziona una voce di bilancio')
    const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(movementDate) ? new Date(`${movementDate}T00:00:00Z`) : null
    if (!parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== movementDate) throw new Error('Inserisci una data valida')
    return withReceiptUpload(supabase, file, async path => {
      const payload = {
        voce_spesa: formData.voce_spesa, importo: amount,
        metodo: toCanonicalMetodo(formData.metodo), momento_anno: formData.momento_anno,
        note: formData.note, tipo_movimento: formData.tipo_movimento, data: movementDate,
        ricevuta_presente: formData.ricevuta_presente ?? expense?.ricevuta_presente ?? false,
        ...(path ? { foto_scontrino_url: path, ricevuta_presente: true } : {}),
      }
      const write = (metodo: string) => {
        if (!expense) return supabase.from('registro_spese').insert({ ...payload, metodo }).select('*').single()
        let query = supabase.from('registro_spese').update({ ...payload, metodo }).eq('id', expense.id)
        if (path) query = expense.foto_scontrino_url === null
          ? query.is('foto_scontrino_url', null) : query.eq('foto_scontrino_url', expense.foto_scontrino_url)
        return query.select('*').single()
      }
      let result = await write(payload.metodo)
      if (result.error && (result.error.code === '23514' || result.error.message?.toLowerCase().includes('metodo'))) result = await write(payload.metodo.toUpperCase())
      if (result.error || !result.data) throw new Error(result.error?.message || 'Movimento non salvato: ricarica la pagina e riprova')
      return result.data
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    try {
      if (editingSpesa && toCanonicalMetodo(editingSpesa.metodo) !== toCanonicalMetodo(formData.metodo)) await syncSpesaMetodoWithDB(editingSpesa, toCanonicalMetodo(formData.metodo))
      const saved = await saveMovement(editingSpesa, receiptFile)
      setSpese(prev => [saved, ...prev.filter(s => s.id !== saved.id)])
      setReceiptFile(null)
      setIsOpen(false)
      toast.success(receiptFile ? 'Movimento e allegato salvati' : 'Movimento salvato')
      router.refresh()
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Salvataggio non riuscito') }
    finally { savingRef.current = false; setSaving(false) }
  }

  const deleteSpesa = async (id: string) => {
    setDeleteFiles(false)
    setDeleteTargets(spese.filter(s => s.id === id))
  }

  const confirmDeleteMovements = async () => {
    if (deletingMovements) return
    setDeletingMovements(true)
    try {
      for (const expense of deleteTargets) {
        const warnings = await deleteExpenseRecord(supabase, expense, deleteFiles)
        setSpese(prev => prev.filter(row => row.id !== expense.id))
        setDeleteTargets(prev => prev.filter(row => row.id !== expense.id))
        setSelectedIds(prev => new Set([...prev].filter(id => id !== expense.id)))
        warnings.forEach(message => toast.warning(message))
      }
      toast.success('Movimenti eliminati')
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Eliminazione non riuscita') }
    finally { setDeletingMovements(false); router.refresh() }
  }

  const handleAddCategoria = async (e: React.FormEvent) => {
    e.preventDefault()
    if(!newCatName) return;
    const { data, error } = await supabase.from('categorie_spesa').insert({ nome: newCatName, tipo_movimento: newCatTipo }).select().single()
    if(error) {
      toast.error("Errore inserimento categoria: " + error.message)
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
      toast.error("Errore modifica categoria: " + error.message)
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
      const allowed = ['image/jpeg', 'image/png', 'image/webp']
      if (!allowed.includes(file.type) || file.size === 0 || file.size > 10 * 1024 * 1024) {
        toast.error('Carica un’immagine JPEG, PNG o WebP fino a 10 MB')
        e.target.value = ''
        return
      }
      setScannerFile(file)
      await analyzeScontrino(file)
    }
  }

  const analyzeScontrino = async (fileToAnalyze: File) => {
    setIsProcessing(true)
    setOcrData(null)
    toast.info('Analisi scontrino in corso...', { id: 'ocr-scontrino' })
    try {
      const data = await scanReceiptLocally(fileToAnalyze, categorie.map(c => c.nome))
      
      setOcrData(data)
      
      // Pre-compila formData per la revisione
      setFormData(prev => ({
        ...prev,
        importo: data.importo?.toString() || '',
        data: data.data || new Date().toISOString().split('T')[0],
        metodo: 'Contanti',
        voce_spesa: categorie.find(c => c.nome === data.voce_spesa)?.nome || categorie[0]?.nome || '',
        note: data.fornitore || '',
        tipo_movimento: 'USCITA' // Assumiamo uscita per gli scontrini
      }))

      toast.success('Scontrino letto sul dispositivo. Controlla i dati.', { id: 'ocr-scontrino' })
    } catch (err: unknown) {
      console.error(err)
      const errMsg = err instanceof Error ? err.message : 'Errore sconosciuto'
      toast.error(`Impossibile analizzare lo scontrino: ${errMsg}`, { id: 'ocr-scontrino' })
      setOcrData({
        provider: 'paddleocr-browser',
        importo: null,
        data: null,
        fornitore: null,
        voce_spesa: null,
        confidence: 0,
        raw_text: '',
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleSaveScannedScontrino = async () => {
    if (!scannerFile || savingRef.current) return
    savingRef.current = true
    setIsProcessing(true)
    try {
      const saved = await saveMovement(null, keepScannedPhoto ? scannerFile : null)
      setSpese(prev => [saved, ...prev.filter(s => s.id !== saved.id)])
      setIsScannerOpen(false)
      setScannerFile(null)
      setOcrData(null)
      toast.success(keepScannedPhoto ? 'Spesa salvata con la foto dello scontrino' : 'Spesa salvata senza allegato')
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Errore salvataggio scontrino') }
    finally { savingRef.current = false; setIsProcessing(false) }
  }

  return (
    <div className="space-y-6">
      {receiptExpense && <ReceiptDialog key={receiptExpense.id} expense={receiptExpense} onClose={() => setReceiptExpense(null)} onSaved={saved => setSpese(prev => prev.map(s => s.id === saved.id ? saved : s))} onDeleted={id => { setSpese(prev => prev.filter(s => s.id !== id)); router.refresh() }} />}
      <Dialog open={deleteTargets.length > 0} onOpenChange={open => { if (!open && !deletingMovements) setDeleteTargets([]) }}>
        <DialogContent><DialogHeader><DialogTitle>Elimina {deleteTargets.length === 1 ? 'movimento' : `${deleteTargets.length} movimenti`}</DialogTitle><DialogDescription>I movimenti verranno rimossi dal bilancio. Eventuali quote collegate torneranno da saldare.</DialogDescription></DialogHeader>
          {deleteTargets.some(row => row.foto_scontrino_url) && <div className="space-y-2"><label className="flex items-center gap-2"><input type="checkbox" checked={deleteFiles} disabled={deletingMovements} onChange={event => setDeleteFiles(event.target.checked)} /> Elimina anche gli scontrini e i file allegati</label><p className="text-sm text-muted-foreground">Se non selezioni questa opzione, i file restano nell’archivio tra quelli senza movimento. L’eliminazione dei file è definitiva.</p></div>}
          <DialogFooter><Button variant="outline" disabled={deletingMovements} onClick={() => setDeleteTargets([])}>Annulla</Button><Button variant="destructive" disabled={deletingMovements} onClick={confirmDeleteMovements}>{deletingMovements ? 'Eliminazione…' : 'Conferma eliminazione'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="flex justify-end"><Link href="/cassa/archivio" className="inline-flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm"><Paperclip className="h-4 w-4" /> Archivio scontrini e file</Link></div>
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
        <Dialog open={isOpen} onOpenChange={(open) => { if (saving) return; setIsOpen(open); if(!open) { setEditingSpesa(null); setReceiptFile(null); } }}>
          <DialogTrigger className="flex-1 md:flex-none inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground shadow hover:bg-primary/90 h-9 px-4 py-2" onClick={() => {
            setReceiptFile(null)
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
            onClick={() => { window.location.href = '/impostazioni' }}
          >
            <Settings2 className="mr-2 h-4 w-4" /> Configura importazione Sheets
          </Button>
          <DialogContent className="max-h-[90dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingSpesa ? 'Modifica Movimento' : 'Registra Movimento'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit}><fieldset disabled={saving} className="space-y-4">
              <div className="space-y-2"><Label htmlFor="movement-date">Data del movimento</Label><Input id="movement-date" type="date" required value={formData.data ?? editingSpesa?.data ?? new Date().toLocaleDateString('sv-SE')} onChange={event => setFormData({ ...formData, data: event.target.value })} /></div>
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
              {editingSpesa?.foto_scontrino_url && <p className="text-xs text-muted-foreground break-all">Allegato attuale: {receiptFileName(editingSpesa.foto_scontrino_url)}. Carica un file per sostituirlo.</p>}
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={formData.ricevuta_presente ?? editingSpesa?.ricevuta_presente ?? false} onChange={event => setFormData({ ...formData, ricevuta_presente: event.target.checked })} /> Ricevuta presente (anche cartacea)</label>
              <ReceiptFilePicker file={receiptFile} onChange={setReceiptFile} disabled={saving} />
              <Button type="submit" className="w-full" disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salva movimento{receiptFile ? ' e allegato' : ''}</Button>
            </fieldset></form>
          </DialogContent>
        </Dialog>

        <Button variant="secondary" className="flex-1 md:flex-none text-blue-600 bg-blue-100 hover:bg-blue-200" onClick={() => {
          setScannerFile(null)
          setKeepScannedPhoto(true)
          setFormData({ voce_spesa: '', importo: '', metodo: 'Contanti', momento_anno: 'ANNO', note: '', tipo_movimento: 'USCITA' })
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
        <Dialog open={isScannerOpen} onOpenChange={open => { if (!isProcessing) setIsScannerOpen(open) }}>
          <DialogContent className="sm:max-w-[500px] max-h-[90dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Acquisisci Scontrino</DialogTitle>
              <DialogDescription>
                Scatta o carica uno scontrino per compilare la spesa. Puoi conservare la foto come allegato.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              {!scannerFile ? (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => document.getElementById('scontrino-camera')?.click()}><Camera className="mr-2 h-4 w-4" /> Scatta foto</Button>
                  <Button variant="outline" onClick={() => document.getElementById('scontrino-upload')?.click()}><Paperclip className="mr-2 h-4 w-4" /> Scegli foto</Button>
                  <input id="scontrino-camera" aria-label="Fotografa scontrino da scansionare" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={handleScannerFileChange} />
                  <input id="scontrino-upload" aria-label="Carica foto da scansionare" type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleScannerFileChange} />
                </div>
              ) : (
                <div className="space-y-4">
                  {isProcessing && !ocrData && (
                    <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                      <Loader2 className="w-8 h-8 animate-spin mb-2" />
                      <p className="text-sm">Lettura scontrino in corso...</p>
                    </div>
                  )}

                  {/* Local photo preview: do not send the blob through an image proxy. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {scannerPreview && <img src={scannerPreview} alt="Foto dello scontrino da registrare" className="max-h-40 w-full rounded border object-contain" />}
                  <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={keepScannedPhoto} disabled={isProcessing} onChange={e => setKeepScannedPhoto(e.target.checked)} /> Conserva la foto come allegato della spesa, disponibile anche nell’archivio</label>
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
              <Button variant="outline" disabled={isProcessing} onClick={() => setIsScannerOpen(false)}>Annulla</Button>
              {scannerFile && ocrData && (
                <Button onClick={handleSaveScannedScontrino} disabled={isProcessing}>
                  {isProcessing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {keepScannedPhoto ? 'Salva spesa e foto' : 'Salva solo la spesa'}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex justify-between items-center mb-4">
          <TabsList>
            <TabsTrigger value="TUTTI">Tutti i Movimenti</TabsTrigger>
            <TabsTrigger value="ENTRATA" className="text-green-600 data-[state=active]:text-green-700">Solo Entrate</TabsTrigger>
            <TabsTrigger value="USCITA" className="text-red-600 data-[state=active]:text-red-700">Solo Uscite</TabsTrigger>
          </TabsList>
          
          {selectedIds.size > 0 && (
            <Button variant="destructive" size="sm" onClick={() => {
              setDeleteFiles(false)
              setDeleteTargets(spese.filter(row => selectedIds.has(row.id)))
            }}>
              <Trash2 className="w-4 h-4 mr-2" /> Elimina selezionati ({selectedIds.size})
            </Button>
          )}
        </div>

          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Filter className="h-4 w-4 text-primary" />
                Filtri movimenti
                <span className="text-xs font-normal text-slate-500">
                  ({speseFiltrate.length} di {cassaSpese.length})
                </span>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={resetFiltri} className="h-8 text-xs">
                Azzera filtri
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
              <Select value={filterCategoria} onValueChange={v => setFilterCategoria(v || 'TUTTE')}>
                <SelectTrigger className="h-9 bg-white text-xs"><SelectValue placeholder="Categoria" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TUTTE">Tutte le categorie</SelectItem>
                  {categorieDisponibili.map(categoria => (
                    <SelectItem key={categoria} value={categoria}>{categoria}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterMomento} onValueChange={v => setFilterMomento(v || 'TUTTI')}>
                <SelectTrigger className="h-9 bg-white text-xs"><SelectValue placeholder="Momento" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TUTTI">Tutti i momenti</SelectItem>
                  <SelectItem value="ANNO">Anno</SelectItem>
                  <SelectItem value="CI">Campo Invernale</SelectItem>
                  <SelectItem value="CE">Campo Estivo</SelectItem>
                  {momentiDisponibili.filter(momento => !['ANNO', 'CI', 'CE'].includes(momento)).map(momento => (
                    <SelectItem key={momento} value={momento}>{momento}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterMetodo} onValueChange={v => setFilterMetodo(v || 'TUTTI')}>
                <SelectTrigger className="h-9 bg-white text-xs"><SelectValue placeholder="Metodo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="TUTTI">Tutti i metodi</SelectItem>
                  <SelectItem value="Contanti">Contanti</SelectItem>
                  <SelectItem value="Bonifico/Carta">Bonifico / Carta</SelectItem>
                  <SelectItem value="Bonifico">Solo bonifico</SelectItem>
                  <SelectItem value="Carta">Solo carta</SelectItem>
                </SelectContent>
              </Select>

              <div className="relative sm:col-span-2 lg:col-span-1">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  value={filterRicerca}
                  onChange={e => setFilterRicerca(e.target.value)}
                  placeholder="Cerca voce o nota..."
                  className="h-9 bg-white pl-8 text-xs"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <Input type="date" value={filterDataDa} onChange={e => setFilterDataDa(e.target.value)} className="h-9 bg-white text-xs" aria-label="Data da" />
                <span className="text-xs text-slate-400">—</span>
                <Input type="date" value={filterDataA} onChange={e => setFilterDataA(e.target.value)} className="h-9 bg-white text-xs" aria-label="Data a" />
              </div>

              <div className="flex items-center gap-1.5">
                <Input type="number" min="0" step="0.01" value={filterImportoMin} onChange={e => setFilterImportoMin(e.target.value)} placeholder="Importo min" className="h-9 bg-white text-xs" aria-label="Importo minimo" />
                <span className="text-xs text-slate-400">—</span>
                <Input type="number" min="0" step="0.01" value={filterImportoMax} onChange={e => setFilterImportoMax(e.target.value)} placeholder="Importo max" className="h-9 bg-white text-xs" aria-label="Importo massimo" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs">
              <div className="rounded-lg bg-white px-3 py-2 text-slate-600">
                <span className="block text-[10px] uppercase tracking-wide text-slate-400">Movimenti</span>
                <strong className="text-slate-900">{speseFiltrate.length}</strong>
              </div>
              <div className="rounded-lg bg-white px-3 py-2 text-green-700">
                <span className="block text-[10px] uppercase tracking-wide text-slate-400">Entrate filtrate</span>
                <strong>€{filtroEntrate.toFixed(2)}</strong>
              </div>
              <div className="rounded-lg bg-white px-3 py-2 text-red-700">
                <span className="block text-[10px] uppercase tracking-wide text-slate-400">Uscite filtrate</span>
                <strong>€{filtroUscite.toFixed(2)}</strong>
              </div>
              <div className="rounded-lg bg-white px-3 py-2 text-primary">
                <span className="block text-[10px] uppercase tracking-wide text-slate-400">Saldo selezionato</span>
                <strong>€{(filtroEntrate - filtroUscite).toFixed(2)}</strong>
              </div>
            </div>
          </div>

        {/* Vista Tabellare Desktop */}
        <div className="hidden md:block rounded-md border bg-card overflow-hidden">
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
                  <Button variant="ghost" size="sm" className="h-7 px-1 text-xs" onClick={() => setReceiptExpense(spesa)} aria-label={`${spesa.foto_scontrino_url ? 'Apri allegato' : 'Aggiungi allegato'}: ${spesa.voce_spesa}`}>
                    <Paperclip className="mr-1 h-4 w-4" />{spesa.foto_scontrino_url ? 'Apri' : 'Allega'}
                  </Button>
                </TableCell>
                <TableCell className={`text-right font-bold px-2 py-0 ${spesa.tipo_movimento === 'ENTRATA' ? 'text-green-600' : 'text-red-600'}`}>
                  {spesa.tipo_movimento === 'ENTRATA' ? '+' : '-'}€{spesa.importo.toFixed(2)}
                </TableCell>
                <TableCell className="text-center px-1 py-0">
                  <div className="flex justify-center">
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-blue-600" onClick={() => {
                      setReceiptFile(null)
                      setEditingSpesa(spesa)
                      setFormData({
                        voce_spesa: spesa.voce_spesa || '',
                        importo: spesa.importo.toString(),
                        metodo: toCanonicalMetodo(spesa.metodo),
                        momento_anno: spesa.momento_anno || 'ANNO',
                        note: spesa.note || '',
                        tipo_movimento: spesa.tipo_movimento || 'USCITA',
                        data: spesa.data || '',
                        ricevuta_presente: spesa.ricevuta_presente ?? false
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

      {/* Vista Card Mobile */}
      <div className="md:hidden space-y-3">
        {speseFiltrate.map((spesa) => {
          const isEntrata = spesa.tipo_movimento === 'ENTRATA'
          return (
            <div key={spesa.id} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs space-y-2.5">
              <div className="flex justify-between items-start gap-2">
                <div className="flex flex-col">
                  <span className="font-bold text-slate-900 text-sm">{spesa.voce_spesa}</span>
                  <span className="text-xs text-slate-500">{spesa.data} • {spesa.momento_anno}</span>
                </div>
                <span className={`text-base font-extrabold tabular-nums ${isEntrata ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {isEntrata ? '+' : '-'}€{spesa.importo.toFixed(2)}
                </span>
              </div>

              {spesa.note && (
                <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100 font-medium">
                  {spesa.note}
                </p>
              )}

              <div className="flex justify-between items-center pt-1 border-t border-slate-100">
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                  {normalizeMetodoDisplay(spesa.metodo)}
                </span>

                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={() => setReceiptExpense(spesa)}>
                    <Paperclip className="w-3.5 h-3.5" /> {spesa.foto_scontrino_url ? 'Allegato' : 'Allega'}
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-600 touch-min" onClick={() => {
                    setReceiptFile(null)
                      setEditingSpesa(spesa)
                    setFormData({
                      voce_spesa: spesa.voce_spesa || '',
                      importo: spesa.importo.toString(),
                      metodo: toCanonicalMetodo(spesa.metodo),
                      momento_anno: spesa.momento_anno || 'ANNO',
                      note: spesa.note || '',
                      tipo_movimento: spesa.tipo_movimento || 'USCITA',
                        data: spesa.data || '',
                        ricevuta_presente: spesa.ricevuta_presente ?? false
                    })
                    setIsOpen(true)
                  }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-rose-500 touch-min" onClick={() => deleteSpesa(spesa.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
        {speseFiltrate.length === 0 && (
          <div className="p-6 text-center text-xs text-slate-500 border border-dashed rounded-xl">
            Nessun movimento registrato.
          </div>
        )}
      </div>
      </Tabs>
    </div>
  )
}
