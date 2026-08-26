'use client'

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
  FileText, 
  Download, 
  Plus, 
  Edit, 
  Trash2, 
  Search, 
  CheckCircle2, 
  Loader2
} from 'lucide-react'
import { toast } from 'sonner'
import jsPDF from 'jspdf'
import { createBrowserClient } from '@supabase/ssr'
import { Database } from '@/types/database.types'

interface CustomModello {
  id: string
  titolo: string
  categoria: 'Privacy' | 'Sanità' | 'Amministrazione' | 'Attività & Uscite' | 'Altro'
  descrizione: string
  obbligatorio: boolean
}

export function ModelliVuotiClient() {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('Tutti')
  const [modelliCustom, setModelliCustom] = useState<CustomModello[]>([])
  
  // Modale Aggiungi / Modifica
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingModello, setEditingModello] = useState<CustomModello | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const [formTitolo, setFormTitolo] = useState('')
  const [formCategoria, setFormCategoria] = useState<CustomModello['categoria']>('Privacy')
  const [formDescrizione, setFormDescrizione] = useState('')
  const [formObbligatorio, setFormObbligatorio] = useState(false)

  const supabase = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const defaultModelli: CustomModello[] = [
    {
      id: 'privacy',
      titolo: 'Modulo di Consenso Privacy GDPR AGESCI',
      categoria: 'Privacy',
      descrizione: 'Modulo ufficiale AGESCI per l\'autorizzazione al trattamento dei dati ed all\'uso delle immagini per le attività scout.',
      obbligatorio: true
    },
    {
      id: 'scheda_medica',
      titolo: 'Scheda Sanitaria e Medica Minorenni',
      categoria: 'Sanità',
      descrizione: 'Scheda sanitaria riservata per raccogliere intolleranze, allergie, farmaci e contatti d\'emergenza per i campi estivi e invernali.',
      obbligatorio: true
    },
    {
      id: 'ricevuta_cassa',
      titolo: 'Ricevuta di Versamento Quota (Censimento / Cassa)',
      categoria: 'Amministrazione',
      descrizione: 'Ricevuta da stampare e consegnare ai genitori per l\'avvenuto pagamento della quota d\'iscrizione o del campo.',
      obbligatorio: false
    },
    {
      id: 'autorizzazione_uscita',
      titolo: 'Autorizzazione Genitori per Uscita / Campo',
      categoria: 'Attività & Uscite',
      descrizione: 'Modulo di autorizzazione ed assunzione di responsabilità dei genitori per le uscite di pattuglia o di reparto.',
      obbligatorio: true
    }
  ]

  // Caricamento modelli personalizzati salvati nel DB
  useEffect(() => {
    async function loadModelli() {
      const { data } = await supabase.from('impostazioni').select('valore').eq('chiave', 'modelli_vuoti_custom').maybeSingle()
      if (data && data.valore) {
        try {
          const parsed = JSON.parse(data.valore)
          if (Array.isArray(parsed)) setModelliCustom(parsed)
        } catch {
          setModelliCustom(defaultModelli)
        }
      } else {
        setModelliCustom(defaultModelli)
      }
    }
    loadModelli()
  }, [])

  const saveModelliToDb = async (newList: CustomModello[]) => {
    setModelliCustom(newList)
    await supabase.from('impostazioni').upsert([
      { chiave: 'modelli_vuoti_custom', valore: JSON.stringify(newList) }
    ])
  }

  const handleOpenAdd = () => {
    setEditingModello(null)
    setFormTitolo('')
    setFormCategoria('Privacy')
    setFormDescrizione('')
    setFormObbligatorio(false)
    setIsModalOpen(true)
  }

  const handleOpenEdit = (m: CustomModello) => {
    setEditingModello(m)
    setFormTitolo(m.titolo)
    setFormCategoria(m.categoria)
    setFormDescrizione(m.descrizione)
    setFormObbligatorio(m.obbligatorio)
    setIsModalOpen(true)
  }

  const handleDeleteModello = async (id: string) => {
    if (!confirm('Sei sicuro di voler eliminare questo modello vuoto?')) return
    const updated = modelliCustom.filter(m => m.id !== id)
    await saveModelliToDb(updated)
    toast.success('Modello vuoto eliminato')
  }

  const handleSaveModello = async () => {
    if (!formTitolo.trim()) {
      toast.error('Inserisci il titolo del modello')
      return
    }
    setIsSaving(true)
    try {
      if (editingModello) {
        const updated = modelliCustom.map(m => m.id === editingModello.id ? {
          ...m,
          titolo: formTitolo.trim(),
          categoria: formCategoria,
          descrizione: formDescrizione.trim(),
          obbligatorio: formObbligatorio
        } : m)
        await saveModelliToDb(updated)
        toast.success('Modello aggiornato!')
      } else {
        const newModello: CustomModello = {
          id: 'mod_' + Date.now(),
          titolo: formTitolo.trim(),
          categoria: formCategoria,
          descrizione: formDescrizione.trim(),
          obbligatorio: formObbligatorio
        }
        const updated = [...modelliCustom, newModello]
        await saveModelliToDb(updated)
        toast.success('Nuovo modello aggiunto!')
      }
      setIsModalOpen(false)
    } finally {
      setIsSaving(false)
    }
  }

  // Generatore PDF dinamico
  const generatePdfForModello = (m: CustomModello) => {
    const doc = new jsPDF()
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text(`AGESCI - ${m.titolo.toUpperCase()}`, 20, 20)
    
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text('Gruppo Scout AGESCI ___________________________  Reparto ___________________________', 20, 32)
    doc.line(20, 38, 190, 38)

    doc.setFont('helvetica', 'bold')
    doc.text('DATI DELL\'ESPLORATORE / GUIDA:', 20, 48)
    doc.setFont('helvetica', 'normal')
    doc.text('Nome e Cognome: ___________________________________ Pattuglia: ______________________', 20, 56)
    doc.text('Data Nascita: ____/____/________ Codice Fiscale: ____________________________________', 20, 64)

    doc.setFont('helvetica', 'bold')
    doc.text('NOTE E DESCRIZIONE MODULO:', 20, 78)
    doc.setFont('helvetica', 'normal')
    const splitDesc = doc.splitTextToSize(m.descrizione, 170)
    doc.text(splitDesc, 20, 86)

    let currentY = 86 + splitDesc.length * 6 + 10
    doc.setFont('helvetica', 'bold')
    doc.text('DICHIARAZIONE E FIRMA:', 20, currentY)
    currentY += 8
    doc.setFont('helvetica', 'normal')
    doc.text('I sottoscritti genitori approvano e sottoscrivono quanto sopra dichiarato.', 20, currentY)
    currentY += 20
    doc.text('Data: ____ / ____ / ________', 20, currentY)
    doc.text('Firma Genitore / Tutore: __________________________________________________', 20, currentY + 10)

    doc.save(`${m.titolo.replace(/[^a-z0-9]/gi, '_')}_Vuoto.pdf`)
    toast.success(`Modello "${m.titolo}" generato in PDF!`)
  }

  const categorie = ['Tutti', 'Privacy', 'Sanità', 'Amministrazione', 'Attività & Uscite', 'Altro']

  const filteredModelli = modelliCustom.filter(m => {
    const matchesCategory = selectedCategory === 'Tutti' || m.categoria === selectedCategory
    const matchesSearch = m.titolo.toLowerCase().includes(searchTerm.toLowerCase()) || m.descrizione.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesCategory && matchesSearch
  })

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <FileText className="w-8 h-8 text-agesci-blue" />
            Modelli Vuoti & Moduli AGESCI
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Scarica, modifica ed aggiungi nuovi modelli in bianco per le iscrizioni ed i moduli del Reparto.
          </p>
        </div>
        <Button onClick={handleOpenAdd} className="bg-agesci-blue hover:bg-agesci-blue-light text-amber-400 font-semibold gap-2 shadow-sm">
          <Plus className="w-4 h-4" /> Nuovo Modello Vuoto
        </Button>
      </div>

      {/* Categorie e Ricerca */}
      <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="flex flex-wrap gap-2">
          {categorie.map(cat => (
            <Button 
              key={cat}
              variant={selectedCategory === cat ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory(cat)}
              className={selectedCategory === cat ? 'bg-agesci-blue text-white font-medium' : 'border-slate-200 text-slate-700'}
            >
              {cat}
            </Button>
          ))}
        </div>

        <div className="relative max-w-xs">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input 
            placeholder="Cerca modello..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-9 h-9 text-xs bg-white"
          />
        </div>
      </div>

      {/* Grid dei Modelli */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredModelli.map(m => (
          <Card key={m.id} className="flex flex-col justify-between border-slate-200/90 shadow-2xs hover:shadow-md transition-shadow rounded-xl bg-white relative">
            <CardHeader className="p-5 pb-3">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="outline" className="bg-sky-50 text-sky-800 border-sky-200 font-semibold text-xs">
                  {m.categoria}
                </Badge>
                <div className="flex items-center gap-1">
                  {m.obbligatorio && (
                    <Badge variant="destructive" className="text-[10px] uppercase font-bold mr-1">
                      Obbligatorio
                    </Badge>
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-slate-700" onClick={() => handleOpenEdit(m)} title="Modifica Modello">
                    <Edit className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-rose-600" onClick={() => handleDeleteModello(m.id)} title="Elimina Modello">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              <CardTitle className="text-base font-bold text-slate-900 mt-2 flex items-center gap-2">
                <FileText className="w-4 h-4 text-agesci-blue shrink-0" />
                {m.titolo}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 py-2 flex-1">
              <p className="text-xs text-slate-600 leading-relaxed">
                {m.descrizione}
              </p>
            </CardContent>
            <CardFooter className="p-5 pt-3 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between rounded-b-xl">
              <div className="text-xs font-medium text-slate-500 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Pronto in PDF
              </div>
              <Button 
                onClick={() => generatePdfForModello(m)}
                size="sm"
                className="bg-agesci-blue hover:bg-agesci-blue-light text-white gap-1.5 font-medium text-xs rounded-xl shadow-2xs"
              >
                <Download className="w-3.5 h-3.5" /> Scarica Modello PDF
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      {/* MODALE AGGIUNGI / MODIFICA MODELLO */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-lg text-agesci-blue flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {editingModello ? 'Modifica Modello Vuoto' : 'Aggiungi Nuovo Modello Vuoto'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="space-y-1.5">
              <Label>Titolo del Modello</Label>
              <Input 
                value={formTitolo}
                onChange={e => setFormTitolo(e.target.value)}
                placeholder="es. Modulo Autorizzazione Scalata"
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={formCategoria} onValueChange={(v: any) => setFormCategoria(v)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Seleziona categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Privacy">Privacy</SelectItem>
                  <SelectItem value="Sanità">Sanità</SelectItem>
                  <SelectItem value="Amministrazione">Amministrazione</SelectItem>
                  <SelectItem value="Attività & Uscite">Attività & Uscite</SelectItem>
                  <SelectItem value="Altro">Altro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Descrizione e Testo del Modello</Label>
              <Textarea 
                value={formDescrizione}
                onChange={e => setFormDescrizione(e.target.value)}
                placeholder="Descrivi lo scopo del modello ed il testo di autorizzazione..."
                className="h-24 text-xs"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input 
                type="checkbox"
                id="obblig"
                checked={formObbligatorio}
                onChange={e => setFormObbligatorio(e.target.checked)}
                className="rounded border-slate-300"
              />
              <Label htmlFor="obblig" className="cursor-pointer text-xs font-semibold text-slate-700">Contrassegna come Obbligatorio AGESCI</Label>
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" size="sm" onClick={() => setIsModalOpen(false)}>Annulla</Button>
            <Button size="sm" onClick={handleSaveModello} disabled={isSaving} className="bg-agesci-blue hover:bg-agesci-blue-light text-white">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salva Modello'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
