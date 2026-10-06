'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Database } from '@/types/database.types'
import { FileText, Download, FileSpreadsheet } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { normalizeAnnoScout, toCanonicalMetodo } from '@/lib/utils/payment'

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
  rawCassa,
  quote,
  currentYear
}: {
  ragazzi: Ragazzo[]
  eventi: Evento[]
  partecipazioni: Partecipazione[]
  cassa: Spesa[]
  rawCassa: Spesa[]
  quote: Quota[]
  currentYear: string
}) {
  const [selectedRagazzo, setSelectedRagazzo] = useState<string>('')
  const router = useRouter()
  useEffect(() => {
    const supabase = createClient()
    const refresh = () => router.refresh()
    const channel = supabase.channel('report_accounting_settings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'impostazioni' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registro_spese' }, refresh)
      .subscribe()
    window.addEventListener('focus', refresh)
    return () => { window.removeEventListener('focus', refresh); supabase.removeChannel(channel) }
  }, [router])

  const exportBilancio = () => {
    const doc = new jsPDF()
    
    doc.setFontSize(18)
    doc.text('Bilancio Consuntivo di Reparto', 14, 22)
    doc.setFontSize(11)
    doc.text(`Generato il ${new Date().toLocaleDateString('it-IT')}`, 14, 30)

    const signedAmount = (movimento: Spesa) => movimento.tipo_movimento === 'ENTRATA' ? movimento.importo : -movimento.importo
    const cassaContanti = cassa.filter(movimento => toCanonicalMetodo(movimento.metodo) === 'Contanti')
    const cassaBanca = cassa.filter(movimento => toCanonicalMetodo(movimento.metodo) !== 'Contanti')

    const totaleContanti = cassaContanti.reduce((totale, movimento) => totale + signedAmount(movimento), 0)
    const totaleBanca = cassaBanca.reduce((totale, movimento) => totale + signedAmount(movimento), 0)

    autoTable(doc, {
      startY: 40,
      head: [['Operazione N.', 'Data', 'Tipo', 'Voce', 'Note', 'Importo', 'Metodo']],
      body: cassa.map(c => [
        c.numero_operazione?.toString() || '-',
        c.data ? new Date(c.data).toLocaleDateString('it-IT') : '',
        c.tipo_movimento || '',
        c.voce_spesa || '',
        c.note || '',
        `${c.tipo_movimento === 'ENTRATA' ? '+' : '-'} € ${c.importo.toFixed(2)}`,
        c.metodo || ''
      ]),
      foot: [['', '', '', '', 'Saldo movimenti contanti:', `€ ${totaleContanti.toFixed(2)}`, '']],
      theme: 'grid',
      headStyles: { fillColor: [41, 128, 185] },
    })

    const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY || 40
    doc.text(`Saldo Totale Banca/Carta: € ${totaleBanca.toFixed(2)}`, 14, finalY + 15)

    doc.save(`prima_nota_reparto_${currentYear}.pdf`)
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
    const quoteRagazzo = quote.find(q => q.ragazzo_id === r.id && normalizeAnnoScout(q.anno_scout) === normalizeAnnoScout(currentYear))

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

  const rawMovementRows = () => rawCassa.map(m => ({ ...m, fuori_bilancio: !!m.anticipo_capi_id }))
  const exportRawCSV = () => {
    const csv = XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rawMovementRows()), { FS: ';' })
    const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `movimenti_completi_${currentYear}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const exportExcel = () => {
    const wb = XLSX.utils.book_new()
    
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ragazzi), 'Ragazzi')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rawMovementRows()), 'Cassa')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(quote), 'Quote')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(eventi), 'Eventi')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(partecipazioni), 'Partecipazioni')

    XLSX.writeFile(wb, 'backup_scoutmaster.xlsx')
  }

  return (
    <div className="w-full max-w-7xl mx-auto space-y-4 md:space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold tracking-tight">Reportistica ed Esportazioni</h1>
      </div>

      <div className="grid gap-3 md:gap-6 md:grid-cols-2 lg:grid-cols-3">
        
        {/* Raccordo Bilancio AGESCI */}
        <div className="rounded-xl border border-green-200 bg-green-50/20 p-3 md:p-6 shadow-sm grid grid-cols-[minmax(0,1fr)_7rem] items-start gap-3 md:flex md:flex-col md:justify-between md:space-y-4">
          <div className="row-span-2 min-w-0 space-y-1 md:space-y-2">
            <div className="float-left mr-2 h-7 w-7 rounded-lg bg-green-100 flex items-center justify-center text-green-700 md:float-none md:mr-0 md:mb-4 md:h-12 md:w-12 md:rounded-full">
              <FileSpreadsheet className="h-4 w-4 md:h-6 md:w-6" />
            </div>
            <h3 className="text-sm md:text-xl font-bold text-green-900">Raccordo Bilancio AGESCI</h3>
            <p className="clear-both pt-1 text-xs md:text-sm text-green-800">
              Totali AGESCI, copia rapida e riconciliazione di cassa e banca.
            </p>
          </div>
          <a 
            href="/report/bilancio-agesci"
            className="w-full bg-green-700 text-white hover:bg-green-800 min-h-11 h-auto md:h-10 px-2 md:px-4 py-2 rounded-md text-xs md:text-sm text-center font-medium transition-colors flex items-center justify-center gap-2"
          >
            <FileSpreadsheet className="h-4 w-4" /> Apri Raccordo AGESCI
          </a>
        </div>

        {/* Bilancio Generale */}
        <div className="rounded-xl border bg-card p-3 md:p-6 shadow-sm grid grid-cols-[minmax(0,1fr)_7rem] items-start gap-3 md:flex md:flex-col md:justify-between md:space-y-4">
          <div className="row-span-2 min-w-0 space-y-1 md:space-y-2">
            <div className="float-left mr-2 h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center md:float-none md:mr-0 md:mb-4 md:h-12 md:w-12 md:rounded-full">
              <FileText className="h-4 w-4 md:h-6 md:w-6 text-primary" />
            </div>
            <h3 className="text-sm md:text-xl font-bold">Bilancio Consuntivo</h3>
            <p className="clear-both pt-1 text-xs md:text-sm text-muted-foreground">
              PDF di movimenti e saldi per il Consiglio di Gruppo.
            </p>
          </div>
          <button 
            onClick={exportBilancio}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 min-h-11 h-auto md:h-10 px-2 md:px-4 py-2 rounded-md text-xs md:text-sm text-center font-medium transition-colors flex items-center justify-center gap-2"
          >
            <Download className="h-4 w-4" /> Esporta PDF
          </button>
        </div>

        {/* Estratto Conto Ragazzo */}
        <div className="rounded-xl border bg-card p-3 md:p-6 shadow-sm grid grid-cols-[minmax(0,1fr)_7rem] items-start gap-3 md:flex md:flex-col md:justify-between md:space-y-4">
          <div className="row-span-2 min-w-0 space-y-1 md:space-y-2">
            <div className="float-left mr-2 h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center md:float-none md:mr-0 md:mb-4 md:h-12 md:w-12 md:rounded-full">
              <FileSpreadsheet className="h-4 w-4 md:h-6 md:w-6 text-primary" />
            </div>
            <h3 className="text-sm md:text-xl font-bold">Estratto Conto Esploratore</h3>
            <p className="clear-both pt-1 text-xs md:text-sm text-muted-foreground">
              PDF con quote e uscite del ragazzo selezionato.
            </p>
            
            <div className="pt-2">
              <select 
                className="w-full min-h-11 border rounded-md p-2 text-base md:text-sm bg-background"
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
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 min-h-11 h-auto md:h-10 px-2 md:px-4 py-2 rounded-md text-xs md:text-sm text-center font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> Scarica Scheda PDF
          </button>
        </div>

        {/* Backup Completo */}
        <div className="rounded-xl border bg-card p-3 md:p-6 shadow-sm grid grid-cols-[minmax(0,1fr)_7rem] items-start gap-3 md:flex md:flex-col md:justify-between md:space-y-4">
          <div className="row-span-2 min-w-0 space-y-1 md:space-y-2">
            <div className="float-left mr-2 h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center md:float-none md:mr-0 md:mb-4 md:h-12 md:w-12 md:rounded-full">
              <FileSpreadsheet className="h-4 w-4 md:h-6 md:w-6 text-primary" />
            </div>
            <h3 className="text-sm md:text-xl font-bold">Backup Database</h3>
            <p className="clear-both pt-1 text-xs md:text-sm text-muted-foreground">
              Excel completo: ragazzi, movimenti, quote, eventi e partecipazioni.
            </p>
          </div>
          <button 
            onClick={exportExcel}
            className="w-full bg-green-600 text-white hover:bg-green-700 min-h-11 h-auto md:h-10 px-2 md:px-4 py-2 rounded-md text-xs md:text-sm text-center font-medium transition-colors flex items-center justify-center gap-2"
          >
            <Download className="h-4 w-4" /> Esporta XLSX
          </button>
          <button onClick={exportRawCSV} className="w-full min-h-11 rounded-md border px-2 md:px-4 py-2 text-xs md:text-sm text-center font-medium">Esporta movimenti completi CSV</button>
        </div>

      </div>
    </div>
  )
}
