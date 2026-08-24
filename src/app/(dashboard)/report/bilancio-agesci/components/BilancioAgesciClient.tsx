'use client'

import { useState } from 'react'
import { Database } from '@/types/database.types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { 
  FileSpreadsheet, 
  Copy, 
  Check, 
  Lock, 
  Unlock, 
  TrendingUp, 
  TrendingDown, 
  Scale, 
  ShieldCheck,
  Building2,
  Wallet
} from 'lucide-react'
import { toast } from 'sonner'
import { createBrowserClient } from '@supabase/ssr'

type Spesa = Database['public']['Tables']['registro_spese']['Row']
type Ragazzo = Database['public']['Tables']['ragazzi']['Row']

export interface AgesciVoce {
  codice: string
  titolo: string
  tipo: 'ENTRATA' | 'USCITA'
  descrizione: string
  keywords: string[]
}

export const AGESCI_VOCI: AgesciVoce[] = [
  // ENTRATE
  {
    codice: 'E.01',
    titolo: 'Quote Censimento di competenza',
    tipo: 'ENTRATA',
    descrizione: 'Quote versate dagli esploratori/guide per il censimento AGESCI',
    keywords: ['censimento', 'censiti', 'iscrizione annuale']
  },
  {
    codice: 'E.02',
    titolo: 'Quote ordinarie di branca / Autofinanziamenti',
    tipo: 'ENTRATA',
    descrizione: 'Quote mensili di reparto, autofinanziamenti, vendita torte/calendari',
    keywords: ['quota mensile', 'mensile', 'autofinanziamento', 'torta', 'vendita', 'mercatino']
  },
  {
    codice: 'E.03',
    titolo: 'Quote partecipazione attività ed eventi',
    tipo: 'ENTRATA',
    descrizione: 'Quote per uscite, campi invernali (CI), campi estivi (CE), San Giorgio',
    keywords: ['uscita', 'campo', 'ci', 'ce', 'san giorgio', 'evento', 'quota evento', 'pernottamento']
  },
  {
    codice: 'E.04',
    titolo: 'Contributi, Sussidi e Donazioni',
    tipo: 'ENTRATA',
    descrizione: 'Donazioni da famiglie, contributi parrocchiali o comunali',
    keywords: ['contributo', 'donazione', 'sussidio', 'offerta', 'parrocchia']
  },
  {
    codice: 'E.99',
    titolo: 'Altre Entrate di branca',
    tipo: 'ENTRATA',
    descrizione: 'Altre entrate varie di reparto non classificate altrove',
    keywords: []
  },

  // USCITE
  {
    codice: 'U.01',
    titolo: 'Generi alimentari / Vitto (Cambusa)',
    tipo: 'USCITA',
    descrizione: 'Spesa alimentare per uscite, campi e attività (Supermercato, Panificio)',
    keywords: ['cambusa', 'vitto', 'spesa alimentare', 'supermercato', 'cibo', 'coop', 'conad', 'panificio']
  },
  {
    codice: 'U.02',
    titolo: 'Materiale per attività e attrezzature',
    tipo: 'USCITA',
    descrizione: 'Tende, corde, materiale di squadriglia, bricolage, attrezzi',
    keywords: ['materiale', 'attrezzatura', 'tenda', 'bricolage', 'ferramenta', 'decathlon', 'legna', 'lavoro']
  },
  {
    codice: 'U.03',
    titolo: 'Spese di viaggio e trasporti',
    tipo: 'USCITA',
    descrizione: 'Pullman, treni, carburante/benzina, rimborsi viaggio, autostrada',
    keywords: ['trasporto', 'pullman', 'treno', 'benzina', 'carburante', 'pedaggio', 'rimborso auto', 'viaggio']
  },
  {
    codice: 'U.04',
    titolo: 'Spese per alloggio e strutture (Basi Scout / Posti Campo)',
    tipo: 'USCITA',
    descrizione: 'Affitto basi scout, case per accantonamento, posti campo, campeggi',
    keywords: ['accantonamento', 'base scout', 'posto campo', 'affitto', 'struttura', 'alloggio', 'casa']
  },
  {
    codice: 'U.05',
    titolo: 'Spese minute e cancelleria',
    tipo: 'USCITA',
    descrizione: 'Cancelleria, quaderni, pennarelli, stampe, fotocopie',
    keywords: ['cancelleria', 'spese minute', 'stampa', 'fotocopia', 'quaderno', 'pennarelli', 'carta']
  },
  {
    codice: 'U.06',
    titolo: 'Quote Censimento ed Assicurazioni Nazionali/Regionali',
    tipo: 'USCITA',
    descrizione: 'Versamento quote censimento ad AGESCI o assicurazioni integrative',
    keywords: ['versamento censimento', 'quota agesci', 'assicurazione']
  },
  {
    codice: 'U.99',
    titolo: 'Altre Uscite di branca',
    tipo: 'USCITA',
    descrizione: 'Altre spese e uscite di reparto non classificate altrove',
    keywords: []
  }
]

export default function BilancioAgesciClient({
  initialSpese,
  initialRagazzi = [],
  initialSettings
}: {
  initialSpese: Spesa[]
  initialRagazzi?: Ragazzo[]
  initialSettings: Record<string, string>
}) {
  const [selectedAnnoScout, setSelectedAnnoScout] = useState<string>('2025/2026')
  const [settings, setSettings] = useState<Record<string, string>>(initialSettings)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  
  const supabase = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Saldi iniziali configurabili al 01/10
  const cassaInizialeKey = `saldo_iniziale_cassa_${selectedAnnoScout}`
  const bancaInizialeKey = `saldo_iniziale_banca_${selectedAnnoScout}`
  const annoChiusoKey = `anno_chiuso_${selectedAnnoScout}`

  const saldoInizialeCassa = parseFloat(settings[cassaInizialeKey] || '0') || 0
  const saldoInizialeBanca = parseFloat(settings[bancaInizialeKey] || '0') || 0
  const isAnnoChiuso = settings[annoChiusoKey] === 'true'

  // Calcolo intervallo date Anno Scout (01/10/YYYY -> 30/09/YYYY+1)
  const [startYearStr, endYearStr] = selectedAnnoScout.split('/')
  const startYear = parseInt(startYearStr || '2025', 10)
  const endYear = parseInt(endYearStr || '2026', 10)

  const startDate = `${startYear}-10-01`
  const endDate = `${endYear}-09-30`

  // Filtra movimenti di cassa per l'anno scout selezionato
  const speseAnno = initialSpese.filter(s => {
    if (!s.data) return false
    return s.data >= startDate && s.data <= endDate
  })

  // Classifica la spesa/entrata in una voce AGESCI
  const classifySpesa = (spesa: Spesa): string => {
    const voceText = (spesa.voce_spesa || '').toLowerCase()
    const tipo = spesa.tipo_movimento === 'ENTRATA' ? 'ENTRATA' : 'USCITA'

    const availableVoci = AGESCI_VOCI.filter(v => v.tipo === tipo)
    
    for (const v of availableVoci) {
      if (v.keywords.length > 0 && v.keywords.some(kw => voceText.includes(kw))) {
        return v.codice
      }
    }

    return tipo === 'ENTRATA' ? 'E.99' : 'U.99'
  }

  // Aggrega i totali per ogni voce AGESCI
  const totaliVoci: Record<string, number> = {}
  AGESCI_VOCI.forEach(v => { totaliVoci[v.codice] = 0 })

  speseAnno.forEach(spesa => {
    const codice = classifySpesa(spesa)
    totaliVoci[codice] = (totaliVoci[codice] || 0) + (spesa.importo || 0)
  })

  // Calcolo Quota Censimento E.01 direttamente dall'anagrafica ragazzi censiti
  const standardQuotaCensimento = Number(settings['quota_censimento_standard']) || 45
  const censimentoAgesciTotale = initialRagazzi
    .filter(r => r.quota_censimento === true)
    .reduce((acc, r) => acc + (r.importo_censimento !== null && r.importo_censimento !== undefined ? Number(r.importo_censimento) : standardQuotaCensimento), 0)

  totaliVoci['E.01'] = censimentoAgesciTotale

  // Calcolo Totali Complessivi
  const totaleEntrate = AGESCI_VOCI.filter(v => v.tipo === 'ENTRATA').reduce((acc, v) => acc + (totaliVoci[v.codice] || 0), 0)
  const totaleUscite = AGESCI_VOCI.filter(v => v.tipo === 'USCITA').reduce((acc, v) => acc + (totaliVoci[v.codice] || 0), 0)
  const risultatoEsercizio = totaleEntrate - totaleUscite

  // Riconciliazione Saldi Cassa Contanti e C/C Banca
  let entrateContanti = 0
  let usciteContanti = 0
  let entrateBanca = 0
  let usciteBanca = 0

  speseAnno.forEach(s => {
    const m = (s.metodo || '').toUpperCase()
    const isBanca = m.includes('BONIFICO') || m.includes('CARTA') || m.includes('BANCA')

    if (s.tipo_movimento === 'ENTRATA') {
      if (isBanca) entrateBanca += s.importo
      else entrateContanti += s.importo
    } else {
      if (isBanca) usciteBanca += s.importo
      else usciteContanti += s.importo
    }
  })

  const saldoFinaleCassa = saldoInizialeCassa + entrateContanti - usciteContanti
  const saldoFinaleBanca = saldoInizialeBanca + entrateBanca - usciteBanca
  const saldoFinaleTotale = saldoFinaleCassa + saldoFinaleBanca
  const saldoInizialeTotale = saldoInizialeCassa + saldoInizialeBanca

  // Controllo Quadratura Bilancio
  const quadraturaTeorica = saldoInizialeTotale + risultatoEsercizio
  const differenzaQuadratura = Math.abs(saldoFinaleTotale - quadraturaTeorica)
  const isQuadrato = differenzaQuadratura < 0.01

  // Salva saldo iniziale
  const handleSaveSaldo = async (key: string, value: string) => {
    setSettings(prev => ({ ...prev, [key]: value }))
    const { error } = await supabase.from('impostazioni').upsert({ chiave: key, valore: value })
    if (error) {
      toast.error("Errore nel salvataggio del saldo iniziale")
    } else {
      toast.success("Saldo iniziale aggiornato")
    }
  }

  // Gestione Chiusura Anno Contabile
  const handleToggleChiusuraAnno = async () => {
    const newStatus = !isAnnoChiuso
    const newStatusStr = newStatus ? 'true' : 'false'

    setSettings(prev => ({ ...prev, [annoChiusoKey]: newStatusStr }))
    await supabase.from('impostazioni').upsert({ chiave: annoChiusoKey, valore: newStatusStr })

    if (newStatus) {
      // Imposta automaticamente i saldi finali come saldi iniziali dell'anno successivo
      const nextAnnoStr = `${endYear}/${endYear + 1}`
      const nextCassaKey = `saldo_iniziale_cassa_${nextAnnoStr}`
      const nextBancaKey = `saldo_iniziale_banca_${nextAnnoStr}`

      await supabase.from('impostazioni').upsert([
        { chiave: nextCassaKey, valore: saldoFinaleCassa.toFixed(2) },
        { chiave: nextBancaKey, valore: saldoFinaleBanca.toFixed(2) }
      ])

      setSettings(prev => ({
        ...prev,
        [nextCassaKey]: saldoFinaleCassa.toFixed(2),
        [nextBancaKey]: saldoFinaleBanca.toFixed(2)
      }))

      toast.success(`Anno Scout ${selectedAnnoScout} Chiuso e Congelato! Saldi trasferiti all'anno ${nextAnnoStr}.`)
    } else {
      toast.info(`Anno Scout ${selectedAnnoScout} Riaperto per modifiche.`)
    }
  }

  // Copia Rapida negli Appunti per bilancio.agesci.it
  const handleCopyAmount = (codice: string, importo: number) => {
    const formatted = importo.toFixed(2).replace('.', ',')
    navigator.clipboard.writeText(formatted)
    setCopiedCode(codice)
    toast.success(`Copiato ${codice}: € ${formatted} negli appunti!`)
    setTimeout(() => setCopiedCode(null), 2000)
  }

  // Esportazione CSV per bilancio.agesci.it / Excel
  const handleExportCSV = () => {
    let csvContent = `ScoutMaster 3.0 - Raccordo Bilancio AGESCI\n`
    csvContent += `Anno Scout:;${selectedAnnoScout}\n`
    csvContent += `Periodo:;${startDate} al ${endDate}\n`
    csvContent += `Data Generazione:;${new Date().toLocaleDateString('it-IT')}\n\n`

    csvContent += `--- ENTRATE DELLO REPARTO ---\n`
    csvContent += `Codice AGESCI;Voce Piano dei Conti;Descrizione;Totale Euro (€)\n`
    AGESCI_VOCI.filter(v => v.tipo === 'ENTRATA').forEach(v => {
      const tot = (totaliVoci[v.codice] || 0).toFixed(2).replace('.', ',')
      csvContent += `"${v.codice}";"${v.titolo}";"${v.descrizione}";${tot}\n`
    })
    csvContent += `;;TOTALE ENTRATE;${totaleEntrate.toFixed(2).replace('.', ',')}\n\n`

    csvContent += `--- USCITE DEL REPARTO ---\n`
    csvContent += `Codice AGESCI;Voce Piano dei Conti;Descrizione;Totale Euro (€)\n`
    AGESCI_VOCI.filter(v => v.tipo === 'USCITA').forEach(v => {
      const tot = (totaliVoci[v.codice] || 0).toFixed(2).replace('.', ',')
      csvContent += `"${v.codice}";"${v.titolo}";"${v.descrizione}";${tot}\n`
    })
    csvContent += `;;TOTALE USCITE;${totaleUscite.toFixed(2).replace('.', ',')}\n\n`

    csvContent += `--- PROSPETTO RICONCILIAZIONE SALDI ---\n`
    csvContent += `Conto;Saldo Iniziale (01/10);Entrate;Uscite;Saldo Finale (30/09)\n`
    csvContent += `Cassa Contanti;${saldoInizialeCassa.toFixed(2).replace('.', ',')};${entrateContanti.toFixed(2).replace('.', ',')};${usciteContanti.toFixed(2).replace('.', ',')};${saldoFinaleCassa.toFixed(2).replace('.', ',')}\n`
    csvContent += `Banca C/C;${saldoInizialeBanca.toFixed(2).replace('.', ',')};${entrateBanca.toFixed(2).replace('.', ',')};${usciteBanca.toFixed(2).replace('.', ',')};${saldoFinaleBanca.toFixed(2).replace('.', ',')}\n`
    csvContent += `TOTALE RICONCILIATO;${saldoInizialeTotale.toFixed(2).replace('.', ',')};${totaleEntrate.toFixed(2).replace('.', ',')};${totaleUscite.toFixed(2).replace('.', ',')};${saldoFinaleTotale.toFixed(2).replace('.', ',')}\n`

    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `Raccordo_Bilancio_AGESCI_${selectedAnnoScout.replace('/', '_')}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast.success("File CSV scaricato con successo!")
  }

  return (
    <div className="space-y-6">
      
      {/* Header Pagina & Selezione Anno Scout */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-card p-6 rounded-xl border shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-primary">Raccordo Bilancio AGESCI</h1>
            <Badge variant={isAnnoChiuso ? "secondary" : "default"} className={isAnnoChiuso ? "bg-amber-100 text-amber-800 border-amber-300" : "bg-green-600"}>
              {isAnnoChiuso ? <Lock className="h-3 w-3 mr-1" /> : <Unlock className="h-3 w-3 mr-1" />}
              {isAnnoChiuso ? "Anno Scout Chiuso" : "Anno in Corso"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Prospetto aggregato e riconciliazione saldi per la trascrizione su <strong>bilancio.agesci.it</strong>.
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase">Anno Scout:</span>
            <Select value={selectedAnnoScout} onValueChange={(v) => setSelectedAnnoScout(v || '')}>
              <SelectTrigger className="w-36 font-semibold">
                <SelectValue placeholder="Seleziona..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2023/2024">2023 / 2024</SelectItem>
                <SelectItem value="2024/2025">2024 / 2025</SelectItem>
                <SelectItem value="2025/2026">2025 / 2026</SelectItem>
                <SelectItem value="2026/2027">2026 / 2027</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button 
            variant="outline" 
            onClick={handleExportCSV}
            className="bg-green-50 text-green-700 hover:bg-green-100 border-green-200"
          >
            <FileSpreadsheet className="h-4 w-4 mr-2" /> Esporta CSV / Excel
          </Button>

          <Button 
            variant={isAnnoChiuso ? "outline" : "default"}
            onClick={handleToggleChiusuraAnno}
            className={isAnnoChiuso ? "border-amber-300 text-amber-900 bg-amber-50" : "bg-primary"}
          >
            {isAnnoChiuso ? <Unlock className="h-4 w-4 mr-2" /> : <Lock className="h-4 w-4 mr-2" />}
            {isAnnoChiuso ? "Riapri Anno" : "Chiudi Anno Contabile"}
          </Button>
        </div>
      </div>

      {/* KPI Sintesi Bilancio & Quadratura */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-green-200 bg-green-50/20">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-green-700">
              Totale Entrate Reparto <TrendingUp className="h-4 w-4 text-green-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-green-800">
              € {totaleEntrate.toFixed(2)}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card className="border-red-200 bg-red-50/20">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-red-700">
              Totale Uscite Reparto <TrendingDown className="h-4 w-4 text-red-600" />
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-red-800">
              € {totaleUscite.toFixed(2)}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card className={risultatoEsercizio >= 0 ? "border-blue-200 bg-blue-50/20" : "border-amber-200 bg-amber-50/20"}>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-primary">
              Risultato d&apos;Esercizio <Scale className="h-4 w-4" />
            </CardDescription>
            <CardTitle className={`text-2xl font-bold ${risultatoEsercizio >= 0 ? "text-blue-800" : "text-amber-800"}`}>
              € {risultatoEsercizio.toFixed(2)}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card className={isQuadrato ? "border-emerald-300 bg-emerald-500/10" : "border-amber-300 bg-amber-500/10"}>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between font-semibold">
              Quadratura Bilancio <ShieldCheck className={isQuadrato ? "h-4 w-4 text-emerald-600" : "h-4 w-4 text-amber-600"} />
            </CardDescription>
            <div className="flex items-center gap-2 mt-1">
              <Badge className={isQuadrato ? "bg-emerald-600 text-white" : "bg-amber-600 text-white"}>
                {isQuadrato ? "QUADRATO" : "CONTROLLARE"}
              </Badge>
              <span className="text-xs text-muted-foreground font-mono">
                Diff: € {differenzaQuadratura.toFixed(2)}
              </span>
            </div>
          </CardHeader>
        </Card>
      </div>

      {/* Sezione Raccordo Voci Piano dei Conti AGESCI */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* ENTRATE AGESCI */}
        <Card className="border-green-200 shadow-sm">
          <CardHeader className="bg-green-50/40 border-b border-green-100">
            <CardTitle className="text-lg font-bold text-green-900 flex items-center justify-between">
              <span>ENTRATE — Piano dei Conti AGESCI</span>
              <Badge variant="outline" className="border-green-300 text-green-800">
                Totale: € {totaleEntrate.toFixed(2)}
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs text-green-700">
              Clicca su [ 📋 Copia ] per incollare il valore direttamente sul portale AGESCI.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 divide-y">
            {AGESCI_VOCI.filter(v => v.tipo === 'ENTRATA').map(voce => {
              const importo = totaliVoci[voce.codice] || 0
              const isCopied = copiedCode === voce.codice
              return (
                <div key={voce.codice} className="p-4 flex items-center justify-between hover:bg-muted/10 transition-colors">
                  <div className="space-y-0.5 max-w-[65%]">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-green-100 text-green-800">
                        {voce.codice}
                      </span>
                      <span className="font-semibold text-sm">{voce.titolo}</span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1">{voce.descrizione}</p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-base text-green-800">
                      € {importo.toFixed(2)}
                    </span>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => handleCopyAmount(voce.codice, importo)}
                      className={`h-8 px-2.5 text-xs border-green-200 ${isCopied ? "bg-green-600 text-white" : "hover:bg-green-100 text-green-800"}`}
                    >
                      {isCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                      {isCopied ? "Copiato" : "Copia"}
                    </Button>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        {/* USCITE AGESCI */}
        <Card className="border-red-200 shadow-sm">
          <CardHeader className="bg-red-50/40 border-b border-red-100">
            <CardTitle className="text-lg font-bold text-red-900 flex items-center justify-between">
              <span>USCITE — Piano dei Conti AGESCI</span>
              <Badge variant="outline" className="border-red-300 text-red-800">
                Totale: € {totaleUscite.toFixed(2)}
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs text-red-700">
              Clicca su [ 📋 Copia ] per incollare il valore direttamente sul portale AGESCI.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 divide-y">
            {AGESCI_VOCI.filter(v => v.tipo === 'USCITA').map(voce => {
              const importo = totaliVoci[voce.codice] || 0
              const isCopied = copiedCode === voce.codice
              return (
                <div key={voce.codice} className="p-4 flex items-center justify-between hover:bg-muted/10 transition-colors">
                  <div className="space-y-0.5 max-w-[65%]">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-800">
                        {voce.codice}
                      </span>
                      <span className="font-semibold text-sm">{voce.titolo}</span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1">{voce.descrizione}</p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-base text-red-800">
                      € {importo.toFixed(2)}
                    </span>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => handleCopyAmount(voce.codice, importo)}
                      className={`h-8 px-2.5 text-xs border-red-200 ${isCopied ? "bg-red-600 text-white" : "hover:bg-red-100 text-red-800"}`}
                    >
                      {isCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                      {isCopied ? "Copiato" : "Copia"}
                    </Button>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>

      {/* Prospetto Riconciliazione Saldi (Cassa & Banca) */}
      <Card className="border-blue-200 shadow-sm">
        <CardHeader className="bg-blue-50/30 border-b border-blue-100">
          <CardTitle className="text-lg font-bold text-blue-950 flex items-center gap-2">
            <Scale className="h-5 w-5 text-blue-600" /> Prospetto Riconciliazione Saldi Cassa & Conto Corrente (01/10 - 30/09)
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Verifica la quadratura tra il saldo iniziale al 1° ottobre, i movimenti dell&apos;anno e il saldo finale al 30 settembre per Cassa Contanti e C/C Bancario.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Cassa Contanti */}
            <div className="border rounded-xl p-4 space-y-4 bg-muted/10">
              <div className="flex items-center gap-2 font-semibold text-sm border-b pb-2">
                <Wallet className="h-4 w-4 text-amber-600" />
                <span>Cassa Contanti</span>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Saldo Iniziale (01/10):</span>
                  <div className="flex items-center gap-1 w-32">
                    <span className="text-xs font-bold text-muted-foreground">€</span>
                    <Input 
                      type="number"
                      step="0.01"
                      disabled={isAnnoChiuso}
                      value={settings[cassaInizialeKey] || ''}
                      onChange={e => handleSaveSaldo(cassaInizialeKey, e.target.value)}
                      placeholder="0.00"
                      className="h-8 text-right font-mono"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-green-700">
                  <span>(+) Entrate Contanti:</span>
                  <span className="font-mono font-semibold">+ € {entrateContanti.toFixed(2)}</span>
                </div>

                <div className="flex items-center justify-between text-red-700 border-b pb-2">
                  <span>(-) Uscite Contanti:</span>
                  <span className="font-mono font-semibold">- € {usciteContanti.toFixed(2)}</span>
                </div>

                <div className="flex items-center justify-between pt-1 font-bold text-base">
                  <span>(=) Saldo Finale Cassa (30/09):</span>
                  <span className="font-mono text-primary">€ {saldoFinaleCassa.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Banca / C/C */}
            <div className="border rounded-xl p-4 space-y-4 bg-muted/10">
              <div className="flex items-center gap-2 font-semibold text-sm border-b pb-2">
                <Building2 className="h-4 w-4 text-blue-600" />
                <span>Banca / Conto Corrente (C/C)</span>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Saldo Iniziale (01/10):</span>
                  <div className="flex items-center gap-1 w-32">
                    <span className="text-xs font-bold text-muted-foreground">€</span>
                    <Input 
                      type="number"
                      step="0.01"
                      disabled={isAnnoChiuso}
                      value={settings[bancaInizialeKey] || ''}
                      onChange={e => handleSaveSaldo(bancaInizialeKey, e.target.value)}
                      placeholder="0.00"
                      className="h-8 text-right font-mono"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between text-green-700">
                  <span>(+) Entrate Bonifico/Banca:</span>
                  <span className="font-mono font-semibold">+ € {entrateBanca.toFixed(2)}</span>
                </div>

                <div className="flex items-center justify-between text-red-700 border-b pb-2">
                  <span>(-) Uscite Bonifico/Carta:</span>
                  <span className="font-mono font-semibold">- € {usciteBanca.toFixed(2)}</span>
                </div>

                <div className="flex items-center justify-between pt-1 font-bold text-base">
                  <span>(=) Saldo Finale Banca (30/09):</span>
                  <span className="font-mono text-primary">€ {saldoFinaleBanca.toFixed(2)}</span>
                </div>
              </div>
            </div>

          </div>

          {/* Riconciliazione Finale Risultato vs Saldi */}
          <div className="p-4 border rounded-xl bg-accent/10 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 font-bold text-sm">
                <ShieldCheck className={isQuadrato ? "h-5 w-5 text-green-600" : "h-5 w-5 text-amber-600"} />
                <span>Esito Riconciliazione Saldi Anno Scout {selectedAnnoScout}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Saldo Iniziale Complessivo (€ {saldoInizialeTotale.toFixed(2)}) + Risultato d&apos;Esercizio (€ {risultatoEsercizio.toFixed(2)}) = Saldo Finale Complessivo (€ {saldoFinaleTotale.toFixed(2)}).
              </p>
            </div>

            <div className="flex items-center gap-3">
              {isQuadrato ? (
                <Badge className="bg-green-600 text-white text-sm py-1 px-3">
                  <Check className="h-4 w-4 mr-1" /> BILANCIO QUADRATO A ZERO
                </Badge>
              ) : (
                <Badge variant="destructive" className="text-sm py-1 px-3">
                  ⚠️ DISCREPANZA: € {differenzaQuadratura.toFixed(2)}
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
