'use client'

import { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
  ExternalLink, 
  Globe, 
  Search,
  ArrowRight,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  CheckCircle2,
  Bookmark
} from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Database } from '@/types/database.types'

export interface ScoutLink {
  id: string
  titolo: string
  categoria: 'Ufficiali AGESCI' | 'Strumenti ScoutMaster' | 'Risorse Educative' | 'Link Personali Staff' | string
  descrizione: string
  url: string
  isExternal: boolean
  badge?: string
}

const defaultLinks: ScoutLink[] = [
  {
    id: 'link_1',
    titolo: 'BuonaCaccia.net',
    categoria: 'Ufficiali AGESCI',
    descrizione: 'Portale ufficiale per l\'iscrizione a Campi di Specialità, Eventi Regionali, Nazionali e Corsi di Formazione Capi.',
    url: 'https://buonacaccia.net',
    isExternal: true,
    badge: 'Ufficiale'
  },
  {
    id: 'link_2',
    titolo: 'AGESCI Nazionale',
    categoria: 'Ufficiali AGESCI',
    descrizione: 'Sito ufficiale dell\'Associazione Guide e Scouts Cattolici Italiani con notizie, documenti di branca ed aggiornamenti.',
    url: 'https://www.agesci.it',
    isExternal: true,
    badge: 'Ufficiale'
  },
  {
    id: 'link_3',
    titolo: 'Scout.it (Riviste & Risorse)',
    categoria: 'Risorse Educative',
    descrizione: 'Accesso alle riviste associative (Giochiamo, Avventura, Proposta) e schede di specialità per esploratori e guide.',
    url: 'https://www.scout.it',
    isExternal: true
  },
  {
    id: 'link_4',
    titolo: 'Sincronizzazione Google Sheets',
    categoria: 'Strumenti ScoutMaster',
    descrizione: 'Accedi direttamente alla configurazione del foglio di calcolo per sincronizzare in tempo reale ragazzi e spese.',
    url: '/impostazioni',
    isExternal: false,
    badge: 'Integrato'
  },
  {
    id: 'link_5',
    titolo: 'Gestione BuonaCaccia Interna',
    categoria: 'Strumenti ScoutMaster',
    descrizione: 'Modulo interno per ricercare gli eventi attivi su BuonaCaccia e monitorare le candidature dei ragazzi del reparto.',
    url: '/buonacaccia',
    isExternal: false,
    badge: 'Integrato'
  },
  {
    id: 'link_6',
    titolo: 'Raccordo Bilancio AGESCI',
    categoria: 'Strumenti ScoutMaster',
    descrizione: 'Generatore del rendiconto finanziario con le voci ufficiali previste dal regolamento contabile AGESCI.',
    url: '/report/bilancio-agesci',
    isExternal: false,
    badge: 'Report'
  }
]

export function StrumentiLinkClient() {
  const [links, setLinks] = useState<ScoutLink[]>(defaultLinks)
  const [searchTerm, setSearchTerm] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingLink, setEditingLink] = useState<ScoutLink | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Campi Form Modale
  const [formTitolo, setFormTitolo] = useState('')
  const [formCategoria, setFormCategoria] = useState<string>('Ufficiali AGESCI')
  const [formDescrizione, setFormDescrizione] = useState('')
  const [formUrl, setFormUrl] = useState('')
  const [formIsExternal, setFormIsExternal] = useState<boolean>(true)
  const [formBadge, setFormBadge] = useState('')

  const supabase = createClient()

  // Carica i link dinamici salvati su Supabase
  useEffect(() => {
    async function loadCustomLinks() {
      const { data } = await supabase
        .from('impostazioni')
        .select('valore')
        .eq('chiave', 'custom_strumenti_link')
        .maybeSingle()

      if (data && data.valore) {
        try {
          const parsed = JSON.parse(data.valore)
          if (Array.isArray(parsed) && parsed.length > 0) {
            setLinks(parsed)
          }
        } catch {}
      }
    }
    loadCustomLinks()
  }, [])

  const saveLinksToDb = async (newList: ScoutLink[]) => {
    setLinks(newList)
    await supabase.from('impostazioni').upsert([
      { chiave: 'custom_strumenti_link', valore: JSON.stringify(newList) }
    ])
  }

  const handleOpenAddModal = () => {
    setEditingLink(null)
    setFormTitolo('')
    setFormCategoria('Ufficiali AGESCI')
    setFormDescrizione('')
    setFormUrl('')
    setFormIsExternal(true)
    setFormBadge('')
    setIsModalOpen(true)
  }

  const handleOpenEditModal = (link: ScoutLink) => {
    setEditingLink(link)
    setFormTitolo(link.titolo)
    setFormCategoria(link.categoria)
    setFormDescrizione(link.descrizione)
    setFormUrl(link.url)
    setFormIsExternal(link.isExternal)
    setFormBadge(link.badge || '')
    setIsModalOpen(true)
  }

  const handleSaveLink = async () => {
    if (!formTitolo.trim() || !formUrl.trim()) {
      toast.error('Titolo ed URL sono obbligatori')
      return
    }

    setIsSaving(true)
    try {
      if (editingLink) {
        // Modifica link esistente
        const updated = links.map(l => l.id === editingLink.id ? {
          ...l,
          titolo: formTitolo.trim(),
          categoria: formCategoria,
          descrizione: formDescrizione.trim(),
          url: formUrl.trim(),
          isExternal: formIsExternal,
          badge: formBadge.trim() || undefined
        } : l)
        await saveLinksToDb(updated)
        toast.success(`Link "${formTitolo.trim()}" aggiornato!`)
      } else {
        // Creazione nuovo link
        const newLinkItem: ScoutLink = {
          id: 'link_' + Date.now(),
          titolo: formTitolo.trim(),
          categoria: formCategoria,
          descrizione: formDescrizione.trim(),
          url: formUrl.trim(),
          isExternal: formIsExternal,
          badge: formBadge.trim() || undefined
        }
        const updated = [...links, newLinkItem]
        await saveLinksToDb(updated)
        toast.success(`Nuovo link "${formTitolo.trim()}" creato con successo!`)
      }
      setIsModalOpen(false)
    } catch (err: any) {
      toast.error(err.message || 'Impossibile salvare il link')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteLink = async (linkId: string, linkTitle: string) => {
    if (!confirm(`Sei sicuro di voler eliminare la card "${linkTitle}"?`)) return

    const updated = links.filter(l => l.id !== linkId)
    await saveLinksToDb(updated)
    toast.success(`Card "${linkTitle}" eliminata`)
  }

  const filteredLinks = links.filter(l => 
    l.titolo.toLowerCase().includes(searchTerm.toLowerCase()) || 
    l.descrizione.toLowerCase().includes(searchTerm.toLowerCase()) ||
    l.categoria.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="p-4 md:p-6 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Globe className="w-8 h-8 text-agesci-blue" />
            Strumenti & Link Utili
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Accesso rapido ai portali AGESCI ufficiali e scorciatoie personalizzabili per lo staff Capi.
          </p>
        </div>

        <Button onClick={handleOpenAddModal} className="bg-agesci-blue hover:bg-agesci-blue-light text-white font-semibold gap-2 shadow-sm">
          <Plus className="w-4 h-4" /> + Nuovo Link / Strumento
        </Button>
      </div>

      {/* Ricerca */}
      <div className="relative max-w-sm">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <Input 
          placeholder="Cerca link o strumento..." 
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="pl-9 h-10 text-xs bg-white"
        />
      </div>

      {/* Grid dei Link */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {filteredLinks.map((link) => (
          <Card key={link.id} className="flex flex-col justify-between border-slate-200/80 shadow-2xs hover:shadow-md transition-all rounded-xl bg-white group">
            <CardHeader className="p-5 pb-2">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="bg-slate-50 text-slate-700 text-xs">
                  {link.categoria}
                </Badge>
                
                <div className="flex items-center gap-1.5">
                  {link.badge && (
                    <Badge className="bg-agesci-blue text-amber-400 font-semibold text-[10px]">
                      {link.badge}
                    </Badge>
                  )}

                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7 text-slate-400 hover:text-agesci-blue"
                    onClick={() => handleOpenEditModal(link)}
                    title="Modifica Card"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>

                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7 text-slate-400 hover:text-rose-600"
                    onClick={() => handleDeleteLink(link.id, link.titolo)}
                    title="Elimina Card"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              <CardTitle className="text-base font-bold text-slate-900 mt-3 group-hover:text-agesci-blue transition-colors flex items-center gap-2">
                {link.titolo}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 py-2 flex-1">
              <p className="text-xs text-slate-600 leading-relaxed">
                {link.descrizione}
              </p>
            </CardContent>
            <CardFooter className="p-5 pt-3 border-t border-slate-100 bg-slate-50/40 rounded-b-xl">
              {link.isExternal ? (
                <Button 
                  onClick={() => window.open(link.url, '_blank')}
                  size="sm"
                  className="w-full bg-agesci-blue hover:bg-agesci-blue-light text-white font-medium text-xs gap-2 rounded-xl"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Apri Portale Esterno
                </Button>
              ) : (
                <Link href={link.url} className="w-full">
                  <Button 
                    size="sm"
                    variant="outline"
                    className="w-full border-slate-300 text-slate-800 hover:bg-slate-100 font-medium text-xs gap-2 rounded-xl"
                  >
                    Apri in ScoutMaster <ArrowRight className="w-3.5 h-3.5" />
                  </Button>
                </Link>
              )}
            </CardFooter>
          </Card>
        ))}
      </div>

      {/* MODALE DI CREAZIONE / MODIFICA LINK CARD */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-agesci-blue flex items-center gap-2">
              <Bookmark className="w-5 h-5" />
              {editingLink ? `Modifica Link: ${editingLink.titolo}` : 'Crea Nuovo Link / Strumento Card'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Inserisci l'URL ed i dettagli per personalizzare la card di collegamento.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="space-y-1">
              <Label>Titolo del Link / Sito</Label>
              <Input 
                placeholder="es. Meteo Campi AGESCI / Drive Reparto"
                value={formTitolo}
                onChange={e => setFormTitolo(e.target.value)}
                className="h-9"
              />
            </div>

            <div className="space-y-1">
              <Label>Categoria</Label>
              <Select value={formCategoria} onValueChange={setFormCategoria}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Seleziona categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Ufficiali AGESCI">Ufficiali AGESCI</SelectItem>
                  <SelectItem value="Strumenti ScoutMaster">Strumenti ScoutMaster</SelectItem>
                  <SelectItem value="Risorse Educative">Risorse Educative</SelectItem>
                  <SelectItem value="Link Personali Staff">Link Personali Staff</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>URL Destinazione (Link)</Label>
              <Input 
                placeholder="https://... oppure /buonacaccia"
                value={formUrl}
                onChange={e => setFormUrl(e.target.value)}
                className="h-9 font-mono text-[11px]"
              />
            </div>

            <div className="space-y-1">
              <Label>Tipo di Collegamento</Label>
              <Select value={formIsExternal ? 'true' : 'false'} onValueChange={v => setFormIsExternal(v === 'true')}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Tipo link" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">🌐 Sito Esterno (apri in una nuova scheda)</SelectItem>
                  <SelectItem value="false">🔗 Pagina Interna ScoutMaster</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Badge Personalizzato (Opzionale)</Label>
              <Input 
                placeholder="es. Ufficiale, Meteo, Drive, Staff"
                value={formBadge}
                onChange={e => setFormBadge(e.target.value)}
                className="h-9"
              />
            </div>

            <div className="space-y-1">
              <Label>Descrizione</Label>
              <Textarea 
                placeholder="Spiega a cosa serve questo link..."
                value={formDescrizione}
                onChange={e => setFormDescrizione(e.target.value)}
                className="h-20 text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsModalOpen(false)}>Annulla</Button>
            <Button size="sm" onClick={handleSaveLink} disabled={isSaving} className="bg-agesci-blue hover:bg-agesci-blue-light text-white font-medium">
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {editingLink ? 'Salva Modifiche Card' : 'Crea Card Link'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
