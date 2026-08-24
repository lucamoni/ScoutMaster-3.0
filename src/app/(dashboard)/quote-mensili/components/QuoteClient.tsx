'use client'

import { useState } from 'react'
import { Database } from '@/types/database.types'
import { createBrowserClient } from '@supabase/ssr'
import { normalizeAnnoScout } from '@/lib/utils/payment'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Save, CheckCheck, XCircle, CheckCircle2, Search } from 'lucide-react'
import { cn } from '@/lib/utils'

type Ragazzo = Database['public']['Tables']['ragazzi']['Row']
type Quote = Database['public']['Tables']['quote_mensili']['Row']

const MONTHS: (keyof Quote)[] = [
  'novembre', 'dicembre', 'gennaio', 'febbraio', 
  'marzo', 'aprile', 'maggio', 'giugno'
]

export default function QuoteClient({ 
  ragazzi, 
  initialQuote,
  currentYear,
  initialQuotaStandard
}: { 
  ragazzi: Ragazzo[],
  initialQuote: Quote[],
  currentYear: string,
  initialQuotaStandard: number
}) {
  const [quote, setQuote] = useState<Quote[]>(initialQuote)
  const [quotaStandard, setQuotaStandard] = useState(initialQuotaStandard.toString())
  const [isSavingQuota, setIsSavingQuota] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [isBulkLoading, setIsBulkLoading] = useState(false)
  
  const supabase = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const ragazziFiltrati = ragazzi.filter(r => {
    const full = `${r.nome || ''} ${r.cognome || ''}`.toLowerCase()
    return full.includes(searchTerm.toLowerCase())
  })

  const updateQuota = async (ragazzoId: string, month: keyof Quote, value: boolean) => {
    const normYear = normalizeAnnoScout(currentYear)
    setQuote((prev) => 
      prev.map(q => (q.ragazzo_id === ragazzoId && normalizeAnnoScout(q.anno_scout) === normYear) ? { ...q, [month]: value } : q)
    )

    const { data: quoteData, error } = await supabase
      .from('quote_mensili')
      .upsert({ ragazzo_id: ragazzoId, anno_scout: normYear, [month]: value } as unknown as Database['public']['Tables']['quote_mensili']['Insert'], { onConflict: 'ragazzo_id,anno_scout' })
      .select('id').single()

    if (error) {
      console.error('Errore durante l\'aggiornamento:', error)
      alert("Errore salvataggio quota: " + error.message)
      return
    }

    if (value && quoteData) {
      const ragazzo = ragazzi.find(r => r.id === ragazzoId)
      const { data: existingReg } = await supabase.from('registro_spese').select('id')
        .eq('quota_mensile_id', quoteData.id)
        .eq('riferimento_quota', month as string)
      
      if (!existingReg || existingReg.length === 0) {
        const { error: errIns } = await supabase.from('registro_spese').insert({
          importo: Number(quotaStandard),
          metodo: 'Contanti',
          voce_spesa: 'Quota Mensile',
          tipo_movimento: 'ENTRATA',
          data: new Date().toISOString().split('T')[0],
          ragazzo_id: ragazzoId,
          quota_mensile_id: quoteData.id,
          riferimento_quota: month as string,
          note: `Quota ${String(month).substring(0,3).toUpperCase()} - ${ragazzo?.nome} ${ragazzo?.cognome}`
        })
        if (errIns) console.error("Errore inserimento in cassa:", errIns)
      }
    } else if (!value && quoteData) {
      const { error: errDel } = await supabase.from('registro_spese').delete()
        .eq('quota_mensile_id', quoteData.id)
        .eq('riferimento_quota', month as string)
      if (errDel) console.error("Errore cancellazione da cassa:", errDel)
    }
  }

  // --- AZIONI IN AGGREGATO (BULK ACTIONS) ---

  const bulkUpdateQuote = async (targetRagazziIds: string[], targetMonths: (keyof Quote)[], value: boolean) => {
    setIsBulkLoading(true)

    setQuote(prev => prev.map(q => {
      if (q.ragazzo_id && targetRagazziIds.includes(q.ragazzo_id)) {
        const updated = { ...q }
        targetMonths.forEach(m => { (updated as Record<string, unknown>)[m as string] = value })
        return updated as Quote
      }
      return q
    }))

    const normYear = normalizeAnnoScout(currentYear)
    for (const rId of targetRagazziIds) {
      const payload: Record<string, unknown> = { ragazzo_id: rId, anno_scout: normYear }
      targetMonths.forEach(m => { payload[m as string] = value })

      const { data: quoteData } = await supabase
        .from('quote_mensili')
        .upsert(payload as Database['public']['Tables']['quote_mensili']['Insert'], { onConflict: 'ragazzo_id,anno_scout' })
        .select('id').single()

      if (quoteData) {
        for (const month of targetMonths) {
          if (value) {
            const ragazzo = ragazzi.find(r => r.id === rId)
            const { data: existingReg } = await supabase.from('registro_spese').select('id')
              .eq('quota_mensile_id', quoteData.id)
              .eq('riferimento_quota', month as string)
            
            if (!existingReg || existingReg.length === 0) {
              await supabase.from('registro_spese').insert({
                importo: Number(quotaStandard),
                metodo: 'Contanti',
                voce_spesa: 'Quota Mensile',
                tipo_movimento: 'ENTRATA',
                data: new Date().toISOString().split('T')[0],
                ragazzo_id: rId,
                quota_mensile_id: quoteData.id,
                riferimento_quota: month as string,
                note: `Quota ${String(month).substring(0,3).toUpperCase()} - ${ragazzo?.nome} ${ragazzo?.cognome}`
              })
            }
          } else {
            await supabase.from('registro_spese').delete()
              .eq('quota_mensile_id', quoteData.id)
              .eq('riferimento_quota', month as string)
          }
        }
      }
    }

    setIsBulkLoading(false)
  }

  const handleGlobalSelectAll = (val: boolean) => {
    const ids = ragazziFiltrati.map(r => r.id)
    bulkUpdateQuote(ids, MONTHS, val)
  }

  const handleMonthSelectAll = (month: keyof Quote, val: boolean) => {
    const ids = ragazziFiltrati.map(r => r.id)
    bulkUpdateQuote(ids, [month], val)
  }

  const handleRagazzoSelectAll = (ragazzoId: string, val: boolean) => {
    bulkUpdateQuote([ragazzoId], MONTHS, val)
  }

  const saveQuotaStandard = async () => {
    setIsSavingQuota(true)
    const { error } = await supabase.from('impostazioni').upsert({ chiave: 'quota_mensile_standard', valore: quotaStandard } as Database['public']['Tables']['impostazioni']['Insert'])
    if (error) alert("Errore salvataggio: " + error.message)
    setIsSavingQuota(false)
  }

  return (
    <div className="space-y-6">
      {/* Barra di Configurazione e Pulsanti di Selezione Globale */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Label className="text-xs font-semibold text-slate-700">Quota Singola (€):</Label>
            <Input 
              type="number" 
              value={quotaStandard} 
              onChange={(e) => setQuotaStandard(e.target.value)} 
              className="w-20 h-8 text-xs bg-slate-50 border-slate-200 font-bold tabular-nums" 
            />
          </div>
          <Button size="sm" onClick={saveQuotaStandard} disabled={isSavingQuota} className="h-8 text-xs bg-agesci-blue hover:bg-agesci-blue-light text-white font-medium rounded-xl">
            <Save className="h-3.5 w-3.5 mr-1" /> Salva
          </Button>
        </div>

        {/* Ricerca ed Azioni in Aggregato */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <Input 
              placeholder="Cerca esploratore..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
              className="h-8 text-xs pl-8 w-44 bg-slate-50 border-slate-200 rounded-xl"
            />
          </div>
          
          <Button 
            size="sm" 
            variant="outline" 
            onClick={() => handleGlobalSelectAll(true)} 
            disabled={isBulkLoading}
            className="h-8 text-xs bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200 rounded-xl font-medium"
          >
            <CheckCheck className="h-3.5 w-3.5 mr-1" /> Seleziona Tutti
          </Button>

          <Button 
            size="sm" 
            variant="outline" 
            onClick={() => handleGlobalSelectAll(false)} 
            disabled={isBulkLoading}
            className="h-8 text-xs bg-rose-50 text-rose-700 hover:bg-rose-100 border-rose-200 rounded-xl font-medium"
          >
            <XCircle className="h-3.5 w-3.5 mr-1" /> Deseleziona Tutti
          </Button>
        </div>
      </div>
      
      {/* Vista Desktop */}
      <div className="hidden md:block rounded-2xl border border-slate-200/80 bg-white overflow-x-auto shadow-2xs">
        <Table className="text-xs">
          <TableHeader className="bg-slate-50 border-b border-slate-200/80 sticky top-0 z-10">
            <TableRow className="h-10">
              <TableHead className="py-2 px-3 border-r border-slate-200/80 font-bold text-slate-600 uppercase tracking-wider text-[11px] min-w-[170px]">Esploratore</TableHead>
              {MONTHS.map(m => {
                const isAllPaidForMonth = ragazziFiltrati.length > 0 && ragazziFiltrati.every(r => {
                  const normYear = normalizeAnnoScout(currentYear)
                  return quote.some(item => item.ragazzo_id === r.id && normalizeAnnoScout(item.anno_scout) === normYear && item[m] === true)
                })

                return (
                  <TableHead key={m} className="text-center border-r border-slate-200/80 px-1 py-1 w-16">
                    <div className="flex flex-col items-center justify-center gap-0.5">
                      <span className="capitalize font-bold text-slate-800 text-[11px]">{String(m).substring(0, 3)}</span>
                      <button
                        type="button"
                        onClick={() => handleMonthSelectAll(m, !isAllPaidForMonth)}
                        title={isAllPaidForMonth ? `Deseleziona tutti per ${m}` : `Seleziona tutti per ${m}`}
                        className="text-[9px] text-agesci-blue hover:text-agesci-blue-light font-semibold px-1 py-0.5 rounded hover:bg-slate-100 transition-colors"
                      >
                        {isAllPaidForMonth ? '✓ Tutti' : 'Toggle'}
                      </button>
                    </div>
                  </TableHead>
                )
              })}
              <TableHead className="text-center px-3 py-2 w-28 font-bold text-slate-600 uppercase tracking-wider text-[11px]">Debito (€)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-slate-100">
            {ragazziFiltrati.map((ragazzo, idx) => {
              const normYear = normalizeAnnoScout(currentYear)
              const boyQuotes = quote.filter(q => q.ragazzo_id === ragazzo.id && normalizeAnnoScout(q.anno_scout) === normYear)
              const isMonthPaid = (m: keyof Quote) => boyQuotes.some(bq => bq[m] === true)
              
              const unpaidCount = MONTHS.filter(m => !isMonthPaid(m)).length
              const isAllRagazzoPaid = MONTHS.every(m => isMonthPaid(m))

              return (
                <TableRow key={ragazzo.id} className={cn("h-10 hover:bg-blue-50/40 transition-colors", idx % 2 === 0 ? "bg-white" : "bg-slate-50/40")}>
                  <TableCell className="font-semibold text-slate-900 border-r border-slate-200/80 px-3 py-1">
                    <div className="flex items-center justify-between">
                      <span className="truncate max-w-[140px] font-semibold">{ragazzo.nome} {ragazzo.cognome}</span>
                      <div className="flex items-center gap-1 opacity-75 hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => handleRagazzoSelectAll(ragazzo.id, !isAllRagazzoPaid)}
                          title={isAllRagazzoPaid ? "Deseleziona tutti i mesi per questo ragazzo" : "Segna tutti i mesi pagati"}
                          className="p-1 hover:bg-slate-100 rounded text-[10px] text-agesci-blue flex items-center gap-0.5"
                        >
                          {isAllRagazzoPaid ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <span className="border border-slate-200 text-[9px] px-1.5 py-0.5 rounded font-semibold hover:bg-agesci-blue hover:text-white transition-colors">Tutti</span>
                          )}
                        </button>
                      </div>
                    </div>
                  </TableCell>
                  {MONTHS.map(m => (
                    <TableCell key={m} className="text-center border-r border-slate-200/80 px-0 py-0 h-10 align-middle">
                      <div className="flex items-center justify-center h-full w-full">
                        <Checkbox
                          checked={isMonthPaid(m)}
                          onCheckedChange={(checked) => updateQuota(ragazzo.id, m, checked === true)}
                          className="h-4 w-4 touch-min"
                        />
                      </div>
                    </TableCell>
                  ))}
                  <TableCell className="text-center px-2 py-0 font-bold tabular-nums">
                    <span className={`font-bold text-xs ${unpaidCount > 0 ? 'text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200' : 'text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200'}`}>
                      {unpaidCount > 0 ? `-${unpaidCount * Number(quotaStandard)}€` : 'In Regola'}
                    </span>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Vista Mobile */}
      <div className="md:hidden space-y-3">
        {ragazziFiltrati.map((ragazzo) => {
          const normYear = normalizeAnnoScout(currentYear)
          const boyQuotes = quote.filter(q => q.ragazzo_id === ragazzo.id && normalizeAnnoScout(q.anno_scout) === normYear)
          const isMonthPaid = (m: keyof Quote) => boyQuotes.some(bq => bq[m] === true)

          const unpaidCount = MONTHS.filter(m => !isMonthPaid(m)).length
          const isAllRagazzoPaid = MONTHS.every(m => isMonthPaid(m))

          return (
            <div key={ragazzo.id} className="rounded-2xl border border-slate-200/80 p-4 bg-white shadow-2xs space-y-3">
              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                <div>
                  <span className="font-heading font-bold text-slate-900 block text-sm">{ragazzo.nome} {ragazzo.cognome}</span>
                  <span className={`text-xs font-bold tabular-nums ${unpaidCount > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                    {unpaidCount > 0 ? `Debito Residuo: €${unpaidCount * Number(quotaStandard)}` : '✓ Quote In Regola'}
                  </span>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleRagazzoSelectAll(ragazzo.id, !isAllRagazzoPaid)}
                  className="h-8 text-[10px] px-2.5 rounded-xl border-slate-200 text-agesci-blue font-semibold hover:bg-sky-50 touch-min"
                >
                  {isAllRagazzoPaid ? 'Deseleziona' : 'Paga Tutti i Mesi'}
                </Button>
              </div>

              <div className="grid grid-cols-4 gap-2 pt-1">
                {MONTHS.map(m => (
                  <div key={m} className="flex flex-col items-center gap-1.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200/80">
                    <span className="text-[10px] font-bold text-slate-600 capitalize">{String(m).substring(0, 3)}</span>
                    <Checkbox
                      checked={isMonthPaid(m)}
                      onCheckedChange={(checked) => updateQuota(ragazzo.id, m, checked === true)}
                      className="h-4 w-4 touch-min"
                    />
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
