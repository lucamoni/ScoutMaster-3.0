'use client'

import React, { useState } from 'react'
import { Database } from '@/types/database.types'
import { createBrowserClient } from '@supabase/ssr'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  Plus, 
  Trash2, 
  Pencil, 
  Settings2, 
  Check, 
  X, 
  MessageCircle, 
  FileSpreadsheet, 
  User, 
  HeartPulse, 
  Compass, 
  Calendar,
  Shield,
  Award,
  Flame,
  Sparkles,
  Zap,
  Camera,
  Loader2,
  CheckCircle2
} from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type Ragazzo = Database['public']['Tables']['ragazzi']['Row']
type Pattuglia = Database['public']['Tables']['pattuglie']['Row']
type Candidatura = {
  id: string
  evento_id?: string | null
  ragazzo_id?: string | null
  stato_iscrizione?: string | null
  specialita_competenza_scelta?: string | null
  eventi_buonacaccia?: { titolo?: string | null, categoria?: string | null } | null
  [key: string]: any
}

const getSquadrigliaBadge = (pattugliaNome?: string | null) => {
  const norm = (pattugliaNome || '').toLowerCase().trim()
  if (norm.includes('aquil') || norm.includes('falc')) return { icon: Shield, bg: 'bg-amber-50 text-amber-900 border-amber-300' }
  if (norm.includes('volp')) return { icon: Compass, bg: 'bg-orange-50 text-orange-900 border-orange-300' }
  if (norm.includes('leon')) return { icon: Award, bg: 'bg-yellow-50 text-yellow-900 border-yellow-300' }
  if (norm.includes('panter')) return { icon: Flame, bg: 'bg-slate-900 text-amber-300 border-slate-700' }
  if (norm.includes('ors')) return { icon: Shield, bg: 'bg-amber-950 text-amber-100 border-amber-900' }
  if (norm.includes('cerv')) return { icon: Sparkles, bg: 'bg-emerald-50 text-emerald-900 border-emerald-300' }
  if (norm.includes('cobr') || norm.includes('serpent')) return { icon: Zap, bg: 'bg-green-50 text-green-900 border-green-300' }
  return { icon: Compass, bg: 'bg-sky-50 text-sky-900 border-sky-200' }
}

export default function AnagraficaClient({ initialData, initialPattuglie, initialCandidature }: { initialData: Ragazzo[], initialPattuglie: Pattuglia[], initialCandidature?: Candidatura[] }) {
  const [ragazzi, setRagazzi] = useState<Ragazzo[]>(initialData)
  const [squadriglie, setSquadriglie] = useState<Pattuglia[]>(initialPattuglie)
  const [candidature] = useState<Candidatura[]>(initialCandidature || [])
  const [isOpen, setIsOpen] = useState(false)
  const [isSquadriglieOpen, setIsSquadriglieOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  
  const defaultForm = {
    nome: '', cognome: '', sesso: '', pattuglia: '', 
    codice_censimento: '', importo_censimento: '', data_nascita: '', residenza: '', telefono_ragazzo: '',
    genitore_1_nome: '', genitore_1_telefono: '', genitore_2_nome: '', genitore_2_telefono: '', note_sanitarie: ''
  }
  const [formData, setFormData] = useState(defaultForm)
  
  const [newSquadriglia, setNewSquadriglia] = useState('')
  const [editingSqId, setEditingSqId] = useState<string | null>(null)
  const [editingSqNome, setEditingSqNome] = useState('')

  // Scanner IA Documenti & Anagrafica
  const [isScannerOpen, setIsScannerOpen] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [scanResult, setScanResult] = useState<any>(null)

  const handleDocumentScan = async (file: File) => {
    setIsScanning(true)
    setScanResult(null)
    const fd = new FormData()
    fd.append('file', file)
    try {
      const res = await fetch('/api/ocr/documento', { method: 'POST', body: fd })
      const result = await res.json()
      if (!res.ok || result.error) throw new Error(result.error || 'Errore durante la lettura del documento')
      setScanResult(result.data)
      toast.success(`Dati scansionati! ${result.data.db_status === 'updated' ? 'Anagrafica ed aiuti aggiornati!' : 'Nuovo ragazzo caricato in anagrafica!'}`)

      const { data } = await supabase.from('ragazzi').select('*').order('nome')
      if (data) setRagazzi(data)
    } catch (err: any) {
      toast.error(err.message || 'Impossibile leggere il documento')
    } finally {
      setIsScanning(false)
    }
  }

  const supabase = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const updateRagazzo = async (id: string, field: keyof Ragazzo, value: unknown) => {
    setRagazzi((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    )
    const updateData = { [field]: value } as Database['public']['Tables']['ragazzi']['Update']
    const { error } = await supabase.from('ragazzi').update(updateData).eq('id', id)
    if (error) console.error('Errore:', error)
    if (field === 'attivo' && value === false) {
      setRagazzi(prev => prev.filter(r => r.id !== id))
    }
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanData: Record<string, unknown> = { ...formData }
    Object.keys(cleanData).forEach(key => {
      if (cleanData[key] === '') cleanData[key] = null
    })
    cleanData.nome = formData.nome
    cleanData.cognome = formData.cognome

    if (editingId) {
      const { error } = await supabase.from('ragazzi').update(cleanData as Database['public']['Tables']['ragazzi']['Update']).eq('id', editingId)
      if (!error) {
        setRagazzi(prev => prev.map(r => r.id === editingId ? { ...r, ...cleanData } as Ragazzo : r))
        setIsOpen(false)
        setEditingId(null)
        setFormData(defaultForm)
        toast.success("Scheda Taccuino aggiornata!")
      }
    } else {
      cleanData.attivo = true
      const { data, error } = await supabase.from('ragazzi').insert(cleanData as Database['public']['Tables']['ragazzi']['Insert']).select().single()
      if (!error && data) {
        setRagazzi([...ragazzi, data].sort((a, b) => (a.pattuglia || '').localeCompare(b.pattuglia || '')))
        setIsOpen(false)
        setFormData(defaultForm)
        toast.success("Nuovo esploratore aggiunto al Taccuino!")
      }
    }
  }

  const handleImportSheets = async () => {
    setIsSyncing(true)
    try {
      const res = await fetch('/api/sheets/sync-all', { method: 'POST' })
      if (res.ok) {
        toast.success("Sincronizzazione da Google Sheets completata!")
        window.location.reload()
      } else {
        toast.error("Errore durante la sincronizzazione da Google Sheets")
      }
    } catch {
      toast.error("Errore di connessione durante la sincronizzazione")
    } finally {
      setIsSyncing(false)
    }
  }

  const handleAddSquadriglia = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newSquadriglia.trim()) return
    const { data, error } = await supabase.from('pattuglie').insert({ nome: newSquadriglia.trim() }).select().single()
    if (!error && data) {
      setSquadriglie([...squadriglie, data])
      setNewSquadriglia('')
      toast.success("Squadriglia aggiunta")
    }
  }

  const handleDeleteSquadriglia = async (id: string) => {
    const sq = squadriglie.find(s => s.id === id)
    if (!sq) return
    if (!confirm(`Sei sicuro di voler eliminare la squadriglia "${sq.nome}"?`)) return
    
    const { error } = await supabase.from('pattuglie').delete().eq('id', id)
    if (!error) {
      setSquadriglie(prev => prev.filter(s => s.id !== id))
    }
  }

  const saveEditSquadriglia = async (id: string) => {
    if (!editingSqNome.trim()) {
      setEditingSqId(null)
      return
    }
    const { error } = await supabase.from('pattuglie').update({ nome: editingSqNome.trim() }).eq('id', id)
    if (!error) {
      setSquadriglie(prev => prev.map(s => s.id === id ? { ...s, nome: editingSqNome.trim() } : s))
      setEditingSqId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div>
          <h1 className="text-xl font-heading font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Compass className="h-6 w-6 text-agesci-blue" /> Anagrafica & Taccuino Esploratori
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Gestione dati personali, sanitari, squadriglie e sentiero di progressione del Reparto.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <Button 
            onClick={() => { setEditingId(null); setFormData(defaultForm); setIsOpen(true) }}
            className="bg-agesci-blue hover:bg-agesci-blue-light text-white font-medium text-xs h-9 px-4 rounded-xl shadow-2xs touch-min"
          >
            <Plus className="mr-1.5 h-4 w-4" /> Nuovo Esploratore
          </Button>

          <Button 
            variant="outline" 
            onClick={() => setIsSquadriglieOpen(true)}
            className="border-slate-200 text-slate-700 hover:bg-slate-50 text-xs h-9 px-3 rounded-xl touch-min"
          >
            <Settings2 className="mr-1.5 h-4 w-4 text-agesci-blue" /> Squadriglie
          </Button>

          <Button 
            variant="secondary" 
            onClick={handleImportSheets} 
            disabled={isSyncing}
            className="bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 text-xs h-9 px-3 rounded-xl touch-min"
          >
            {isSyncing ? <Plus className="mr-1.5 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-1.5 h-4 w-4 text-emerald-600" />}
            Sync Sheets
          </Button>

          <Button 
            variant="outline" 
            onClick={() => setIsScannerOpen(true)} 
            className="border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100 text-xs h-9 px-3 rounded-xl touch-min font-medium gap-1.5"
          >
            <Sparkles className="h-4 w-4 text-amber-600" /> Scanner IA Documento
          </Button>
        </div>
      </div>

      {/* Dialog Scheda Esploratore "Taccuino Tecnico" */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto bg-white rounded-2xl p-6 border border-slate-200 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-agesci-blue text-scout-gold flex items-center justify-center font-bold shadow-xs">
                <Compass className="h-5 w-5" />
              </div>
              <div>
                <span className="font-heading text-lg font-bold text-slate-900">
                  {editingId ? 'Taccuino Tecnico Esploratore' : 'Nuovo Esploratore Reparto'}
                </span>
                <p className="text-xs text-slate-500 font-normal">
                  {formData.nome ? `${formData.nome} ${formData.cognome}` : 'Compila i dettagli del ragazzo'}
                </p>
              </div>
            </DialogTitle>
          </DialogHeader>

          {/* Quick WhatsApp Action Button in Highlight */}
          {editingId && (formData.genitore_1_telefono || formData.genitore_2_telefono) && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-emerald-900 text-xs font-semibold">
                <MessageCircle className="h-4 w-4 text-emerald-600" />
                <span>Contatto Rapido Genitori</span>
              </div>
              <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                {formData.genitore_1_telefono && (
                  <Button
                    size="sm"
                    className="h-8 text-xs bg-[#25D366] hover:bg-[#1DA851] text-white font-medium rounded-lg shadow-2xs"
                    onClick={() => {
                      const text = `Ciao ${formData.genitore_1_nome || 'genitore'}, ti contatto dal Reparto Scout per ${formData.nome}.`
                      window.open(`https://wa.me/${formData.genitore_1_telefono.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(text)}`, '_blank')
                    }}
                  >
                    <MessageCircle className="h-3.5 w-3.5 mr-1" /> Contatta {formData.genitore_1_nome || 'Genitore 1'} su WhatsApp
                  </Button>
                )}
                {formData.genitore_2_telefono && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs border-emerald-300 text-emerald-800 hover:bg-emerald-100 rounded-lg"
                    onClick={() => {
                      const text = `Ciao ${formData.genitore_2_nome || 'genitore'}, ti contatto dal Reparto Scout per ${formData.nome}.`
                      window.open(`https://wa.me/${formData.genitore_2_telefono.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(text)}`, '_blank')
                    }}
                  >
                    <MessageCircle className="h-3.5 w-3.5 mr-1" /> Contatta {formData.genitore_2_nome || 'Genitore 2'}
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Tabbed Form Interface */}
          <form onSubmit={handleAdd} className="space-y-4">
            <Tabs defaultValue="anagrafica" className="w-full">
              <TabsList className="grid grid-cols-3 bg-slate-100 p-1 rounded-xl">
                <TabsTrigger value="anagrafica" className="text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 py-2">
                  <User className="h-3.5 w-3.5" /> Dati & Sanitari
                </TabsTrigger>
                <TabsTrigger value="progressione" className="text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 py-2">
                  <Compass className="h-3.5 w-3.5" /> Progressione & Specialità
                </TabsTrigger>
                <TabsTrigger value="buonacaccia" className="text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 py-2">
                  <Calendar className="h-3.5 w-3.5" /> Storico & BuonaCaccia
                </TabsTrigger>
              </TabsList>

              {/* Tab 1: Dati & Sanitari */}
              <TabsContent value="anagrafica" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-700">Nome *</Label>
                    <Input required className="h-9 text-xs rounded-xl" value={formData.nome} onChange={e => setFormData({...formData, nome: e.target.value})} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-700">Cognome *</Label>
                    <Input required className="h-9 text-xs rounded-xl" value={formData.cognome} onChange={e => setFormData({...formData, cognome: e.target.value})} />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-700">Sesso</Label>
                    <Select value={formData.sesso} onValueChange={v => setFormData({...formData, sesso: v || ''})}>
                      <SelectTrigger className="h-9 text-xs rounded-xl"><SelectValue placeholder="-" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="M">M</SelectItem>
                        <SelectItem value="F">F</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-700">Squadriglia</Label>
                    <Select value={formData.pattuglia} onValueChange={v => setFormData({...formData, pattuglia: v || ''})}>
                      <SelectTrigger className="h-9 text-xs rounded-xl"><SelectValue placeholder="Seleziona..." /></SelectTrigger>
                      <SelectContent>
                        {squadriglie.map(p => p.nome ? <SelectItem key={p.id} value={p.nome}>{p.nome}</SelectItem> : null)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-700">Codice Censimento</Label>
                    <Input className="h-9 text-xs rounded-xl" placeholder="es. 123456" value={formData.codice_censimento} onChange={e => setFormData({...formData, codice_censimento: e.target.value})} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 border-t pt-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-700">Genitore 1 (Nome)</Label>
                    <Input className="h-9 text-xs rounded-xl" value={formData.genitore_1_nome} onChange={e => setFormData({...formData, genitore_1_nome: e.target.value})} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-700">Genitore 1 (Telefono WA)</Label>
                    <Input className="h-9 text-xs rounded-xl" placeholder="+39..." value={formData.genitore_1_telefono} onChange={e => setFormData({...formData, genitore_1_telefono: e.target.value})} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-700">Genitore 2 (Nome)</Label>
                    <Input className="h-9 text-xs rounded-xl" value={formData.genitore_2_nome} onChange={e => setFormData({...formData, genitore_2_nome: e.target.value})} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-700">Genitore 2 (Telefono WA)</Label>
                    <Input className="h-9 text-xs rounded-xl" placeholder="+39..." value={formData.genitore_2_telefono} onChange={e => setFormData({...formData, genitore_2_telefono: e.target.value})} />
                  </div>
                </div>

                <div className="space-y-1 border-t pt-3">
                  <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                    <HeartPulse className="h-3.5 w-3.5 text-rose-500" /> Note Sanitarie & Allergie
                  </Label>
                  <textarea 
                    className="w-full text-xs border rounded-xl p-2.5 bg-slate-50 min-h-[60px] outline-none focus:ring-2 focus:ring-agesci-blue"
                    placeholder="Allergie, intolleranze alimentari, farmaci o note mediche importanti..."
                    value={formData.note_sanitarie}
                    onChange={e => setFormData({...formData, note_sanitarie: e.target.value})}
                  />
                </div>
              </TabsContent>

              {/* Tab 2: Progressione Personale & Specialità */}
              <TabsContent value="progressione" className="space-y-4 mt-4">
                <div className="p-4 border border-slate-200 rounded-xl bg-slate-50/50 space-y-3">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Compass className="h-4 w-4 text-agesci-blue" /> Sentiero E/G - Tappa Personale
                  </h4>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="border bg-white rounded-xl p-3 text-center cursor-pointer hover:border-agesci-blue transition-colors">
                      <span className="text-xs font-bold text-slate-800 block">Scoperta</span>
                      <span className="text-[10px] text-slate-500">1° Anno</span>
                    </div>
                    <div className="border bg-white rounded-xl p-3 text-center cursor-pointer hover:border-agesci-blue transition-colors">
                      <span className="text-xs font-bold text-slate-800 block">Competenza</span>
                      <span className="text-[10px] text-slate-500">2°/3° Anno</span>
                    </div>
                    <div className="border bg-white rounded-xl p-3 text-center cursor-pointer hover:border-agesci-blue transition-colors">
                      <span className="text-xs font-bold text-slate-800 block">Responsabilità</span>
                      <span className="text-[10px] text-slate-500">4° Anno / Caposquadriglia</span>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Tab 3: Storico Pagamenti & BuonaCaccia */}
              <TabsContent value="buonacaccia" className="space-y-4 mt-4">
                {!editingId ? (
                  <div className="text-center py-6 text-slate-500 text-xs border border-dashed rounded-xl p-4 bg-slate-50">
                    Salva l&apos;esploratore o apri un profilo esistente per consultare i suoi eventi e candidature.
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-slate-700">Candidature Eventi BuonaCaccia</Label>
                    <div className="border rounded-xl divide-y max-h-48 overflow-y-auto bg-white">
                      {candidature.filter(c => c.ragazzo_id === editingId).length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-500">Nessuna candidatura BuonaCaccia presente.</div>
                      ) : (
                        candidature.filter(c => c.ragazzo_id === editingId).map(cand => (
                          <div key={cand.id} className="p-3 text-xs flex justify-between items-center hover:bg-slate-50">
                            <div>
                              <div className="font-bold text-agesci-blue">{cand.eventi_buonacaccia?.titolo}</div>
                              <div className="text-[11px] text-slate-500">{cand.eventi_buonacaccia?.categoria} • {cand.specialita_competenza_scelta || 'Generico'}</div>
                            </div>
                            <div className="text-right">
                              <Badge className={
                                cand.stato_iscrizione === 'Accettato' ? 'bg-emerald-100 text-emerald-800' :
                                cand.stato_iscrizione === 'Iscritto' ? 'bg-sky-100 text-sky-800' :
                                'bg-rose-100 text-rose-800'
                              }>
                                {cand.stato_iscrizione}
                              </Badge>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>

            <Button type="submit" className="w-full h-10 bg-agesci-blue hover:bg-agesci-blue-light text-white font-medium rounded-xl shadow-xs">
              Salva Scheda Taccuino
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog Squadriglie */}
      <Dialog open={isSquadriglieOpen} onOpenChange={setIsSquadriglieOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto bg-white rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="font-heading text-lg font-bold text-slate-900">Gestione Squadriglie Reparto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <form onSubmit={handleAddSquadriglia} className="flex gap-2">
              <Input placeholder="Nuova squadriglia..." value={newSquadriglia} onChange={e => setNewSquadriglia(e.target.value)} required className="h-9 text-xs rounded-xl" />
              <Button type="submit" className="h-9 px-3 bg-agesci-blue hover:bg-agesci-blue-light text-white rounded-xl"><Plus className="h-4 w-4" /></Button>
            </form>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {squadriglie.map(sq => {
                const badge = getSquadrigliaBadge(sq.nome)
                const Icon = badge.icon
                return (
                  <div key={sq.id} className="flex justify-between items-center p-2.5 border rounded-xl bg-slate-50/60">
                    {editingSqId === sq.id ? (
                      <div className="flex gap-2 w-full">
                        <Input className="h-8 text-xs rounded-lg" value={editingSqNome} onChange={e => setEditingSqNome(e.target.value)} autoFocus />
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-600" onClick={() => saveEditSquadriglia(sq.id)}><Check className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-500" onClick={() => setEditingSqId(null)}><X className="h-4 w-4" /></Button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4 text-agesci-blue" />
                          <span className="text-xs font-semibold text-slate-800">{sq.nome}</span>
                        </div>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-sky-600" onClick={() => { setEditingSqId(sq.id); setEditingSqNome(sq.nome || ''); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-rose-500" onClick={() => handleDeleteSquadriglia(sq.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Desktop Table View */}
      <div className="hidden md:block rounded-2xl border border-slate-200/80 bg-white overflow-hidden shadow-2xs">
        <Table className="text-sm">
          <TableHeader className="bg-slate-50 border-b border-slate-200/80">
            <TableRow className="h-10">
              <TableHead className="py-2 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Esploratore</TableHead>
              <TableHead className="py-2 px-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-center w-20">Sesso</TableHead>
              <TableHead className="py-2 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Squadriglia Ricamata</TableHead>
              <TableHead className="py-2 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Contatti Genitori</TableHead>
              <TableHead className="py-2 px-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-center w-24">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-slate-100">
            {ragazzi.map((ragazzoItem) => {
              const ragazzo = ragazzoItem as any
              const badge = getSquadrigliaBadge(ragazzo.pattuglia)
              const BadgeIcon = badge.icon
              return (
                <TableRow key={ragazzo.id} className="h-12 hover:bg-sky-50/40 transition-colors">
                  <TableCell className="font-semibold text-slate-900 px-4">
                    <div className="flex items-center gap-2.5">
                      <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-xs text-agesci-blue border border-slate-200">
                        {ragazzo.nome[0]}{ragazzo.cognome[0]}
                      </div>
                      <span>{ragazzo.nome} {ragazzo.cognome}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center px-3">
                    <Select
                      defaultValue={ragazzo.sesso || undefined}
                      onValueChange={(val) => updateRagazzo(ragazzo.id, 'sesso', val)}
                    >
                      <SelectTrigger className="h-7 w-12 mx-auto border-0 shadow-none text-center font-bold text-xs">
                        <SelectValue placeholder="-" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="M">M</SelectItem>
                        <SelectItem value="F">F</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="px-4">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold shadow-2xs ${badge.bg}`}>
                        <BadgeIcon className="h-3.5 w-3.5" />
                        <span>{ragazzo.pattuglia || 'Non assegnata'}</span>
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="px-4 text-xs">
                    <div className="flex items-center gap-2">
                      {ragazzo.genitore_1_telefono && (
                        <a 
                          href={`https://wa.me/${ragazzo.genitore_1_telefono.replace(/[^0-9]/g, '')}`} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 px-2.5 py-1 rounded-md border border-emerald-200 font-medium transition-colors"
                        >
                          <MessageCircle className="h-3 w-3 text-emerald-600" />
                          <span>{ragazzo.genitore_1_nome || 'Genitore 1'}</span>
                        </a>
                      )}
                      {ragazzo.genitore_2_telefono && (
                        <a 
                          href={`https://wa.me/${ragazzo.genitore_2_telefono.replace(/[^0-9]/g, '')}`} 
                          target="_blank" 
                          rel="noreferrer" 
                          className="inline-flex items-center gap-1 bg-slate-50 text-slate-700 hover:bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200 font-medium transition-colors"
                        >
                          <MessageCircle className="h-3 w-3 text-slate-500" />
                          <span>{ragazzo.genitore_2_nome || 'Genitore 2'}</span>
                        </a>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-center px-3">
                    <div className="flex items-center justify-center gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-agesci-blue hover:bg-sky-50 rounded-lg"
                        onClick={() => {
                          setEditingId(ragazzo.id)
                          setFormData({ 
                            nome: ragazzo.nome, cognome: ragazzo.cognome, sesso: ragazzo.sesso || '', pattuglia: ragazzo.pattuglia || '',
                            codice_censimento: ragazzo.codice_censimento || '', importo_censimento: ragazzo.importo_censimento !== null && ragazzo.importo_censimento !== undefined ? String(ragazzo.importo_censimento) : '', data_nascita: ragazzo.data_nascita || '',
                            residenza: ragazzo.residenza || '', telefono_ragazzo: ragazzo.telefono_ragazzo || '',
                            genitore_1_nome: ragazzo.genitore_1_nome || '', genitore_1_telefono: ragazzo.genitore_1_telefono || '',
                            genitore_2_nome: ragazzo.genitore_2_nome || '', genitore_2_telefono: ragazzo.genitore_2_telefono || '',
                            note_sanitarie: ragazzo.note_sanitarie || ''
                          })
                          setIsOpen(true)
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-rose-500 hover:bg-rose-50 rounded-lg" 
                        onClick={() => { if(confirm('Vuoi archiviare questo ragazzo?')) updateRagazzo(ragazzo.id, 'attivo', false) }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Cards View ("Taccuino Tecnico") */}
      <div className="md:hidden space-y-3">
        {ragazzi.map((ragazzoItem) => {
          const ragazzo = ragazzoItem as any
          const badge = getSquadrigliaBadge(ragazzo.pattuglia)
          const BadgeIcon = badge.icon
          const phoneWA = ragazzo.genitore_1_telefono || ragazzo.genitore_2_telefono || ''

          return (
            <div key={ragazzo.id} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-2xs space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-agesci-blue text-white font-bold flex items-center justify-center text-sm shadow-2xs">
                    {ragazzo.nome[0]}{ragazzo.cognome[0]}
                  </div>
                  <div>
                    <h3 className="font-heading font-bold text-base text-slate-900 leading-tight">
                      {ragazzo.nome} {ragazzo.cognome}
                    </h3>
                    <span className={`inline-flex items-center gap-1.5 mt-1 px-2.5 py-0.5 rounded-full border text-[11px] font-bold ${badge.bg}`}>
                      <BadgeIcon className="h-3 w-3" />
                      <span>{ragazzo.pattuglia || 'Senza pattuglia'}</span>
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-9 w-9 text-agesci-blue hover:bg-sky-50 rounded-xl touch-min"
                    onClick={() => {
                      setEditingId(ragazzo.id)
                      setFormData({ 
                        nome: ragazzo.nome, cognome: ragazzo.cognome, sesso: ragazzo.sesso || '', pattuglia: ragazzo.pattuglia || '',
                        codice_censimento: ragazzo.codice_censimento || '', importo_censimento: ragazzo.importo_censimento !== null && ragazzo.importo_censimento !== undefined ? String(ragazzo.importo_censimento) : '', data_nascita: ragazzo.data_nascita || '',
                        residenza: ragazzo.residenza || '', telefono_ragazzo: ragazzo.telefono_ragazzo || '',
                        genitore_1_nome: ragazzo.genitore_1_nome || '', genitore_1_telefono: ragazzo.genitore_1_telefono || '',
                        genitore_2_nome: ragazzo.genitore_2_nome || '', genitore_2_telefono: ragazzo.genitore_2_telefono || '',
                        note_sanitarie: ragazzo.note_sanitarie || ''
                      })
                      setIsOpen(true)
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {phoneWA && (
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <Button 
                    size="sm" 
                    className="w-full h-9 bg-[#25D366] hover:bg-[#1DA851] text-white font-medium text-xs rounded-xl shadow-2xs touch-min"
                    onClick={() => {
                      const text = `Ciao, ti contatto dal Reparto Scout per ${ragazzo.nome}.`
                      window.open(`https://wa.me/${phoneWA.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(text)}`, '_blank')
                    }}
                  >
                    <MessageCircle className="w-4 h-4 mr-1.5" /> Contatta Genitore su WhatsApp
                  </Button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* MODALE SCANNER IA ANAGRAFICA & DOCUMENTI */}
      <Dialog open={isScannerOpen} onOpenChange={setIsScannerOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg text-agesci-blue">
              <Sparkles className="w-5 h-5 text-amber-500" /> Scanner IA Documenti & Anagrafica
            </DialogTitle>
            <DialogDescription>
              Fotografa o carica un documento (Modulo Privacy, Scheda Medica, Tessera AGESCI o Modulo Iscrizione). Gemini Vision IA estrarrà automaticamente i dati anagrafici ed aggiornerà il Reparto!
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:border-agesci-blue/50 transition-colors bg-slate-50">
              {isScanning ? (
                <div className="flex flex-col items-center justify-center space-y-2 py-4">
                  <Loader2 className="w-8 h-8 animate-spin text-agesci-blue" />
                  <span className="text-sm font-semibold text-slate-700">Analisi Gemini Vision IA in corso...</span>
                  <span className="text-xs text-slate-400">Estrazione automatica dati anagrafici e documento...</span>
                </div>
              ) : (
                <label className="cursor-pointer flex flex-col items-center justify-center space-y-2">
                  <Camera className="w-10 h-10 text-agesci-blue" />
                  <span className="text-sm font-semibold text-slate-800">Scatta foto o carica documento</span>
                  <span className="text-xs text-slate-400">Supporta JPG, PNG, PDF (Moduli Privacy, Tessere, Schede Mediche)</span>
                  <input 
                    type="file" 
                    accept="image/*,application/pdf" 
                    className="hidden" 
                    onChange={e => {
                      if (e.target.files?.[0]) handleDocumentScan(e.target.files[0])
                    }} 
                  />
                </label>
              )}
            </div>

            {scanResult && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-2 text-xs text-emerald-900">
                <div className="flex items-center gap-2 font-bold text-sm text-emerald-800">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Risultato Scansione Anagrafica:
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div><strong>Nome:</strong> {scanResult.nome} {scanResult.cognome}</div>
                  <div><strong>Pattuglia:</strong> {scanResult.pattuglia || 'Non specificata'}</div>
                  <div><strong>Codice Fiscale:</strong> {scanResult.codice_fiscale || 'N.D.'}</div>
                  <div><strong>Genitore 1:</strong> {scanResult.genitore_1_nome || 'N.D.'}</div>
                  <div><strong>Telefono:</strong> {scanResult.genitore_1_telefono || scanResult.telefono_ragazzo || 'N.D.'}</div>
                  <div><strong>Azione DB:</strong> {scanResult.db_status === 'updated' ? 'Anagrafica Aggiornata' : 'Nuovo Ragazzo Creato'}</div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
