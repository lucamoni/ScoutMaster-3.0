'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { 
  Check, 
  X, 
  Search, 
  FileText, 
  ShieldCheck, 
  HeartPulse, 
  FileCheck, 
  MessageCircle, 
  Sparkles, 
  Upload, 
  Loader2, 
  Camera, 
  CheckCircle2, 
  Users, 
  Plus, 
  AlertTriangle,
  UserPlus,
  RefreshCw,
  Trash2,
  FolderArchive,
  Download,
  Eye,
  File,
  Paperclip,
  UserCheck,
  Info
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'

type Ragazzo = Database['public']['Tables']['ragazzi']['Row']
type PrivacyField = 'foglio_privacy_firmato' | 'partecipazione_ci' | 'scheda_medica_ci' | 'partecipazione_ce' | 'scheda_medica_ce' | 'quota_censimento' | 'ricevuta_censimento'

interface CustomDocPerRagazzo {
  ragazzo_id: string
  doc_id: string
  titolo: string
  consegnato: boolean
}

interface ArchivedDocumentFile {
  id: string
  ragazzo_id: string
  ragazzo_nome: string
  titolo_documento: string
  tipo_documento: string
  file_name: string
  file_url: string
  mime_type: string
  created_at: string
}

export function PrivacyClient({ ragazzi: initialRagazzi }: { ragazzi: Ragazzo[] }) {
  const supabase = createClient()
  const [ragazzi, setRagazzi] = useState<Ragazzo[]>(initialRagazzi)
  const [searchTerm, setSearchTerm] = useState('')

  // Documenti personalizzati per singolo ragazzo
  const [customDocs, setCustomDocs] = useState<CustomDocPerRagazzo[]>([])
  const [isAddCustomDocOpen, setIsAddCustomDocOpen] = useState(false)
  const [targetRagazzoForDoc, setTargetRagazzoForDoc] = useState<Ragazzo | null>(null)
  const [newCustomDocTitolo, setNewCustomDocTitolo] = useState('')

  // Archivio File Documenti Salvati (PDF / Immagini)
  const [archivedFiles, setArchivedFiles] = useState<ArchivedDocumentFile[]>([])
  const [isArchivioModalOpen, setIsArchivioModalOpen] = useState(false)
  const [targetRagazzoForArchivio, setTargetRagazzoForArchivio] = useState<Ragazzo | null>(null)
  const [isUploadingToArchivio, setIsUploadingToArchivio] = useState(false)

  // Stato per Caricamento ed Analisi AI
  const [isAiUploadOpen, setIsAiUploadOpen] = useState(false)
  const [targetScoutForAi, setTargetScoutForAi] = useState<Ragazzo | null>(null)
  const [isScanning, setIsScanning] = useState(false)
  const [scanResult, setScanResult] = useState<any>(null)
  const [selectedCategory, setSelectedCategory] = useState<string>('foglio_privacy_firmato')
  const [shouldUpdateAnagrafica, setShouldUpdateAnagrafica] = useState<boolean>(true)
  const [scannedFileObj, setScannedFileObj] = useState<File | null>(null)

  // Stato per Azione di Gruppo / Squadriglia
  const [isBulkOpen, setIsBulkOpen] = useState(false)
  const [bulkSquadriglia, setBulkSquadriglia] = useState<string>('TUTTE')
  const [bulkField, setBulkField] = useState<PrivacyField>('foglio_privacy_firmato')
  const [bulkValue, setBulkValue] = useState<boolean>(true)
  const [isApplyingBulk, setIsApplyingBulk] = useState(false)

  // Carica dati da Supabase
  useEffect(() => {
    async function loadData() {
      const [{ data: cDocs }, { data: aFiles }] = await Promise.all([
        supabase.from('impostazioni').select('valore').eq('chiave', 'custom_docs_ragazzi').maybeSingle(),
        supabase.from('impostazioni').select('valore').eq('chiave', 'archivio_documenti_digitale').maybeSingle()
      ])

      if (cDocs && cDocs.valore) {
        try {
          const parsed = JSON.parse(cDocs.valore)
          if (Array.isArray(parsed)) setCustomDocs(parsed)
        } catch {}
      }

      if (aFiles && aFiles.valore) {
        try {
          const parsed = JSON.parse(aFiles.valore)
          if (Array.isArray(parsed)) setArchivedFiles(parsed)
        } catch {}
      }
    }
    loadData()
  }, [])

  const saveCustomDocsToDb = async (newList: CustomDocPerRagazzo[]) => {
    setCustomDocs(newList)
    await supabase.from('impostazioni').upsert([
      { chiave: 'custom_docs_ragazzi', valore: JSON.stringify(newList) }
    ])
  }

  const saveArchivedFilesToDb = async (newList: ArchivedDocumentFile[]) => {
    setArchivedFiles(newList)
    await supabase.from('impostazioni').upsert([
      { chiave: 'archivio_documenti_digitale', valore: JSON.stringify(newList) }
    ])
  }

  const cleanFileNameToTitle = (fileName: string) => {
    return fileName
      .replace(/\.[^/.]+$/, "")
      .replace(/[_-]/g, " ")
      .trim()
  }

  const handleAddCustomDocForScout = async () => {
    if (!targetRagazzoForDoc || !newCustomDocTitolo.trim()) {
      toast.error('Inserisci il nome del documento specifico')
      return
    }

    const newItem: CustomDocPerRagazzo = {
      ragazzo_id: targetRagazzoForDoc.id,
      doc_id: 'cd_' + Date.now(),
      titolo: newCustomDocTitolo.trim(),
      consegnato: false
    }

    const updated = [...customDocs, newItem]
    await saveCustomDocsToDb(updated)
    toast.success(`Documento "${newItem.titolo}" aggiunto per ${targetRagazzoForDoc.nome}!`)
    setNewCustomDocTitolo('')
    setIsAddCustomDocOpen(false)
  }

  const toggleCustomDocStatus = async (docId: string) => {
    const updated = customDocs.map(cd => cd.doc_id === docId ? { ...cd, consegnato: !cd.consegnato } : cd)
    await saveCustomDocsToDb(updated)
  }

  const deleteCustomDoc = async (docId: string) => {
    const updated = customDocs.filter(cd => cd.doc_id !== docId)
    await saveCustomDocsToDb(updated)
    toast.success('Documento personalizzato rimosso')
  }

  const handleDeleteArchivedFile = async (fileId: string) => {
    if (!confirm('Eliminare questo documento salvato dall\'archivio?')) return
    const updated = archivedFiles.filter(af => af.id !== fileId)
    await saveArchivedFilesToDb(updated)
    toast.success('File rimosso dall\'Archivio Digitale')
  }

  const toggleStatus = async (
    id: string,
    field: PrivacyField,
    currentValue: boolean | null
  ) => {
    const newValue = !currentValue
    setRagazzi(prev => prev.map(r => r.id === id ? { ...r, [field]: newValue } : r))
    await supabase.from('ragazzi').update({ [field]: newValue } as Database['public']['Tables']['ragazzi']['Update']).eq('id', id)
  }

  // Scansione ed Analisi IA Documento
  const handleFileUploadWithAi = async (file: File) => {
    setIsScanning(true)
    setScanResult(null)
    setScannedFileObj(file)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/ocr/documento', {
        method: 'POST',
        body: formData
      })
      const result = await res.json()

      if (!res.ok || result.error) {
        throw new Error(result.error || 'Errore durante l\'analisi del documento')
      }

      setScanResult(result)
      
      // Auto-seleziona la categoria basata sul riconoscimento IA
      if (result.extracted) {
        const ext = result.extracted
        if (ext.scheda_medica_ci || ext.tipo_documento_riconosciuto?.includes('Invernale')) {
          setSelectedCategory('scheda_medica_ci')
        } else if (ext.scheda_medica_ce || ext.tipo_documento_riconosciuto?.includes('Estivo')) {
          setSelectedCategory('scheda_medica_ce')
        } else if (ext.ricevuta_censimento || ext.tipo_documento_riconosciuto?.includes('Censimento')) {
          setSelectedCategory('ricevuta_censimento')
        } else {
          setSelectedCategory('foglio_privacy_firmato')
        }
      }

      toast.success('Documento analizzato con successo dall\'IA!')
    } catch (err: any) {
      toast.error(err.message || 'Impossibile estrarre i dati dal documento')
    } finally {
      setIsScanning(false)
    }
  }

  const autoArchiveScannedFile = async (ragazzoId: string, ragazzoNome: string, tipoDocLabel: string) => {
    if (!scannedFileObj) return
    const reader = new FileReader()
    reader.onload = async (e) => {
      const base64Url = e.target?.result as string
      const titleClean = cleanFileNameToTitle(scannedFileObj.name)
      const newArchivedItem: ArchivedDocumentFile = {
        id: 'arch_' + Date.now(),
        ragazzo_id: ragazzoId,
        ragazzo_nome: ragazzoNome,
        titolo_documento: `${tipoDocLabel} (${titleClean})`,
        tipo_documento: selectedCategory,
        file_name: scannedFileObj.name,
        file_url: base64Url,
        mime_type: scannedFileObj.type,
        created_at: new Date().toISOString()
      }
      const updated = [newArchivedItem, ...archivedFiles]
      await saveArchivedFilesToDb(updated)
    }
    reader.readAsDataURL(scannedFileObj)
  }

  // Salva Documento e Spunta Categoria Selezionata
  const handleSaveDocForTargetScout = async () => {
    const scout = targetScoutForAi || scanResult?.matchedScout
    if (!scout || !scanResult || !scanResult.extracted) return
    const ext = scanResult.extracted

    const updatePayload: Record<string, any> = {}

    // Imposta la spunta per la categoria scelta dall'utente nella tendina
    if (selectedCategory in scout || ['foglio_privacy_firmato', 'partecipazione_ci', 'scheda_medica_ci', 'partecipazione_ce', 'scheda_medica_ce', 'quota_censimento', 'ricevuta_censimento'].includes(selectedCategory)) {
      updatePayload[selectedCategory] = true
    }

    // Se l'utente vuole applicare anche i dati anagrafici estratti dall'IA
    if (shouldUpdateAnagrafica && ext) {
      if (ext.codice_fiscale) updatePayload.codice_fiscale = ext.codice_fiscale
      if (ext.data_nascita) updatePayload.data_nascita = ext.data_nascita
      if (ext.pattuglia) updatePayload.pattuglia = ext.pattuglia
      if (ext.telefono_ragazzo) updatePayload.telefono_ragazzo = ext.telefono_ragazzo
      if (ext.genitore_1_nome) updatePayload.genitore_1_nome = ext.genitore_1_nome
      if (ext.genitore_1_telefono) updatePayload.genitore_1_telefono = ext.genitore_1_telefono
      if (ext.genitore_2_nome) updatePayload.genitore_2_nome = ext.genitore_2_nome
      if (ext.genitore_2_telefono) updatePayload.genitore_2_telefono = ext.genitore_2_telefono
    }

    try {
      const { error } = await supabase.from('ragazzi').update(updatePayload).eq('id', scout.id)
      if (error) throw error

      await autoArchiveScannedFile(scout.id, `${scout.nome} ${scout.cognome}`, getCategoryLabel(selectedCategory))

      toast.success(`Documento per ${scout.nome} ${scout.cognome} salvato in "${getCategoryLabel(selectedCategory)}" ed anagrafica aggiornata!`)
      setRagazzi(prev => prev.map(r => r.id === scout.id ? { ...r, ...updatePayload } : r))
      setIsAiUploadOpen(false)
      setScanResult(null)
      setScannedFileObj(null)
    } catch (err: any) {
      toast.error(err.message || 'Impossibile salvare il documento')
    }
  }

  const handleConfirmNewScoutFromOcr = async () => {
    if (!scanResult || !scanResult.extracted) return
    const ext = scanResult.extracted

    try {
      const newRagazzoPayload: Record<string, any> = {
        nome: ext.nome?.trim() || 'Sconosciuto',
        cognome: ext.cognome?.trim() || 'Sconosciuto',
        attivo: true,
        pattuglia: ext.pattuglia || null,
        sesso: ext.sesso || null,
        data_nascita: ext.data_nascita || null,
        codice_fiscale: ext.codice_fiscale || null,
        telefono_ragazzo: ext.telefono_ragazzo || null,
        genitore_1_nome: ext.genitore_1_nome || null,
        genitore_1_telefono: ext.genitore_1_telefono || null,
        genitore_2_nome: ext.genitore_2_nome || null,
        genitore_2_telefono: ext.genitore_2_telefono || null,
        [selectedCategory]: true
      }

      const { data, error } = await supabase.from('ragazzi').insert(newRagazzoPayload).select().single()
      if (error) throw error

      await autoArchiveScannedFile(data.id, `${data.nome} ${data.cognome}`, getCategoryLabel(selectedCategory))

      toast.success(`Nuovo ragazzo ${data.nome} ${data.cognome} aggiunto ed archiviato!`)
      setRagazzi(prev => [...prev, data])
      setIsAiUploadOpen(false)
      setScanResult(null)
      setScannedFileObj(null)
    } catch (err: any) {
      toast.error(err.message || 'Impossibile creare il nuovo ragazzo')
    }
  }

  const handleApplyBulk = async () => {
    setIsApplyingBulk(true)
    try {
      const targetRagazzi = ragazzi.filter(r => bulkSquadriglia === 'TUTTE' || r.pattuglia === bulkSquadriglia)
      const targetIds = targetRagazzi.map(r => r.id)

      if (targetIds.length === 0) {
        toast.error('Nessun ragazzo trovato per la squadriglia selezionata')
        return
      }

      setRagazzi(prev => prev.map(r => targetIds.includes(r.id) ? { ...r, [bulkField]: bulkValue } : r))

      const { error } = await supabase
        .from('ragazzi')
        .update({ [bulkField]: bulkValue } as Database['public']['Tables']['ragazzi']['Update'])
        .in('id', targetIds)

      if (error) throw error

      toast.success(`Aggiornati ${targetIds.length} ragazzi per la squadriglia ${bulkSquadriglia}!`)
      setIsBulkOpen(false)
    } catch (err: any) {
      toast.error(err.message || 'Errore durante l\'aggiornamento di gruppo')
    } finally {
      setIsApplyingBulk(false)
    }
  }

  const hasArchivedFile = (ragazzoId: string, fieldType: PrivacyField) => {
    return archivedFiles.some(af => af.ragazzo_id === ragazzoId && (af.tipo_documento === fieldType || af.tipo_documento.includes(fieldType)))
  }

  const getCategoryLabel = (catKey: string) => {
    switch (catKey) {
      case 'foglio_privacy_firmato': return 'Modulo Privacy AGESCI'
      case 'partecipazione_ci': return 'Autorizzazione Campo Invernale'
      case 'scheda_medica_ci': return 'Scheda Medica Campo Invernale'
      case 'partecipazione_ce': return 'Autorizzazione Campo Estivo'
      case 'scheda_medica_ce': return 'Scheda Medica Campo Estivo'
      case 'quota_censimento': return 'Quota Censimento'
      case 'ricevuta_censimento': return 'Ricevuta Censimento'
      default: return 'Certificato Medico / Altro Documento'
    }
  }

  const renderCell = (r: Ragazzo, field: PrivacyField) => {
    const value = r[field] as boolean | null
    const hasFile = hasArchivedFile(r.id, field)

    return (
      <button 
        onClick={() => toggleStatus(r.id, field, value)}
        className={cn(
          "w-full h-full min-h-[44px] flex flex-col items-center justify-center transition-colors hover:opacity-80 cursor-pointer border-r border-slate-100 last:border-r-0 relative group p-1",
          value ? (hasFile ? "bg-emerald-50 text-emerald-600 font-bold" : "bg-amber-50 text-amber-600 font-bold") : "bg-rose-50/60 text-rose-400"
        )}
        title={
          value 
            ? (hasFile ? "Consegnato + File in Archivio (clicca per modificare)" : "⚠️ CONSEGNATO MA FILE NON ANCORA CARICATO (clicca per modificare)") 
            : "Mancante (clicca per consegnare)"
        }
      >
        {value ? (
          <>
            <Check className="h-5 w-5 stroke-[2.5]" />
            {!hasFile ? (
              <span className="text-[9px] font-bold text-amber-700 bg-amber-100 px-1 rounded flex items-center gap-0.5 mt-0.5">
                <AlertTriangle className="w-2.5 h-2.5 text-amber-600" /> No File
              </span>
            ) : (
              <span className="text-[9px] font-medium text-emerald-700 flex items-center gap-0.5 mt-0.5">
                <Paperclip className="w-2.5 h-2.5" /> PDF
              </span>
            )}
          </>
        ) : (
          <X className="h-5 w-5 opacity-60" />
        )}
      </button>
    )
  }

  const filteredRagazzi = ragazzi.filter(r => {
    const name = `${r.nome || ''} ${r.cognome || ''} ${r.pattuglia || ''}`.toLowerCase()
    return name.includes(searchTerm.toLowerCase())
  })

  const pattuglie = Array.from(new Set(ragazzi.map(r => r.pattuglia).filter(Boolean))) as string[]

  const totale = ragazzi.length || 1
  const privacyFirmati = ragazzi.filter(r => r.foglio_privacy_firmato).length
  const schedeMedicheCI = ragazzi.filter(r => r.scheda_medica_ci).length
  const schedeMedicheCE = ragazzi.filter(r => r.scheda_medica_ce).length
  const ricevuteCensimento = ragazzi.filter(r => r.ricevuta_censimento).length

  const getWhatsAppReminder = (r: Ragazzo) => {
    const telefono = r.genitore_1_telefono || r.genitore_2_telefono || r.telefono_ragazzo
    if (!telefono) return null

    const mancanti: string[] = []
    if (!r.foglio_privacy_firmato) mancanti.push("Foglio Privacy AGESCI")
    if (!r.scheda_medica_ci) mancanti.push("Scheda Medica Campo Invernale")
    if (!r.scheda_medica_ce) mancanti.push("Scheda Medica Campo Estivo")
    if (!r.ricevuta_censimento) mancanti.push("Modulo Censimento")

    if (mancanti.length === 0) return null

    const cleanPhone = telefono.replace(/\D/g, '')
    const finalPhone = cleanPhone.startsWith('39') ? cleanPhone : '39' + cleanPhone
    const testo = `Ciao! Ti ricordiamo che per l'iscrizione ed le attività scout di ${r.nome} mancano ancora i seguenti documenti:\n${mancanti.map(m => `- ${m}`).join('\n')}\n\nGrazie per la collaborazione! Staff Reparto AGESCI.`

    return `https://wa.me/${finalPhone}?text=${encodeURIComponent(testo)}`
  }

  // Estrae i dati anagrafici utili per la preview nel box
  const hasExtractedAnagrafica = (ext: any) => {
    if (!ext) return false
    return !!(ext.codice_fiscale || ext.data_nascita || ext.pattuglia || ext.telefono_ragazzo || ext.genitore_1_nome || ext.genitore_1_telefono || ext.genitore_2_nome || ext.genitore_2_telefono)
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Intestazione */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <FileText className="w-8 h-8 text-agesci-blue" />
            Documenti & Privacy Reparto
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Gestisci le consegne, assegna le categorie ai documenti e controlla l'estrazione anagrafica IA.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => { setTargetRagazzoForArchivio(null); setIsArchivioModalOpen(true); }} variant="outline" className="border-slate-300 text-slate-800 hover:bg-slate-50 gap-2 font-medium text-xs">
            <FolderArchive className="w-4 h-4 text-purple-600" /> Archivio Digitale ({archivedFiles.length})
          </Button>

          <Button onClick={() => setIsBulkOpen(true)} variant="outline" className="border-slate-300 text-slate-800 hover:bg-slate-50 gap-2 font-medium text-xs">
            <Users className="w-4 h-4 text-agesci-blue" /> Azione Squadriglia
          </Button>

          <Button onClick={() => { setTargetScoutForAi(null); setIsAiUploadOpen(true); }} className="bg-agesci-blue hover:bg-agesci-blue-light text-amber-400 font-semibold gap-2 shadow-sm text-xs">
            <Sparkles className="w-4 h-4" /> 📄 Inserisci Documento Generale (AI)
          </Button>
        </div>
      </div>

      {/* KPI Cards Bento Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Modulo Privacy</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xl md:text-2xl font-bold text-slate-900 tabular-nums">
            {privacyFirmati} <span className="text-xs text-slate-400 font-normal">/ {totale}</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${(privacyFirmati / totale) * 100}%` }} />
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Medica C. Invernale</span>
            <HeartPulse className="w-4 h-4 text-sky-600" />
          </div>
          <div className="text-xl md:text-2xl font-bold text-slate-900 tabular-nums">
            {schedeMedicheCI} <span className="text-xs text-slate-400 font-normal">/ {totale}</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div className="bg-sky-500 h-full rounded-full" style={{ width: `${(schedeMedicheCI / totale) * 100}%` }} />
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Medica C. Estivo</span>
            <HeartPulse className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl md:text-2xl font-bold text-slate-900 tabular-nums">
            {schedeMedicheCE} <span className="text-xs text-slate-400 font-normal">/ {totale}</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div className="bg-amber-500 h-full rounded-full" style={{ width: `${(schedeMedicheCE / totale) * 100}%` }} />
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Ricevute Censimento</span>
            <FileCheck className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-xl md:text-2xl font-bold text-slate-900 tabular-nums">
            {ricevuteCensimento} <span className="text-xs text-slate-400 font-normal">/ {totale}</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div className="bg-purple-500 h-full rounded-full" style={{ width: `${(ricevuteCensimento / totale) * 100}%` }} />
          </div>
        </div>
      </div>

      {/* Barra di ricerca */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <Input 
          placeholder="Cerca per nome o pattuglia..." 
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="pl-9 h-10 bg-white"
        />
      </div>
      
      {/* Tabella Registri Documenti */}
      <div className="rounded-xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200/80">
              <tr>
                <th className="px-4 py-3 border-r border-slate-200/80">Esploratore / Guida</th>
                <th className="px-3 py-3 text-center border-r border-slate-200/80 w-24">Privacy</th>
                <th className="px-3 py-3 text-center border-r border-slate-200/80 w-24">Part. CI</th>
                <th className="px-3 py-3 text-center border-r border-slate-200/80 w-24">Medica CI</th>
                <th className="px-3 py-3 text-center border-r border-slate-200/80 w-24">Part. CE</th>
                <th className="px-3 py-3 text-center border-r border-slate-200/80 w-24">Medica CE</th>
                <th className="px-3 py-3 text-center border-r border-slate-200/80 w-24">Quota Cens.</th>
                <th className="px-3 py-3 text-center border-r border-slate-200/80 w-24">Ricevuta</th>
                <th className="px-3 py-3 border-r border-slate-200/80">Documenti Specifici / Caricamento AI Singolo</th>
                <th className="px-3 py-3 text-center w-16">WA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRagazzi.map((r, i) => {
                const waLink = getWhatsAppReminder(r)
                const ragazzoCustomDocs = customDocs.filter(cd => cd.ragazzo_id === r.id)
                const ragazzoArchivedFiles = archivedFiles.filter(af => af.ragazzo_id === r.id)

                return (
                  <tr key={r.id} className={cn("hover:bg-slate-50/80 transition-colors", i % 2 === 0 ? "bg-white" : "bg-slate-50/40")}>
                    <td className="px-4 py-2.5 border-r border-slate-100 font-medium">
                      <div className="font-semibold text-slate-900">{r.nome} {r.cognome}</div>
                      <div className="text-xs text-slate-500 font-normal">{r.pattuglia || 'Nessuna Pattuglia'}</div>
                    </td>
                    <td className="p-0">{renderCell(r, 'foglio_privacy_firmato')}</td>
                    <td className="p-0">{renderCell(r, 'partecipazione_ci')}</td>
                    <td className="p-0">{renderCell(r, 'scheda_medica_ci')}</td>
                    <td className="p-0">{renderCell(r, 'partecipazione_ce')}</td>
                    <td className="p-0">{renderCell(r, 'scheda_medica_ce')}</td>
                    <td className="p-0">{renderCell(r, 'quota_censimento')}</td>
                    <td className="p-0">{renderCell(r, 'ricevuta_censimento')}</td>

                    {/* Colonna Documenti Personalizzati & Azioni Caricamento AI per Persona */}
                    <td className="px-3 py-2 border-r border-slate-100">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {/* PULSANTE DEDICATO CARICAMENTO AI PER SINGOLO RAGAZZO */}
                        <Button 
                          size="sm" 
                          onClick={() => { setTargetScoutForAi(r); setIsAiUploadOpen(true); }}
                          className="h-7 text-[11px] bg-purple-700 hover:bg-purple-800 text-amber-300 font-semibold px-2.5 shadow-2xs gap-1"
                        >
                          <Sparkles className="w-3 h-3 text-amber-400" /> ⚡ Carica / Modifica Doc (AI)
                        </Button>

                        {ragazzoCustomDocs.map(cd => (
                          <Badge 
                            key={cd.doc_id}
                            variant="outline"
                            onClick={() => toggleCustomDocStatus(cd.doc_id)}
                            className={cn(
                              "cursor-pointer text-xs font-semibold py-1 px-2.5 gap-1 transition-colors",
                              cd.consegnato 
                                ? "bg-emerald-50 text-emerald-700 border-emerald-300" 
                                : "bg-rose-50 text-rose-700 border-rose-200"
                            )}
                          >
                            {cd.consegnato ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                            <span>{cd.titolo}</span>
                            <Trash2 
                              className="w-3 h-3 text-slate-400 hover:text-rose-600 ml-1" 
                              onClick={(e) => { e.stopPropagation(); deleteCustomDoc(cd.doc_id); }}
                            />
                          </Badge>
                        ))}

                        {ragazzoArchivedFiles.map(af => (
                          <Badge 
                            key={af.id} 
                            variant="secondary"
                            className="bg-purple-50 text-purple-800 border border-purple-200 text-[11px] font-medium gap-1 py-1 px-2 cursor-pointer hover:bg-purple-100"
                            onClick={() => { setTargetRagazzoForArchivio(r); setIsArchivioModalOpen(true); }}
                          >
                            <File className="w-3 h-3 text-purple-600" />
                            <span className="truncate max-w-[110px]">{af.titolo_documento}</span>
                          </Badge>
                        ))}

                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => { setTargetRagazzoForDoc(r); setIsAddCustomDocOpen(true); }}
                          className="h-7 text-[11px] text-agesci-blue hover:bg-sky-50 px-2 font-medium border border-dashed border-sky-300"
                        >
                          <Plus className="w-3 h-3 mr-1" /> Doc Specifico
                        </Button>
                      </div>
                    </td>

                    <td className="p-2 text-center">
                      {waLink ? (
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                          onClick={() => window.open(waLink, '_blank')}
                          title="Invia sollecito documenti su WhatsApp"
                        >
                          <MessageCircle className="w-4 h-4" />
                        </Button>
                      ) : (
                        <Check className="w-4 h-4 text-emerald-500 mx-auto opacity-50" />
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODALE CARICAMENTO ED ANALISI AI CON TENDINA CATEGORIA E SPECCHIETTO ANAGRAFICA */}
      <Dialog open={isAiUploadOpen} onOpenChange={setIsAiUploadOpen}>
        <DialogContent className="sm:max-w-[620px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg text-purple-900">
              <Sparkles className="w-5 h-5 text-amber-500" />
              {targetScoutForAi ? `Carica / Modifica Documento AI per ${targetScoutForAi.nome} ${targetScoutForAi.cognome}` : 'Inserisci Documento Generale AI'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Seleziona la foto o il PDF del documento. Gemini Vision AI analizzerà i dati e ti consentirà di scegliere la Categoria di assegnazione!
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="border-2 border-dashed border-purple-200 rounded-xl p-6 text-center hover:border-purple-500 transition-colors bg-purple-50/50">
              {isScanning ? (
                <div className="flex flex-col items-center justify-center space-y-2 py-4">
                  <Loader2 className="w-8 h-8 animate-spin text-purple-700" />
                  <span className="text-sm font-semibold text-purple-900">Analisi Gemini Vision IA in corso...</span>
                  <span className="text-xs text-slate-500">Riconoscimento testo ed estrazione dati anagrafici...</span>
                </div>
              ) : (
                <label className="cursor-pointer flex flex-col items-center justify-center space-y-2">
                  <Camera className="w-10 h-10 text-purple-600" />
                  <span className="text-sm font-semibold text-purple-950">Scatta foto o seleziona un file</span>
                  <span className="text-xs text-slate-400">Supporta JPG, PNG, PDF (Privacy, Schede Mediche, Tessere)</span>
                  <input 
                    type="file" 
                    accept="image/*,application/pdf" 
                    className="hidden" 
                    onChange={e => {
                      if (e.target.files?.[0]) handleFileUploadWithAi(e.target.files[0])
                    }} 
                  />
                </label>
              )}
            </div>

            {/* DOPO L'ANALISI: SELEZIONE CATEGORIA + SPECCHIETTO ANAGRAFICA */}
            {scanResult && scanResult.extracted && (
              <div className="space-y-4 pt-2">
                {/* TENDINA SELEZIONE CATEGORIA DOCUMENTO */}
                <div className="space-y-1.5 bg-purple-50 p-3.5 rounded-xl border border-purple-200">
                  <Label className="font-bold text-purple-950 flex items-center gap-1.5 text-xs">
                    <FileText className="w-4 h-4 text-purple-700" /> Categoria / Casella Documento da Assegnare:
                  </Label>
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger className="h-9 bg-white font-medium">
                      <SelectValue placeholder="Seleziona Categoria Documento" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="foglio_privacy_firmato">Modulo Privacy AGESCI</SelectItem>
                      <SelectItem value="partecipazione_ci">Autorizzazione Campo Invernale</SelectItem>
                      <SelectItem value="scheda_medica_ci">Scheda Medica Campo Invernale</SelectItem>
                      <SelectItem value="partecipazione_ce">Autorizzazione Campo Estivo</SelectItem>
                      <SelectItem value="scheda_medica_ce">Scheda Medica Campo Estivo</SelectItem>
                      <SelectItem value="quota_censimento">Quota Censimento</SelectItem>
                      <SelectItem value="ricevuta_censimento">Ricevuta Censimento</SelectItem>
                      <SelectItem value="Certificato Medico">Certificato Medico / Altro Documento</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="text-[11px] text-purple-700 mt-1">
                    Il file verrà archiviato e la spunta per <strong>"{getCategoryLabel(selectedCategory)}"</strong> verrà impostata su Consegnato (✅).
                  </div>
                </div>

                {/* SPECCHIETTO ESITO ANAGRAFICA E DATI RILEVATI DALL'IA */}
                {hasExtractedAnagrafica(scanResult.extracted) ? (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 space-y-2 text-emerald-950">
                    <div className="flex items-center justify-between font-bold text-xs">
                      <span className="flex items-center gap-1.5 text-emerald-800">
                        <UserCheck className="w-4 h-4 text-emerald-600" />
                        Dati Anagrafici Rilevati dall'IA:
                      </span>
                      <Badge className="bg-emerald-600 text-white text-[10px]">Trovati Dati</Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs bg-white p-2.5 rounded-lg border border-emerald-200/80">
                      {scanResult.extracted.codice_fiscale && <div><strong>Codice Fiscale:</strong> {scanResult.extracted.codice_fiscale}</div>}
                      {scanResult.extracted.data_nascita && <div><strong>Data Nascita:</strong> {scanResult.extracted.data_nascita}</div>}
                      {scanResult.extracted.pattuglia && <div><strong>Pattuglia:</strong> {scanResult.extracted.pattuglia}</div>}
                      {scanResult.extracted.genitore_1_nome && <div><strong>Genitore 1:</strong> {scanResult.extracted.genitore_1_nome} ({scanResult.extracted.genitore_1_telefono || ''})</div>}
                      {scanResult.extracted.genitore_2_nome && <div><strong>Genitore 2:</strong> {scanResult.extracted.genitore_2_nome} ({scanResult.extracted.genitore_2_telefono || ''})</div>}
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <Checkbox 
                        id="update_anag" 
                        checked={shouldUpdateAnagrafica} 
                        onCheckedChange={(v) => setShouldUpdateAnagrafica(!!v)}
                      />
                      <Label htmlFor="update_anag" className="text-xs text-emerald-900 font-medium cursor-pointer">
                        Aggiorna o completa i dati dell'anagrafica ragazzi con questi valori
                      </Label>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600 flex items-center gap-2">
                    <Info className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>Nessun dato anagrafico aggiuntivo presente nel documento. Verranno salvate la categoria ed il file in archivio.</span>
                  </div>
                )}

                {/* PULSANTE CONFERMA SALVATAGGIO */}
                <Button 
                  onClick={targetScoutForAi ? handleSaveDocForTargetScout : (scanResult.isNewScout ? handleConfirmNewScoutFromOcr : handleSaveDocForTargetScout)} 
                  size="sm" 
                  className="bg-purple-700 hover:bg-purple-800 text-white font-semibold text-xs gap-1.5 w-full py-2.5 shadow-sm"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Salva Documento in "{getCategoryLabel(selectedCategory)}" ed Spunta Consegnato
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* MODALE ARCHIVIO DIGITALE FILE SALVATI */}
      <Dialog open={isArchivioModalOpen} onOpenChange={setIsArchivioModalOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg text-purple-900">
              <FolderArchive className="w-5 h-5 text-purple-600" />
              Archivio Digitale Documenti {targetRagazzoForArchivio ? `di ${targetRagazzoForArchivio.nome} ${targetRagazzoForArchivio.cognome}` : 'Reparto'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Visualizza e gestisci i file originali salvati in archivio.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2 text-xs">
            <div className="space-y-2">
              <h3 className="font-bold text-slate-800 text-xs">File Salvati in Archivio ({targetRagazzoForArchivio ? archivedFiles.filter(a => a.ragazzo_id === targetRagazzoForArchivio.id).length : archivedFiles.length}):</h3>

              {(targetRagazzoForArchivio ? archivedFiles.filter(a => a.ragazzo_id === targetRagazzoForArchivio.id) : archivedFiles).length === 0 ? (
                <div className="p-6 text-center text-slate-400 border border-dashed rounded-xl">
                  Nessun file salvato in archivio per questo ragazzo.
                </div>
              ) : (
                <div className="divide-y border border-slate-200 rounded-xl overflow-hidden bg-white">
                  {(targetRagazzoForArchivio ? archivedFiles.filter(a => a.ragazzo_id === targetRagazzoForArchivio.id) : archivedFiles).map(af => (
                    <div key={af.id} className="p-3 flex items-center justify-between hover:bg-slate-50">
                      <div className="space-y-0.5">
                        <div className="font-bold text-slate-900 flex items-center gap-2">
                          <File className="w-4 h-4 text-purple-600 shrink-0" />
                          {af.titolo_documento}
                          <Badge variant="outline" className="text-[10px] bg-slate-50">{af.tipo_documento}</Badge>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {af.ragazzo_nome} • {af.file_name} • {new Date(af.created_at).toLocaleDateString()}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => {
                            const win = window.open()
                            win?.document.write(`<iframe src="${af.file_url}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`)
                          }}
                          className="h-8 text-xs gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" /> Apri File
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          onClick={() => handleDeleteArchivedFile(af.id)}
                          className="h-8 text-rose-600 hover:bg-rose-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODALE AGGIUNGI DOCUMENTO SPECIFICO SINGOLO RAGAZZO */}
      <Dialog open={isAddCustomDocOpen} onOpenChange={setIsAddCustomDocOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-agesci-blue flex items-center gap-2">
              <Plus className="w-4 h-4" /> Aggiungi Documento Specifico per {targetRagazzoForDoc?.nome} {targetRagazzoForDoc?.cognome}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Inserisci un documento unico o specifico richiesto a questo singolo ragazzo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <Label>Nome del Documento / Certificato</Label>
              <Input 
                value={newCustomDocTitolo}
                onChange={e => setNewCustomDocTitolo(e.target.value)}
                placeholder="es. Certificato Arrampicata / Delega"
                className="h-9"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsAddCustomDocOpen(false)}>Annulla</Button>
            <Button size="sm" onClick={handleAddCustomDocForScout} className="bg-agesci-blue hover:bg-agesci-blue-light text-white">
              Salva Documento Specifico
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODALE AZIONE SQUADRIGLIA / GRUPPO */}
      <Dialog open={isBulkOpen} onOpenChange={setIsBulkOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg text-agesci-blue">
              <Users className="w-5 h-5 text-agesci-blue" />
              Aggiornamento Documenti per Squadriglia
            </DialogTitle>
            <DialogDescription>
              Segna rapidamente uno specifico documento come consegnato o mancante per un'intera squadriglia o per tutti i ragazzi.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="space-y-1.5">
              <Label>Seleziona Squadriglia / Pattuglia</Label>
              <Select value={bulkSquadriglia} onValueChange={setBulkSquadriglia}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Seleziona squadriglia" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TUTTE">TUTTE LE SQUADRIGLIE</SelectItem>
                  {pattuglie.map(p => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Documento da Modificare</Label>
              <Select value={bulkField} onValueChange={(v: any) => setBulkField(v)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Seleziona documento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="foglio_privacy_firmato">Modulo Privacy AGESCI</SelectItem>
                  <SelectItem value="partecipazione_ci">Autorizzazione Campo Invernale</SelectItem>
                  <SelectItem value="scheda_medica_ci">Scheda Medica Campo Invernale</SelectItem>
                  <SelectItem value="partecipazione_ce">Autorizzazione Campo Estivo</SelectItem>
                  <SelectItem value="scheda_medica_ce">Scheda Medica Campo Estivo</SelectItem>
                  <SelectItem value="quota_censimento">Quota Censimento Pagata</SelectItem>
                  <SelectItem value="ricevuta_censimento">Ricevuta Censimento Consegnata</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Stato da Impostare</Label>
              <Select value={bulkValue ? 'true' : 'false'} onValueChange={v => setBulkValue(v === 'true')}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Seleziona stato" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">✅ Segna come CONSEGNATO / PAGATO</SelectItem>
                  <SelectItem value="false">❌ Segna come MANCANTE / NON PAGATO</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" size="sm" onClick={() => setIsBulkOpen(false)}>Annulla</Button>
            <Button size="sm" onClick={handleApplyBulk} disabled={isApplyingBulk} className="bg-agesci-blue hover:bg-agesci-blue-light text-white">
              {isApplyingBulk ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Applica a Squadriglia'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
