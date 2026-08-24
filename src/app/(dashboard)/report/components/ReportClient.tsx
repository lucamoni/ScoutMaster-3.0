'use client'

import { useState } from 'react'
import { Database } from '@/types/database.types'
import { FileText, Download, FileSpreadsheet } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

type Ragazzo = Database['public']['Tables']['ragazzi']['Row']
type Evento = Database['public']['Tables']['eventi']['Row']
type Partecipazione = Database['public']['Tables']['partecipazioni_eventi']['Row']
type Spesa = Database['public']['Tables']['registro_spese']['Row']
type Quota = Database['public']['Tables']['quote_mensili']['Row']

export function ReportClient({
  ragazzi,
  eventi,
  partecipazioni,
  cassa,
  quote
}: {
  ragazzi: Ragazzo[]
  eventi: Evento[]
  partecipazioni: Partecipazione[]
  cassa: Spesa[]
  quote: Quota[]
}) {
  const [selectedRagazzo, setSelectedRagazzo] = useState<string>('')

  const exportBilancio = () => {
    const doc = new jsPDF()
    
    doc.setFontSize(18)
    doc.text('Bilancio Consuntivo di Reparto', 14, 22)
    doc.setFontSize(11)
    doc.text(`Generato il ${new Date().toLocaleDateString('it-IT')}`, 14, 30)

    const cassaContanti = cassa.filter(c => c.metodo === 'CONTANTI')
    const cassaBanca = cassa.filter(c => c.metodo === 'CARTA' || c.metodo === 'BONIFICO')

    const totaleContanti = cassaContanti.reduce((acc, c) => acc + c.importo, 0)
    const totaleBanca = cassaBanca.reduce((acc, c) => acc + c.importo, 0)

    autoTable(doc, {
      startY: 40,
      head: [['Operazione N.', 'Data', 'Voce', 'Note', 'Importo', 'Metodo']],
      body: cassa.map(c => [
        c.numero_operazione?.toString() || '-',
        c.data ? new Date(c.data).toLocaleDateString('it-IT') : '',
        c.voce_spesa || '',
        c.note || '',
        `€ ${c.importo.toFixed(2)}`,
        c.metodo || ''
      ]),
      foot: [['', '', '', 'Saldo Contanti:', `€ ${totaleContanti.toFixed(2)}`, '']],
      theme: 'grid',
      headStyles: { fillColor: [41, 128, 185] },
    })

    const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY || 40
    doc.text(`Saldo Totale Banca/Carta: € ${totaleBanca.toFixed(2)}`, 14, finalY + 15)

    doc.save('bilancio_reparto.pdf')
  }

  const exportSchedaRagazzo = () => {
    if (!selectedRagazzo) return
    const r = ragazzi.find(x => x.id === selectedRagazzo)
    if (!r) return

    const doc = new jsPDF()
    doc.setFontSize(18)
    doc.text(`Scheda Estratto Conto: ${r.nome} ${r.cognome}`, 14, 22)
    doc.setFontSize(11)
    doc.text(`Pattuglia: ${r.pattuglia || '-'}`, 14, 30)

    const partRagazzo = partecipazioni.filter(p => p.ragazzo_id === r.id)
    const quoteRagazzo = quote.find(q => q.ragazzo_id === r.id)

    // Eventi
    doc.text('Storico Uscite ed Eventi', 14, 45)
    autoTable(doc, {
      startY: 50,
      head: [['Evento', 'Data', 'Quota', 'Stato', 'Riscosso']],
      body: partRagazzo.map(p => {
        const ev = eventi.find(e => e.id === p.evento_id)
        return [
          ev?.nome_evento || 'Sconosciuto',
          ev?.data_inizio ? new Date(ev.data_inizio).toLocaleDateString('it-IT') : '',
          `€ ${p.quota_dovuta || 0}`,
          p.stato_presenza || '',
          p.riscosso ? 'SI' : 'NO'
        ]
      }),
      theme: 'grid'
    })

    // Quote mensili
    const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY || 50
    doc.text('Quote Mensili', 14, finalY + 15)
    
    const mesi = ['novembre', 'dicembre', 'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno'] as const
    const quoteData = mesi.map(m => [m.toUpperCase(), quoteRagazzo?.[m] ? 'PAGATO' : 'DA PAGARE'])

    autoTable(doc, {
      startY: finalY + 20,
      head: [['Mese', 'Stato']],
      body: quoteData,
      theme: 'grid'
    })

    doc.save(`estratto_conto_${r.cognome}_${r.nome}.pdf`)
  }

  const exportExcel = () => {
    const wb = XLSX.utils.book_new()
    
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ragazzi), 'Ragazzi')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cassa), 'Cassa')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(quote), 'Quote')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(eventi), 'Eventi')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(partecipazioni), 'Partecipazioni')

    XLSX.writeFile(wb, 'backup_scoutmaster.xlsx')
  }

  return (
    <div className="p-4 md:p-6 w-full max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Reportistica ed Esportazioni</h1>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        
        {/* Raccordo Bilancio AGESCI */}
        <div className="rounded-xl border border-green-200 bg-green-50/20 p-6 shadow-sm flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center mb-4 text-green-700">
              <FileSpreadsheet className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-bold text-green-900">Raccordo Bilancio AGESCI</h3>
            <p className="text-sm text-green-800">
              Modulo ufficiale per bilancio.agesci.it. Totali aggregati per il Piano dei Conti AGESCI, pulsanti Copia Rapida e Riconciliazione Cassa/Banca.
            </p>
          </div>
          <a 
            href="/report/bilancio-agesci"
            className="w-full bg-green-700 text-white hover:bg-green-800 h-10 px-4 py-2 rounded-md font-medium transition-colors flex items-center justify-center gap-2"
          >
            <FileSpreadsheet className="h-4 w-4" /> Apri Raccordo AGESCI
          </a>
        </div>

        {/* Bilancio Generale */}
        <div className="rounded-xl border bg-card p-6 shadow-sm flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-xl font-bold">Bilancio Consuntivo</h3>
            <p className="text-sm text-muted-foreground">
              Genera il documento formattato con tutte le spese, entrate e i saldi di cassa per il Consiglio di Gruppo.
            </p>
          </div>
          <button 
            onClick={exportBilancio}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 rounded-md font-medium transition-colors flex items-center justify-center gap-2"
          >
            <Download className="h-4 w-4" /> Esporta PDF
          </button>
        </div>

        {/* Estratto Conto Ragazzo */}
        <div className="rounded-xl border bg-card p-6 shadow-sm flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <FileSpreadsheet className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-xl font-bold">Estratto Conto Esploratore</h3>
            <p className="text-sm text-muted-foreground">
              Genera la scheda PDF individuale per un singolo ragazzo con lo stato di tutte le quote e uscite.
            </p>
            
            <div className="pt-2">
              <select 
                className="w-full border rounded-md p-2 text-sm bg-background"
                value={selectedRagazzo}
                onChange={(e) => setSelectedRagazzo(e.target.value)}
              >
                <option value="">Seleziona un ragazzo...</option>
                {ragazzi.map(r => (
                  <option key={r.id} value={r.id}>{r.nome} {r.cognome}</option>
                ))}
              </select>
            </div>
          </div>
          
          <button 
            onClick={exportSchedaRagazzo}
            disabled={!selectedRagazzo}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 rounded-md font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> Scarica Scheda PDF
          </button>
        </div>

        {/* Backup Completo */}
        <div className="rounded-xl border bg-card p-6 shadow-sm flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <FileSpreadsheet className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-xl font-bold">Backup Database</h3>
            <p className="text-sm text-muted-foreground">
              Esporta l&apos;intero database in un unico foglio di calcolo Excel con schede multiple (Raw Data).
            </p>
          </div>
          <button 
            onClick={exportExcel}
            className="w-full bg-green-600 text-white hover:bg-green-700 h-10 px-4 py-2 rounded-md font-medium transition-colors flex items-center justify-center gap-2"
          >
            <Download className="h-4 w-4" /> Esporta XLSX
          </button>
        </div>

      </div>
    </div>
  )
}
