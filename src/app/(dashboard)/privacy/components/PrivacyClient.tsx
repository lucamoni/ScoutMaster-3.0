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
  Trash2
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

export function PrivacyClient({ ragazzi: initialRagazzi }: { ragazzi: Ragazzo[] }) {
  const supabase = createClient()
  const [ragazzi, setRagazzi] = useState<Ragazzo[]>(initialRagazzi)
  const [searchTerm, setSearchTerm] = useState('')

  // Documenti personalizzati per singolo ragazzo
  const [customDocs, setCustomDocs] = useState<CustomDocPerRagazzo[]>([])
  const [isAddCustomDocOpen, setIsAddCustomDocOpen] = useState(false)
  const [targetRagazzoForDoc, setTargetRagazzoForDoc] = useState<Ragazzo | null>(null)
  const [newCustomDocTitolo, setNewCustomDocTitolo] = useState('')

  // Stato per lo Scanner IA & Discrepanze
  const [isScannerOpen, setIsScannerOpen] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [scanResult, setScanResult] = useState<any>(null)
  const [selectedDiscrepancies, setSelectedDiscrepancies] = useState<Record<string, boolean>>({})

  // Stato per Azione di Gruppo / Squadriglia
  const [isBulkOpen, setIsBulkOpen] = useState(false)
  const [bulkSquadriglia, setBulkSquadriglia] = useState<string>('TUTTE')
  const [bulkField, setBulkField] = useState<PrivacyField>('foglio_privacy_firmato')
  const [bulkValue, setBulkValue] = useState<boolean>(true)
  const [isApplyingBulk, setIsApplyingBulk] = useState(false)

  // Carica i documenti personalizzati singoli da Supabase
  useEffect(() => {
    async function loadCustomDocs() {
      const { data } = await supabase.from('impostazioni').select('valore').eq('chiave', 'custom_docs_ragazzi').maybeSingle()
      if (data && data.valore) {
        try {
          const parsed = JSON.parse(data.valore)
          if (Array.isArray(parsed)) setCustomDocs(parsed)
        } catch {}
      }
    }
    loadCustomDocs()
  }, [])

  const saveCustomDocsToDb = async (newList: CustomDocPerRagazzo[]) => {
    setCustomDocs(newList)
    await supabase.from('impostazioni').upsert([
      { chiave: 'custom_docs_ragazzi', valore: JSON.stringify(newList) }
    ])
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

  const toggleStatus = async (
    id: string,
    field: PrivacyField,
    currentValue: boolean | null
  ) => {
    const newValue = !currentValue
    setRagazzi(prev => prev.map(r => r.id === id ? { ...r, [field]: newValue } : r))
    await supabase.from('ragazzi').update({ [field]: newValue } as Database['public']['Tables']['ragazzi']['Update']).eq('id', id)
  }

  // Scansione IA con estrazione ed individuazione discrepanze
  const handleFileUpload = async (file: File) => {
    setIsScanning(true)
    setScanResult(null)
    setSelectedDiscrepancies({})

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/ocr/documento', {
        method: 'POST',
        body: formData
      })
      const result = await res.json()

      if (!res.ok || result.error) {
        throw new Error(result.error || 'Errore durante la scansione IA')
      }

      setScanResult(result)
      
      // Se ci sono discrepanze, selezionale tutte di default per aggiornare
      if (result.discrepancies && result.discrepancies.length > 0) {
        const initialDiscState: Record<string, boolean> = {}
        result.discrepancies.forEach((d: any) => {
          initialDiscState[d.field] = true
        })
        setSelectedDiscrepancies(initialDiscState)
      }

      toast.success('Documento analizzato! Controlla i dati estratti.')
    } catch (err: any) {
      toast.error(err.message || 'Impossibile estrarre i dati dal documento')
    } finally {
      setIsScanning(false)
    }
  }

  // Conferma aggiunta nuovo ragazzo da OCR
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
        foglio_privacy_firmato: ext.foglio_privacy_firmato || false,
        scheda_medica_ci: ext.scheda_medica_ci || false,
        scheda_medica_ce: ext.scheda_medica_ce || false,
        ricevuta_censimento: ext.ricevuta_censimento || false
      }

      const { data, error } = await supabase.from('ragazzi').insert(newRagazzoPayload).select().single()
      if (error) throw error

      toast.success(`Nuovo ragazzo ${data.nome} ${data.cognome} aggiunto in Anagrafica!`)
      setRagazzi(prev => [...prev, data])
      setIsScannerOpen(false)
    } catch (err: any) {
      toast.error(err.message || 'Impossibile creare il nuovo ragazzo')
    }
  }

  // Conferma aggiornamento discrepanze per ragazzo esistente da OCR
  const handleConfirmDiscrepanciesUpdate = async () => {
    if (!scanResult || !scanResult.matchedScout) return
    const scout = scanResult.matchedScout
    const ext = scanResult.extracted

    const updatePayload: Record<string, any> = {}

    // Spunte documenti sempre aggiornate dall'OCR se presenti
    if (ext.foglio_privacy_firmato) updatePayload.foglio_privacy_firmato = true
    if (ext.scheda_medica_ci) updatePayload.scheda_medica_ci = true
    if (ext.scheda_medica_ce) updatePayload.scheda_medica_ce = true
    if (ext.ricevuta_censimento) updatePayload.ricevuta_censimento = true

    // Aggiorna solo i campi selezionati nella tendina delle discrepanze
    if (scanResult.discrepancies) {
      scanResult.discrepancies.forEach((d: any) => {
        if (selectedDiscrepancies[d.field]) {
          updatePayload[d.field] = d.extractedValue
        }
      })
    }

    try {
      const { error } = await supabase.from('ragazzi').update(updatePayload).eq('id', scout.id)
      if (error) throw error

      toast.success(`Dati ed anagrafica di ${scout.nome} ${scout.cognome} aggiornati!`)
      setRagazzi(prev => prev.map(r => r.id === scout.id ? { ...r, ...updatePayload } : r))
      setIsScannerOpen(false)
    } catch (err: any) {
      toast.error(err.message || 'Impossibile aggiornare l\'anagrafica')
    }
  }

  // Applica aggiornamento di gruppo per squadriglia
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

  const renderCell = (r: Ragazzo, field: PrivacyField) => {
    const value = r[field] as boolean | null
    return (
      <button 
        onClick={() => toggleStatus(r.id, field, value)}
        className={cn(
          "w-full h-full min-h-[44px] flex items-center justify-center transition-colors hover:opacity-80 cursor-pointer border-r border-slate-100 last:border-r-0",
          value ? "bg-emerald-50 text-emerald-600 font-bold" : "bg-rose-50/60 text-rose-400"
        )}
        title={value ? "Consegnato (clicca per modificare)" : "Mancante (clicca per consegnare)"}
      >
        {value ? <Check className="h-5 w-5 stroke-[2.5]" /> : <X className="h-5 w-5 opacity-60" />}
      </button>
    )
  }

  const filteredRagazzi = ragazzi.filter(r => {
    const name = `${r.nome || ''} ${r.cognome || ''} ${r.pattuglia || ''}`.toLowerCase()
    return name.includes(searchTerm.toLowerCase())
  })

  const pattuglie = Array.from(new Set(ragazzi.map(r => r.pattuglia).filter(Boolean))) as string[]

  // Calcoli KPI
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
            Gestisci la consegna dei moduli privacy, autorizzazioni genitori e schede mediche dei ragazzi.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => setIsBulkOpen(true)} variant="outline" className="border-slate-300 text-slate-800 hover:bg-slate-50 gap-2 font-medium text-xs">
            <Users className="w-4 h-4 text-agesci-blue" /> Azione Squadriglia
          </Button>

          <Button onClick={() => setIsScannerOpen(true)} className="bg-agesci-blue hover:bg-agesci-blue-light text-amber-400 font-semibold gap-2 shadow-sm text-xs">
            <Sparkles className="w-4 h-4" /> 📸 Scanner IA Documenti
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
                <th className="px-3 py-3 border-r border-slate-200/80">Documenti Specifici Singoli</th>
                <th className="px-3 py-3 text-center w-16">WA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRagazzi.map((r, i) => {
                const waLink = getWhatsAppReminder(r)
                const ragazzoCustomDocs = customDocs.filter(cd => cd.ragazzo_id === r.id)

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

                    {/* Colonna Documenti Personalizzati Specifici per il Singolo Ragazzo */}
                    <td className="px-3 py-2 border-r border-slate-100">
                      <div className="flex flex-wrap items-center gap-1.5">
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

      {/* MODALE AGGIUNGI DOCUMENTO SPECIFICO SINGOLO RAGAZZO */}
      <Dialog open={isAddCustomDocOpen} onOpenChange={setIsAddCustomDocOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-agesci-blue flex items-center gap-2">
              <Plus className="w-4 h-4" /> Aggiungi Documento Specifico per {targetRagazzoForDoc?.nome} {targetRagazzoForDoc?.cognome}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Inserisci un documento unico o specifico richiesto a questo singolo ragazzo (es. Certificato Medico Agonistico, Delega Nonni, Permesso Farmaco).
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

      {/* MODALE SCANNER IA DOCUMENTI CON CONFERMA E DISCREPANZE */}
      <Dialog open={isScannerOpen} onOpenChange={setIsScannerOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg text-agesci-blue">
              <Sparkles className="w-5 h-5 text-amber-500" /> Scanner IA Documenti & Privacy
            </DialogTitle>
            <DialogDescription className="text-xs">
              Carica una foto o PDF (Modulo Privacy, Scheda Medica, Tessera AGESCI). Gemini Vision IA analizzerà il documento ed individuerà eventuali discrepanze con l'Anagrafica!
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:border-agesci-blue/50 transition-colors bg-slate-50">
              {isScanning ? (
                <div className="flex flex-col items-center justify-center space-y-2 py-4">
                  <Loader2 className="w-8 h-8 animate-spin text-agesci-blue" />
                  <span className="text-sm font-semibold text-slate-700">Analisi Gemini Vision IA in corso...</span>
                  <span className="text-xs text-slate-400">Estrazione dati e confronto con l'Anagrafica...</span>
                </div>
              ) : (
                <label className="cursor-pointer flex flex-col items-center justify-center space-y-2">
                  <Camera className="w-10 h-10 text-agesci-blue" />
                  <span className="text-sm font-semibold text-slate-800">Scatta foto o carica documento</span>
                  <span className="text-xs text-slate-400">Supporta JPG, PNG, PDF (Privacy, Schede Mediche, Tessere)</span>
                  <input 
                    type="file" 
                    accept="image/*,application/pdf" 
                    className="hidden" 
                    onChange={e => {
                      if (e.target.files?.[0]) handleFileUpload(e.target.files[0])
                    }} 
                  />
                </label>
              )}
            </div>

            {/* RISULTATO ED OPERAZIONI TENDINA DISCREPANZE / CONFERMA */}
            {scanResult && scanResult.extracted && (
              <div className="space-y-4 pt-2">
                {/* CASO 1: NUOVO RAGAZZO NON CENSITO */}
                {scanResult.isNewScout ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2 font-bold text-sm text-amber-900">
                      <UserPlus className="w-5 h-5 text-amber-600 shrink-0" />
                      Nuovo Ragazzo Rilevato dal Documento!
                    </div>
                    <p className="text-xs text-amber-800">
                      L'IA ha trovato i dati di <strong>{scanResult.extracted.nome} {scanResult.extracted.cognome}</strong> che non risulta ancora censito nell'Anagrafica del Reparto.
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-xs bg-white p-3 rounded-lg border border-amber-200/80">
                      <div><strong>Pattuglia:</strong> {scanResult.extracted.pattuglia || 'N.D.'}</div>
                      <div><strong>Codice Fiscale:</strong> {scanResult.extracted.codice_fiscale || 'N.D.'}</div>
                      <div><strong>Tel. Genitore 1:</strong> {scanResult.extracted.genitore_1_telefono || 'N.D.'}</div>
                      <div><strong>Tipo Doc:</strong> {scanResult.extracted.tipo_documento_riconosciuto}</div>
                    </div>
                    <div className="pt-1 flex gap-2">
                      <Button onClick={handleConfirmNewScoutFromOcr} size="sm" className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs gap-1.5 w-full">
                        <UserPlus className="w-4 h-4" /> Aggiungi {scanResult.extracted.nome} in Anagrafica
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* CASO 2: RAGAZZO ESISTENTE CON EVENTUALI DISCREPANZE */
                  <div className="space-y-3">
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 text-xs text-emerald-900 flex items-center justify-between">
                      <div>
                        <strong>Ragazzo Riconosciuto:</strong> {scanResult.matchedScout.nome} {scanResult.matchedScout.cognome} ({scanResult.matchedScout.pattuglia || 'Nessuna Sq.'})
                      </div>
                      <Badge className="bg-emerald-600 text-white text-[10px]">Documento Verificato</Badge>
                    </div>

                    {scanResult.discrepancies && scanResult.discrepancies.length > 0 ? (
                      <div className="border border-amber-300 bg-amber-50/70 rounded-xl p-4 space-y-3">
                        <div className="flex items-center gap-2 font-bold text-xs text-amber-950">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                          Trovate {scanResult.discrepancies.length} Discrepanze con l'Anagrafica. Seleziona quali dati aggiornare:
                        </div>

                        <div className="space-y-2 bg-white p-3 rounded-lg border border-amber-200/80">
                          {scanResult.discrepancies.map((disc: any) => (
                            <div key={disc.field} className="flex items-start gap-2 text-xs border-b last:border-b-0 pb-2 last:pb-0">
                              <Checkbox 
                                id={`disc_${disc.field}`}
                                checked={selectedDiscrepancies[disc.field] || false}
                                onCheckedChange={(val) => setSelectedDiscrepancies(prev => ({ ...prev, [disc.field]: !!val }))}
                                className="mt-0.5"
                              />
                              <div className="flex-1">
                                <Label htmlFor={`disc_${disc.field}`} className="font-semibold text-slate-900 cursor-pointer">{disc.label}</Label>
                                <div className="text-[11px] text-slate-600 flex items-center gap-2 mt-0.5">
                                  <span className="line-through text-slate-400">DB: {disc.dbValue}</span>
                                  <span>➔</span>
                                  <span className="font-bold text-emerald-700">Doc: {disc.extractedValue}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        <Button onClick={handleConfirmDiscrepanciesUpdate} size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs gap-1.5 w-full">
                          <RefreshCw className="w-4 h-4" /> Conferma ed Aggiorna Anagrafica
                        </Button>
                      </div>
                    ) : (
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600 flex items-center justify-between">
                        <span>Nessuna discrepanza trovata. L'anagrafica è già perfettamente allineata!</span>
                        <Button onClick={handleConfirmDiscrepanciesUpdate} size="sm" className="bg-agesci-blue text-white text-xs">
                          Aggiorna Spunte Documento
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
