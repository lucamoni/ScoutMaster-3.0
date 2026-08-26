'use client'

import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { 
  FileText, 
  Download, 
  Printer, 
  ShieldCheck, 
  HeartPulse, 
  FileCheck, 
  FileSpreadsheet, 
  Compass, 
  Search, 
  CheckCircle2, 
  ExternalLink,
  Sparkles
} from 'lucide-react'
import { toast } from 'sonner'
import jsPDF from 'jspdf'

interface Modello {
  id: string
  titolo: string
  categoria: 'Privacy' | 'Sanità' | 'Amministrazione' | 'Attività & Uscite'
  descrizione: string
  formato: 'PDF' | 'DOCX'
  obbligatorio: boolean
  generatePdf: () => void
}

export function ModelliVuotiClient() {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('Tutti')

  // Generatore di PDF per Modelli Vuoti Ufficiali AGESCI
  const generateBlankPrivacyPdf = () => {
    const doc = new jsPDF()
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text('AGESCI - MODULO DI CONSENSO PRIVACY (GDPR 2016/679)', 20, 20)
    
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text('Gruppo Scout AGESCI ___________________________', 20, 30)
    doc.text('Reparto ___________________________', 20, 36)

    doc.line(20, 42, 190, 42)

    doc.setFont('helvetica', 'bold')
    doc.text('DATI DELL\'ESPLORATORE / GUIDA:', 20, 50)
    doc.setFont('helvetica', 'normal')
    doc.text('Nome e Cognome: ____________________________________________________', 20, 58)
    doc.text('Data e Luogo di Nascita: _______________________ Codice Fiscale: ________________', 20, 66)

    doc.setFont('helvetica', 'bold')
    doc.text('DATI DEI GENITORI / TUTORI LEGALI:', 20, 78)
    doc.setFont('helvetica', 'normal')
    doc.text('Genitore 1 (Nome e Cognome): ____________________________ Tel: _________________', 20, 86)
    doc.text('Genitore 2 (Nome e Cognome): ____________________________ Tel: _________________', 20, 94)
    doc.text('Indirizzo di Residenza: ___________________________________ Email: _________________', 20, 102)

    doc.setFont('helvetica', 'bold')
    doc.text('DICHIARAZIONE DI CONSENSO AL TRATTAMENTO DEI DATI:', 20, 114)
    doc.setFont('helvetica', 'normal')
    const privacyText = `I sottoscritti genitori/esercenti la responsabilità genitoriale autorizzano il Gruppo Scout AGESCI al trattamento dei dati personali ed alle riprese fotografiche/video effettuate durante le attività scout al solo fine educativo e di gestione associativa.`
    doc.text(doc.splitTextToSize(privacyText, 170), 20, 122)

    doc.text('[  ] ACCONSENTO alle foto e video promozionali delle attività scout', 25, 140)
    doc.text('[  ] ACCONSENTO al trattamento dei dati sanitari per le uscite ed i campi', 25, 148)

    doc.text('Data: ____ / ____ / ________', 20, 170)
    doc.text('Firma Genitore 1: ______________________  Firma Genitore 2: ______________________', 20, 180)

    doc.save('AGESCI_Modulo_Privacy_Vuoto.pdf')
    toast.success('Modulo Privacy AGESCI generato e scaricato!')
  }

  const generateBlankSchedaMedicaPdf = () => {
    const doc = new jsPDF()
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text('AGESCI - SCHEDA SANITARIA E MEDICA PER CAMPI ED USCITE', 20, 20)
    
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text('Ragazzo/a: ___________________________________________ Data Nascita: ____________', 20, 32)
    doc.text('Gruppo Scout: _______________________ Pattuglia: _______________________________', 20, 40)

    doc.line(20, 46, 190, 46)

    doc.setFont('helvetica', 'bold')
    doc.text('INFORMAZIONI MEDICHE ED ALLERGIE:', 20, 54)
    doc.setFont('helvetica', 'normal')
    doc.text('Gruppo Sanguigno: _______  Tessera Sanitaria / ASL: _______________________________', 20, 62)
    doc.text('Allergie Alimentari / Intolleranze: ________________________________________________', 20, 70)
    doc.text('Allergie a Farmaci / Insetti: ______________________________________________________', 20, 78)
    doc.text('Terapie o Farmaci in corso: _______________________________________________________', 20, 86)
    doc.text('Patologie o Note Sanitarie Particolari: ______________________________________________', 20, 94)

    doc.setFont('helvetica', 'bold')
    doc.text('RECAPITI D\'EMERGENZA:', 20, 108)
    doc.setFont('helvetica', 'normal')
    doc.text('Medico Curante: ________________________________________ Tel: ___________________', 20, 116)
    doc.text('Contatto Genitore 1: _____________________________________ Tel: ___________________', 20, 124)
    doc.text('Contatto Genitore 2: _____________________________________ Tel: ___________________', 20, 132)

    doc.text('Data: ____ / ____ / ________', 20, 160)
    doc.text('Firma Genitore: ________________________________________', 20, 170)

    doc.save('AGESCI_Scheda_Medica_Vuota.pdf')
    toast.success('Scheda Medica AGESCI generata e scaricata!')
  }

  const generateBlankRicevutaQuotaPdf = () => {
    const doc = new jsPDF()
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text('RICEVUTA DI VERSAMENTO QUOTA SCOUT', 20, 20)
    
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text('Gruppo Scout AGESCI ___________________________', 20, 32)
    doc.text('Ricevuta N°: _________  Data: ____ / ____ / ________', 20, 40)

    doc.line(20, 46, 190, 46)

    doc.text('Si dichiara di aver ricevuto da: ____________________________________________________', 20, 56)
    doc.text('Per conto dell\'esploratore/guida: ___________________________________________________', 20, 64)
    doc.text('La somma di € ____________ (Euro: ____________________________________________)', 20, 72)
    doc.text('Causale: [  ] Quota Censimento  [  ] Quota Mensile  [  ] Quota Uscita / Campo', 20, 80)

    doc.text('Firma del Capo Reparto / Cassiere: ______________________________________________', 20, 110)

    doc.save('AGESCI_Ricevuta_Quota_Vuota.pdf')
    toast.success('Ricevuta di Versamento generata!')
  }

  const generateBlankAutorizzazioneUscitaPdf = () => {
    const doc = new jsPDF()
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text('AGESCI - AUTORIZZAZIONE GENITORI PER USCITA / CAMPO', 20, 20)

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text('I sottoscritti genitori dell\'esploratore/guida: _______________________________________', 20, 32)
    doc.text('AUTORIZZANO il/la proprio/a figlio/a a partecipare all\'attività:', 20, 40)
    doc.text('Nome Attività / Uscita: __________________________________________________________', 20, 48)
    doc.text('Luogo dell\'Uscita: _______________________________________________________________', 20, 56)
    doc.text('Dal giorno: ____/____/________ al giorno: ____/____/________', 20, 64)
    doc.text('Quota di Partecipazione: € _________', 20, 72)

    doc.text('Data: ____ / ____ / ________', 20, 96)
    doc.text('Firma del Genitore: _____________________________________________________________', 20, 106)

    doc.save('AGESCI_Autorizzazione_Uscita_Vuota.pdf')
    toast.success('Autorizzazione Uscita generata!')
  }

  const modelli: Modello[] = [
    {
      id: 'privacy',
      titolo: 'Modulo di Consenso Privacy GDPR AGESCI',
      categoria: 'Privacy',
      descrizione: 'Modulo ufficiale AGESCI per l\'autorizzazione al trattamento dei dati ed all\'uso delle immagini per le attività scout.',
      formato: 'PDF',
      obbligatorio: true,
      generatePdf: generateBlankPrivacyPdf
    },
    {
      id: 'scheda_medica',
      titolo: 'Scheda Sanitaria e Medica Minorenni',
      categoria: 'Sanità',
      descrizione: 'Scheda sanitaria riservata per raccogliere intolleranze, allergie, farmaci e contatti d\'emergenza per i campi estivi e invernali.',
      formato: 'PDF',
      obbligatorio: true,
      generatePdf: generateBlankSchedaMedicaPdf
    },
    {
      id: 'ricevuta_cassa',
      titolo: 'Ricevuta di Versamento Quota (Censimento / Cassa)',
      categoria: 'Amministrazione',
      descrizione: 'Ricevuta da stampare e consegnare ai genitori per l\'avvenuto pagamento della quota d\'iscrizione o del campo.',
      formato: 'PDF',
      obbligatorio: false,
      generatePdf: generateBlankRicevutaQuotaPdf
    },
    {
      id: 'autorizzazione_uscita',
      titolo: 'Autorizzazione Genitori per Uscita / Campo',
      categoria: 'Attività & Uscite',
      descrizione: 'Modulo di autorizzazione ed assunzione di responsabilità dei genitori per le uscite di pattuglia o di reparto.',
      formato: 'PDF',
      obbligatorio: true,
      generatePdf: generateBlankAutorizzazioneUscitaPdf
    }
  ]

  const categorie = ['Tutti', 'Privacy', 'Sanità', 'Amministrazione', 'Attività & Uscite']

  const filteredModelli = modelli.filter(m => {
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
            Scarica e stampa i moduli in bianco ufficiali per le iscrizioni, le schede mediche e le uscite del Reparto.
          </p>
        </div>
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
          <Card key={m.id} className="flex flex-col justify-between border-slate-200/90 shadow-2xs hover:shadow-md transition-shadow rounded-xl bg-white">
            <CardHeader className="p-5 pb-3">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="outline" className="bg-sky-50 text-sky-800 border-sky-200 font-semibold text-xs">
                  {m.categoria}
                </Badge>
                {m.obbligatorio && (
                  <Badge variant="destructive" className="text-[10px] uppercase font-bold">
                    Obbligatorio AGESCI
                  </Badge>
                )}
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
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Pronto alla stampa (PDF)
              </div>
              <Button 
                onClick={m.generatePdf}
                size="sm"
                className="bg-agesci-blue hover:bg-agesci-blue-light text-white gap-1.5 font-medium text-xs rounded-xl shadow-2xs"
              >
                <Download className="w-3.5 h-3.5" /> Scarica Modello PDF
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  )
}
