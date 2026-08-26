'use client'

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { 
  FolderArchive, 
  FileText, 
  Search, 
  Download, 
  Eye, 
  Trash2, 
  Upload, 
  Loader2, 
  CheckCircle2, 
  Filter, 
  ShieldCheck, 
  HeartPulse, 
  FileCheck,
  File,
  Plus,
  Paperclip
} from 'lucide-react'
import { toast } from 'sonner'
import { createBrowserClient } from '@supabase/ssr'
import { Database } from '@/types/database.types'

type Ragazzo = Database['public']['Tables']['ragazzi']['Row']
type PrivacyField = 'foglio_privacy_firmato' | 'partecipazione_ci' | 'scheda_medica_ci' | 'partecipazione_ce' | 'scheda_medica_ce' | 'quota_censimento' | 'ricevuta_censimento'

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

export function ArchivioDocumentiClient({ initialRagazzi }: { initialRagazzi: Ragazzo[] }) {
  const [ragazzi] = useState<Ragazzo[]>(initialRagazzi)
  const [archivedFiles, setArchivedFiles] = useState<ArchivedDocumentFile[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedScout, setSelectedScout] = useState<string>('TUTTI')
  const [selectedTipoDoc, setSelectedTipoDoc] = useState<string>('TUTTI')
  
  // Modale per Anteprima / Visualizzazione veloce file
  const [previewFile, setPreviewFile] = useState<ArchivedDocumentFile | null>(null)

  // Modale Caricamento File
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [uploadRagazzoId, setUploadRagazzoId] = useState<string>('')
  const [selectedFileObj, setSelectedFileObj] = useState<File | null>(null)
  const [uploadTitolo, setUploadTitolo] = useState('')
  const [uploadTipoDoc, setUploadTipoDoc] = useState('foglio_privacy_firmato')
  const [isUploading, setIsUploading] = useState(false)

  const supabase = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Carica i file dall'archivio digitale Supabase
  useEffect(() => {
    async function loadArchivio() {
      const { data } = await supabase.from('impostazioni').select('valore').eq('chiave', 'archivio_documenti_digitale').maybeSingle()
      if (data && data.valore) {
        try {
          const parsed = JSON.parse(data.valore)
          if (Array.isArray(parsed)) setArchivedFiles(parsed)
        } catch {}
      }
    }
    loadArchivio()
  }, [])

  const saveArchivedFilesToDb = async (newList: ArchivedDocumentFile[]) => {
    setArchivedFiles(newList)
    await supabase.from('impostazioni').upsert([
      { chiave: 'archivio_documenti_digitale', valore: JSON.stringify(newList) }
    ])
  }

  // Pulisce il nome file eliminando estensione e tratti
  const cleanFileNameToTitle = (fileName: string) => {
    return fileName
      .replace(/\.[^/.]+$/, "")
      .replace(/[_-]/g, " ")
      .trim()
  }

  const handleFileSelection = (file: File) => {
    setSelectedFileObj(file)
    if (!uploadTitolo.trim()) {
      setUploadTitolo(cleanFileNameToTitle(file.name))
    }
  }

  const handleUploadFile = async () => {
    if (!uploadRagazzoId || !selectedFileObj) {
      toast.error('Seleziona sia l\'esploratore che il file da archiviare')
      return
    }
    const targetScout = ragazzi.find(r => r.id === uploadRagazzoId)
    if (!targetScout) return

    setIsUploading(true)
    try {
      const file = selectedFileObj
      const reader = new FileReader()
      reader.onload = async (e) => {
        const base64Url = e.target?.result as string
        const finalTitle = uploadTitolo.trim() || cleanFileNameToTitle(file.name)

        const newArchivedItem: ArchivedDocumentFile = {
          id: 'arch_' + Date.now(),
          ragazzo_id: targetScout.id,
          ragazzo_nome: `${targetScout.nome} ${targetScout.cognome}`,
          titolo_documento: finalTitle,
          tipo_documento: uploadTipoDoc,
          file_name: file.name,
          file_url: base64Url,
          mime_type: file.type,
          created_at: new Date().toISOString()
        }

        const updated = [newArchivedItem, ...archivedFiles]
        await saveArchivedFilesToDb(updated)

        // AUTOMATICO: Imposta spunta presente (true) in anagrafica ragazzi
        if (uploadTipoDoc in targetScout) {
          const field = uploadTipoDoc as PrivacyField
          await supabase.from('ragazzi').update({ [field]: true } as any).eq('id', targetScout.id)
        }

        toast.success(`Documento caricato ed AUTOMATICAMENTE SPUNTATO per ${targetScout.nome}!`)
        setIsUploading(false)
        setIsUploadOpen(false)
        setSelectedFileObj(null)
        setUploadTitolo('')
      }
      reader.readAsDataURL(file)
    } catch {
      toast.error('Impossibile salvare il documento')
      setIsUploading(false)
    }
  }

  const handleDeleteFile = async (fileId: string) => {
    if (!confirm('Sei sicuro di voler eliminare questo documento dall\'Archivio Digitale?')) return
    const updated = archivedFiles.filter(f => f.id !== fileId)
    await saveArchivedFilesToDb(updated)
    toast.success('Documento rimosso dall\'Archivio')
    if (previewFile?.id === fileId) setPreviewFile(null)
  }

  // Filtri avanzati
  const filteredFiles = archivedFiles.filter(file => {
    const matchesScout = selectedScout === 'TUTTI' || file.ragazzo_id === selectedScout
    const matchesTipo = selectedTipoDoc === 'TUTTI' || file.tipo_documento === selectedTipoDoc
    const matchesSearch = file.titolo_documento.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          file.ragazzo_nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          file.file_name.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesScout && matchesTipo && matchesSearch
  })

  // KPI summary
  const totalFiles = archivedFiles.length
  const totalPrivacy = archivedFiles.filter(f => f.tipo_documento === 'foglio_privacy_firmato' || f.tipo_documento === 'Modulo Privacy').length
  const totalSanitari = archivedFiles.filter(f => f.tipo_documento.includes('medica') || f.tipo_documento.includes('Medica')).length

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <FolderArchive className="w-8 h-8 text-purple-700" />
            Archivio Documenti Digitali
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Visualizzazione rapida in anteprima, auto-compilazione nomi file e sincronizzazione automatiche delle spunte.
          </p>
        </div>

        <Button onClick={() => setIsUploadOpen(true)} className="bg-purple-700 hover:bg-purple-800 text-white font-semibold gap-2 shadow-sm">
          <Upload className="w-4 h-4" /> 📤 Carica Nuovo File (Auto-Spunta)
        </Button>
      </div>

      {/* KPI Cards Bento Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Totale Documenti Archiviati</span>
            <FolderArchive className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {totalFiles} <span className="text-xs text-slate-400 font-normal">file salvati</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Moduli Privacy Archiviati</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {totalPrivacy} <span className="text-xs text-slate-400 font-normal">file</span>
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Schede Sanitarie & Certificati</span>
            <HeartPulse className="w-4 h-4 text-sky-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {totalSanitari} <span className="text-xs text-slate-400 font-normal">file</span>
          </div>
        </div>
      </div>

      {/* Barra Filtri Avanzati */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
        <div className="flex flex-wrap gap-2 flex-1">
          {/* Filtro Ragazzo */}
          <div className="w-full sm:w-48">
            <Select value={selectedScout} onValueChange={setSelectedScout}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Tutti gli Esploratori" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TUTTI">TUTTI GLI ESPLORATORI</SelectItem>
                {ragazzi.map(r => (
                  <SelectItem key={r.id} value={r.id}>{r.nome} {r.cognome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Filtro Tipo Documento */}
          <div className="w-full sm:w-44">
            <Select value={selectedTipoDoc} onValueChange={setSelectedTipoDoc}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Tipo Documento" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TUTTI">TUTTI I TIPI</SelectItem>
                <SelectItem value="foglio_privacy_firmato">Modulo Privacy</SelectItem>
                <SelectItem value="scheda_medica_ci">Scheda Medica CI</SelectItem>
                <SelectItem value="scheda_medica_ce">Scheda Medica CE</SelectItem>
                <SelectItem value="ricevuta_censimento">Ricevuta Censimento</SelectItem>
                <SelectItem value="Certificato Medico">Certificato Medico</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Ricerca Testuale */}
        <div className="relative max-w-xs w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input 
            placeholder="Cerca per titolo o nome..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-9 h-9 text-xs bg-white"
          />
        </div>
      </div>

      {/* Visualizzazione Veloce Grid dei Documenti Archiviati */}
      {filteredFiles.length === 0 ? (
        <div className="border border-dashed border-slate-200 rounded-2xl p-12 text-center bg-white space-y-3">
          <FolderArchive className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="font-bold text-slate-800 text-base">Nessun file presente nell'Archivio</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Utilizza il pulsante "Carica Nuovo File (Auto-Spunta)" per aggiungere file che verranno immediatamente contrassegnati come presenti.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {filteredFiles.map(file => (
            <Card key={file.id} className="flex flex-col justify-between border-slate-200/90 shadow-2xs hover:shadow-md transition-all rounded-xl bg-white group">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="bg-purple-50 text-purple-800 border-purple-200 text-xs font-semibold">
                    {file.tipo_documento}
                  </Badge>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7 text-slate-400 hover:text-rose-600" 
                    onClick={() => handleDeleteFile(file.id)}
                    title="Elimina File"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <CardTitle className="text-base font-bold text-slate-900 mt-2 line-clamp-1 flex items-center gap-2">
                  <File className="w-4 h-4 text-purple-600 shrink-0" />
                  {file.titolo_documento}
                </CardTitle>
              </CardHeader>

              <CardContent className="px-4 py-2 flex-1 space-y-1 text-xs text-slate-500">
                <div className="font-medium text-slate-800">Ragazzo: {file.ragazzo_nome}</div>
                <div>File: {file.file_name}</div>
                <div>Data: {new Date(file.created_at).toLocaleDateString()}</div>
              </CardContent>

              <CardFooter className="p-4 pt-3 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between rounded-b-xl gap-2">
                <Button 
                  size="sm"
                  variant="outline"
                  onClick={() => setPreviewFile(file)}
                  className="w-full border-purple-200 text-purple-800 hover:bg-purple-50 text-xs font-medium gap-1.5 rounded-xl"
                >
                  <Eye className="w-3.5 h-3.5" /> Anteprima Veloce
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* MODALE VISUALIZZATORE VELOCE ANTEPRIMA DOCUMENTO */}
      <Dialog open={!!previewFile} onOpenChange={(open) => !open && setPreviewFile(null)}>
        <DialogContent className="sm:max-w-[800px] h-[85vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-4 bg-purple-900 text-white flex flex-row items-center justify-between">
            <div>
              <DialogTitle className="text-base font-bold flex items-center gap-2 text-white">
                <Eye className="w-5 h-5 text-amber-400" />
                {previewFile?.titolo_documento}
              </DialogTitle>
              <DialogDescription className="text-xs text-purple-200 mt-0.5">
                Associato a: {previewFile?.ragazzo_nome} • {previewFile?.file_name}
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="flex-1 bg-slate-100 p-2 overflow-hidden">
            {previewFile && (
              <iframe 
                src={previewFile.file_url} 
                className="w-full h-full rounded-lg border-0 bg-white" 
                title="Anteprima Documento"
              />
            )}
          </div>

          <DialogFooter className="p-3 bg-white border-t flex justify-between items-center">
            <Button variant="outline" size="sm" onClick={() => setPreviewFile(null)}>Chiudi Anteprima</Button>
            {previewFile && (
              <Button 
                size="sm" 
                onClick={() => {
                  const link = document.createElement('a')
                  link.href = previewFile.file_url
                  link.download = previewFile.file_name
                  link.click()
                }}
                className="bg-purple-700 hover:bg-purple-800 text-white font-medium text-xs gap-1.5"
              >
                <Download className="w-4 h-4" /> Scarica File
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODALE CARICAMENTO FILE IN ARCHIVIO CON AUTO-SPUNTA */}
      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-purple-900 flex items-center gap-2">
              <Upload className="w-5 h-5" /> Carica Documento in Archivio
            </DialogTitle>
            <DialogDescription className="text-xs">
              Seleziona file ed esploratore: il nome verrà compilato automaticamente ed il documento risulterà spuntato in lista!
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="space-y-1">
              <Label>Seleziona Esploratore / Guida</Label>
              <Select value={uploadRagazzoId} onValueChange={setUploadRagazzoId}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Seleziona ragazzo" />
                </SelectTrigger>
                <SelectContent>
                  {ragazzi.map(r => (
                    <SelectItem key={r.id} value={r.id}>{r.nome} {r.cognome} ({r.pattuglia || 'Nessuna Sq.'})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Tipo Documento</Label>
              <Select value={uploadTipoDoc} onValueChange={setUploadTipoDoc}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Tipo Documento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="foglio_privacy_firmato">Modulo Privacy AGESCI</SelectItem>
                  <SelectItem value="scheda_medica_ci">Scheda Medica Campo Invernale</SelectItem>
                  <SelectItem value="scheda_medica_ce">Scheda Medica Campo Estivo</SelectItem>
                  <SelectItem value="ricevuta_censimento">Ricevuta Censimento</SelectItem>
                  <SelectItem value="Certificato Medico">Certificato Medico / Agonistico</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="border-2 border-dashed border-purple-200 rounded-xl p-6 text-center hover:border-purple-500 transition-colors bg-purple-50/50">
              {selectedFileObj ? (
                <div className="bg-purple-100/80 p-3 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-2 text-left overflow-hidden">
                    <File className="w-5 h-5 text-purple-700 shrink-0" />
                    <div>
                      <div className="font-bold text-purple-900 truncate">{selectedFileObj.name}</div>
                      <div className="text-[10px] text-purple-700 font-medium">Nome Titolo Assegnato Automaticamente</div>
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setSelectedFileObj(null)} className="h-7 text-xs text-rose-600">Cambia</Button>
                </div>
              ) : (
                <label className="cursor-pointer flex flex-col items-center justify-center space-y-2">
                  <Upload className="w-8 h-8 text-purple-600" />
                  <span className="text-xs font-semibold text-purple-900">Seleziona File PDF o Foto</span>
                  <input 
                    type="file" 
                    accept="image/*,application/pdf" 
                    className="hidden" 
                    onChange={e => {
                      if (e.target.files?.[0]) handleFileSelection(e.target.files[0])
                    }} 
                  />
                </label>
              )}
            </div>

            {selectedFileObj && (
              <div className="space-y-1">
                <Label>Titolo Personalizzato Documento</Label>
                <Input 
                  value={uploadTitolo}
                  onChange={e => setUploadTitolo(e.target.value)}
                  placeholder="Nome Titolo"
                  className="h-9"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsUploadOpen(false)}>Annulla</Button>
            {selectedFileObj && (
              <Button 
                size="sm" 
                onClick={handleUploadFile}
                disabled={isUploading}
                className="bg-purple-700 hover:bg-purple-800 text-white font-medium text-xs gap-1.5"
              >
                {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                Carica ed Spunta in Automatico
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
