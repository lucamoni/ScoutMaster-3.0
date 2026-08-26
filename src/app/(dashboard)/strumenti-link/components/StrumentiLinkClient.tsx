'use client'

import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { 
  ExternalLink, 
  Globe, 
  Search,
  ArrowRight
} from 'lucide-react'
import Link from 'next/link'

interface ScoutLink {
  titolo: string
  categoria: 'Ufficiali AGESCI' | 'Strumenti ScoutMaster' | 'Risorse Educative'
  descrizione: string
  url: string
  isExternal: boolean
  badge?: string
}

export function StrumentiLinkClient() {
  const [searchTerm, setSearchTerm] = useState('')

  const links: ScoutLink[] = [
    {
      titolo: 'BuonaCaccia.net',
      categoria: 'Ufficiali AGESCI',
      descrizione: 'Portale ufficiale per l\'iscrizione a Campi di Specialità, Eventi Regionali, Nazionali e Corsi di Formazione Capi.',
      url: 'https://buonacaccia.net',
      isExternal: true,
      badge: 'Ufficiale'
    },
    {
      titolo: 'AGESCI Nazionale',
      categoria: 'Ufficiali AGESCI',
      descrizione: 'Sito ufficiale dell\'Associazione Guide e Scouts Cattolici Italiani con notizie, documenti di branca ed aggiornamenti.',
      url: 'https://www.agesci.it',
      isExternal: true,
      badge: 'Ufficiale'
    },
    {
      titolo: 'Scout.it (Riviste & Risorse)',
      categoria: 'Risorse Educative',
      descrizione: 'Accesso alle riviste associative (Giochiamo, Avventura, Proposta) e schede di specialità per esploratori e guide.',
      url: 'https://www.scout.it',
      isExternal: true
    },
    {
      titolo: 'Sincronizzazione Google Sheets',
      categoria: 'Strumenti ScoutMaster',
      descrizione: 'Accedi direttamente alla configurazione del foglio di calcolo per sincronizzare in tempo reale ragazzi e spese.',
      url: '/impostazioni',
      isExternal: false,
      badge: 'Integrato'
    },
    {
      titolo: 'Gestione BuonaCaccia Interna',
      categoria: 'Strumenti ScoutMaster',
      descrizione: 'Modulo interno per ricercare gli eventi attivi su BuonaCaccia e monitorare le candidature dei ragazzi del reparto.',
      url: '/buonacaccia',
      isExternal: false,
      badge: 'Integrato'
    },
    {
      titolo: 'Raccordo Bilancio AGESCI',
      categoria: 'Strumenti ScoutMaster',
      descrizione: 'Generatore del rendiconto finanziario con le voci ufficiali previste dal regolamento contabile AGESCI.',
      url: '/report/bilancio-agesci',
      isExternal: false,
      badge: 'Report'
    }
  ]

  const filteredLinks = links.filter(l => 
    l.titolo.toLowerCase().includes(searchTerm.toLowerCase()) || 
    l.descrizione.toLowerCase().includes(searchTerm.toLowerCase())
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
            Accesso rapido ai portali AGESCI ufficiali e scorciatoie di ScoutMaster.
          </p>
        </div>
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
        {filteredLinks.map((link, idx) => (
          <Card key={idx} className="flex flex-col justify-between border-slate-200/80 shadow-2xs hover:shadow-md transition-all rounded-xl bg-white group">
            <CardHeader className="p-5 pb-2">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="bg-slate-50 text-slate-700 text-xs">
                  {link.categoria}
                </Badge>
                {link.badge && (
                  <Badge className="bg-agesci-blue text-amber-400 font-semibold text-[10px]">
                    {link.badge}
                  </Badge>
                )}
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
    </div>
  )
}
