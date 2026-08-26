'use client'

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  ShieldCheck, 
  HeartPulse, 
  FileCheck,
  File,
  Plus,
  User,
  Users,
  Paperclip
} from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
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
  const [selectedPattuglia, setSelectedPattuglia] = useState<string>('TUTTE')
  
  // Modale per Anteprima / Visualizzazione veloce file
  const [previewFile, setPreviewFile] = useState<ArchivedDocumentFile | null>(null)

  // Modale Caricamento File per Persona
  const [isUploadOpen, setIsUploadOpen] = useState(false)
  const [targetScoutForUpload, setTargetScoutForUpload] = useState<Ragazzo | null>(null)
  const [selectedFileObj, setSelectedFileObj] = useState<File | null>(null)
  const [uploadTitolo, setUploadTitolo] = useState('')
  const [uploadTipoDoc, setUploadTipoDoc] = useState('foglio_privacy_firmato')
  const [isUploading, setIsUploading] = useState(false)

  const supabase = createClient()

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
    if (!targetScoutForUpload || !selectedFileObj) {
      toast.error('Seleziona sia il ragazzo che il file da archiviare')
      return
    }

    setIsUploading(true)
    try {
      const file = selectedFileObj
      const reader = new FileReader()
      reader.onload = async (e) => {
        const base64Url = e.target?.result as string
        const finalTitle = uploadTitolo.trim() || cleanFileNameToTitle(file.name)

        const newArchivedItem: ArchivedDocumentFile = {
          id: 'arch_' + Date.now(),
          ragazzo_id: targetScoutForUpload.id,
          ragazzo_nome: `${targetScoutForUpload.nome} ${targetScoutForUpload.cognome}`,
          titolo_documento: finalTitle,
          tipo_documento: uploadTipoDoc,
          file_name: file.name,
          file_url: base64Url,
          mime_type: file.type,
          created_at: new Date().toISOString()
        }

        const updated = [newArchivedItem, ...archivedFiles]
        await saveArchivedFilesToDb(updated)

        if (uploadTipoDoc in targetScoutForUpload) {
          const field = uploadTipoDoc as PrivacyField
          await supabase.from('ragazzi').update({ [field]: true } as any).eq('id', targetScoutForUpload.id)
        }

        toast.success(`Documento salvato ed AUTOMATICAMENTE SPUNTATO per ${targetScoutForUpload.nome}!`)
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

  const pattuglie = Array.from(new Set(ragazzi.map(r => r.pattuglia).filter(Boolean))) as string[]

  // Filtra ragazzi in base alla ricerca ed alla squadriglia
  const filteredRagazzi = ragazzi.filter(r => {
    const name = `${r.nome || ''} ${r.cognome || ''} ${r.pattuglia || ''}`.toLowerCase()
    const matchesSearch = name.includes(searchTerm.toLowerCase())
    const matchesPattuglia = selectedPattuglia === 'TUTTE' || r.pattuglia === selectedPattuglia
    return matchesSearch && matchesPattuglia
  })

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <FolderArchive className="w-8 h-8 text-purple-700" />
            Archivio Documenti Diviso per Esploratore
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Ogni persona ha la sua scheda con tutti i documenti salvati e consultabili in 1 clic.
          </p>
        </div>
      </div>

      {/* Barra Filtri ed Ricerca Persone */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between bg-white p-4 rounded-xl border border-slate-200/80 shadow-2xs">
        <div className="flex flex-wrap gap-2 flex-1">
          {/* Filtro Squadriglia */}
          <div className="w-full sm:w-56">
            <Select value={selectedPattuglia} onValueChange={setSelectedPattuglia}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Tutte le Squadriglie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TUTTE">TUTTE LE SQUADRIGLIE</SelectItem>
                {pattuglie.map(p => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Ricerca Testuale Ragazzo */}
        <div className="relative max-w-xs w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input 
            placeholder="Cerca esploratore per nome..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-9 h-9 text-xs bg-white"
          />
        </div>
      </div>

      {/* SCHEDE ESPLORATORI - DIVISO PER PERSONA */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredRagazzi.map(r => {
          const personFiles = archivedFiles.filter(f => f.ragazzo_id === r.id)

          return (
            <Card key={r.id} className="border-slate-200/90 shadow-2xs hover:shadow-md transition-all rounded-xl bg-white flex flex-col justify-between overflow-hidden">
              <CardHeader className="p-4 bg-slate-50/80 border-b border-slate-100 pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-sm">
                      {r.nome[0]}{r.cognome[0]}
                    </div>
                    <div>
                      <CardTitle className="text-base font-bold text-slate-900">
                        {r.nome} {r.cognome}
                      </CardTitle>
                      <div className="text-xs text-slate-500 font-normal">
                        {r.pattuglia || 'Nessuna Squadriglia'}
                      </div>
                    </div>
                  </div>

                  <Badge variant="outline" className="bg-purple-50 text-purple-800 border-purple-200 text-xs font-semibold">
                    {personFiles.length} {personFiles.length === 1 ? 'file' : 'file'}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="p-4 space-y-3 flex-1">
                {personFiles.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
                    Nessun documento salvato in archivio per {r.nome}.
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Documenti In Archivio:</div>
                    <div className="space-y-1.5">
                      {personFiles.map(file => (
                        <div 
                          key={file.id} 
                          className="flex items-center justify-between bg-purple-50/60 border border-purple-100 hover:border-purple-300 rounded-lg p-2.5 transition-colors cursor-pointer"
                          onClick={() => setPreviewFile(file)}
                        >
                          <div className="flex items-center gap-2 overflow-hidden pr-2">
                            <File className="w-4 h-4 text-purple-600 shrink-0" />
                            <div className="truncate">
                              <div className="font-semibold text-xs text-purple-950 truncate">{file.titolo_documento}</div>
                              <div className="text-[10px] text-purple-600">{file.file_name}</div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-7 w-7 text-purple-700 hover:bg-purple-100"
                              onClick={(e) => { e.stopPropagation(); setPreviewFile(file); }}
                              title="Visualizza Documento"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-7 w-7 text-rose-600 hover:bg-rose-50"
                              onClick={(e) => { e.stopPropagation(); handleDeleteFile(file.id); }}
                              title="Elimina"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>

              <CardFooter className="p-3 bg-slate-50/60 border-t border-slate-100">
                <Button 
                  onClick={() => { setTargetScoutForUpload(r); setIsUploadOpen(true); }}
                  variant="outline" 
                  size="sm"
                  className="w-full border-purple-200 text-purple-800 hover:bg-purple-50 text-xs font-semibold gap-1.5 rounded-xl"
                >
                  <Upload className="w-3.5 h-3.5" /> Aggiungi Documento a {r.nome}
                </Button>
              </CardFooter>
            </Card>
          )
        })}
      </div>

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
                <Download className="w-4 h-4" /> Scarica File Originale
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODALE CARICAMENTO DOCUMENTO DEDICATO ALLA PERSONA */}
      <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-purple-900 flex items-center gap-2">
              <Upload className="w-5 h-5" /> Aggiungi Documento a {targetScoutForUpload?.nome} {targetScoutForUpload?.cognome}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Carica un file PDF o Foto: la casella corrispondente risulterà spuntata in automatico.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
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
                      <div className="text-[10px] text-purple-700 font-medium">Nome Auto-Impostato</div>
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
                <Label>Titolo Assegnato al Documento</Label>
                <Input 
                  value={uploadTipoDoc}
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
                Salva File ed Spunta Automatica
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
