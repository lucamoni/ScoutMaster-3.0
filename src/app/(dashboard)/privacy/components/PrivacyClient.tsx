'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { Check, X, Search, FileText, ShieldCheck, HeartPulse, FileCheck, MessageCircle, Sparkles, Upload, Loader2, Camera, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { toast } from 'sonner'

type Ragazzo = Database['public']['Tables']['ragazzi']['Row']
type PrivacyField = 'foglio_privacy_firmato' | 'partecipazione_ci' | 'scheda_medica_ci' | 'partecipazione_ce' | 'scheda_medica_ce' | 'quota_censimento' | 'ricevuta_censimento'

export function PrivacyClient({ ragazzi: initialRagazzi }: { ragazzi: Ragazzo[] }) {
  const supabase = createClient()
  const [ragazzi, setRagazzi] = useState<Ragazzo[]>(initialRagazzi)
  const [searchTerm, setSearchTerm] = useState('')

  // Stato per lo Scanner IA
  const [isScannerOpen, setIsScannerOpen] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [scanResult, setScanResult] = useState<any>(null)

  const toggleStatus = async (
    id: string,
    field: PrivacyField,
    currentValue: boolean | null
  ) => {
    const newValue = !currentValue
    setRagazzi(prev => prev.map(r => r.id === id ? { ...r, [field]: newValue } : r))
    
    await supabase.from('ragazzi').update({ [field]: newValue } as Database['public']['Tables']['ragazzi']['Update']).eq('id', id)
  }

  const handleFileUpload = async (file: File) => {
    setIsScanning(true)
    setScanResult(null)

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

      setScanResult(result.data)
      toast.success(`Documento analizzato! ${result.data.db_status === 'updated' ? 'Anagrafica e documenti aggiornati!' : result.data.db_status === 'created' ? 'Nuovo ragazzo inserito in anagrafica!' : 'Dati estratti con successo!'}`)

      // Ricarica la lista aggiornata dal database Supabase
      const { data } = await supabase.from('ragazzi').select('*').order('nome')
      if (data) setRagazzi(data)
    } catch (err: any) {
      toast.error(err.message || 'Impossibile estrarre i dati dal documento')
    } finally {
      setIsScanning(false)
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
        <Button onClick={() => setIsScannerOpen(true)} className="bg-agesci-blue hover:bg-agesci-blue-light text-amber-400 font-semibold gap-2 shadow-sm">
          <Sparkles className="w-4 h-4" /> 📸 Scanner IA Documenti
        </Button>
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
                <th className="px-3 py-3 text-center w-16">Promemoria</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRagazzi.map((r, i) => {
                const waLink = getWhatsAppReminder(r)
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

      {/* MODALE SCANNER IA DOCUMENTI */}
      <Dialog open={isScannerOpen} onOpenChange={setIsScannerOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg text-agesci-blue">
              <Sparkles className="w-5 h-5 text-amber-500" /> Scanner IA Documenti & Privacy
            </DialogTitle>
            <DialogDescription>
              Carica una foto o PDF (Modulo Privacy, Scheda Medica, Tessera AGESCI). Gemini IA estrarrà automaticamente i dati anagrafici ed aggiornerà lo stato dei documenti!
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:border-agesci-blue/50 transition-colors bg-slate-50">
              {isScanning ? (
                <div className="flex flex-col items-center justify-center space-y-2 py-4">
                  <Loader2 className="w-8 h-8 animate-spin text-agesci-blue" />
                  <span className="text-sm font-semibold text-slate-700">Analisi Gemini Vision IA in corso...</span>
                  <span className="text-xs text-slate-400">Estrazione dati anagrafici e spunte privacy...</span>
                </div>
              ) : (
                <label className="cursor-pointer flex flex-col items-center justify-center space-y-2">
                  <Camera className="w-10 h-10 text-agesci-blue" />
                  <span className="text-sm font-semibold text-slate-800">Scatta foto o seleziona un file</span>
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

            {scanResult && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-2 text-xs text-emerald-900">
                <div className="flex items-center gap-2 font-bold text-sm text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Dati Estratti & Sincronizzati:
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div><strong>Nome:</strong> {scanResult.nome} {scanResult.cognome}</div>
                  <div><strong>Pattuglia:</strong> {scanResult.pattuglia || 'Non specificata'}</div>
                  <div><strong>Tipo Doc:</strong> {scanResult.tipo_documento_riconosciuto}</div>
                  <div><strong>Stato DB:</strong> {scanResult.db_status === 'updated' ? 'Aggiornato in Anagrafica' : scanResult.db_status === 'created' ? 'Creato Nuovo Ragazzo' : 'Estratto'}</div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
