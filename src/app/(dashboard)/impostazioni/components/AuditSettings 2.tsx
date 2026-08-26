'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ShieldCheck, Loader2, CheckCircle2, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

type AuditReport = {
  orfani_ricreati: number
  duplicati_rimossi: number
  totale_movimenti_cassa: number
  saldi: {
    saldo_contanti_effettivo: number
    saldo_banca_effettivo: number
    totale_generale_cassa: number
    dettagli: {
      entrate_contanti: number
      uscite_contanti: number
      entrate_banca: number
      uscite_banca: number
    }
  }
}

export default function AuditSettings() {
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<AuditReport | null>(null)

  const handleRunAudit = async () => {
    setLoading(true)
    toast.loading('Esecuzione audit e riconciliazione dati in corso...', { id: 'audit-run' })

    try {
      const res = await fetch('/api/cassa/audit', { method: 'POST' })
      const data = await res.json()

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Errore durante l\'esecuzione dell\'audit')
      }

      setReport(data.report)
      toast.success(data.message || 'Audit completato con successo!', { id: 'audit-run' })
    } catch (err: unknown) {
      console.error(err)
      const msg = err instanceof Error ? err.message : 'Errore sconosciuto'
      toast.error(`Impossibile completare l'audit: ${msg}`, { id: 'audit-run' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="border-blue-200 dark:border-blue-900 shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          <CardTitle className="text-xl">Audit e Riconciliazione Coerenza Dati</CardTitle>
        </div>
        <CardDescription>
          Verifica l&apos;integrità dei dati tra Quote, Partecipazioni Eventi, Censimenti e Cassa. Ripara entrate orfane, rimuove entrate duplicate e calcola i saldi effettivi.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button 
          onClick={handleRunAudit} 
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 text-white font-medium"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Verifica in corso...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" />
              Verifica e Riconcilia Coerenza Dati
            </>
          )}
        </Button>

        {report && (
          <div className="mt-6 border rounded-lg p-4 bg-blue-50/50 dark:bg-blue-950/20 space-y-4 text-sm">
            <div className="flex items-center gap-2 text-green-700 dark:text-green-400 font-semibold">
              <CheckCircle2 className="h-5 w-5" />
              Riconciliazione Completata con Successo
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-y py-3 my-2">
              <div className="bg-background p-3 rounded border">
                <span className="text-xs text-muted-foreground block">Entrate Orfane Ricreate</span>
                <span className="text-xl font-bold text-blue-600">{report.orfani_ricreati}</span>
              </div>
              <div className="bg-background p-3 rounded border">
                <span className="text-xs text-muted-foreground block">Duplicati Rimossi</span>
                <span className="text-xl font-bold text-amber-600">{report.duplicati_rimossi}</span>
              </div>
              <div className="bg-background p-3 rounded border">
                <span className="text-xs text-muted-foreground block">Totale Movimenti Cassa</span>
                <span className="text-xl font-bold">{report.totale_movimenti_cassa}</span>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Saldi Calcolati Effettivi:</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded bg-green-100 dark:bg-green-950/40 text-green-900 dark:text-green-300">
                  <div className="text-xs font-medium">Cassa Fisica (Contanti)</div>
                  <div className="text-2xl font-bold mt-1">€{report.saldi.saldo_contanti_effettivo.toFixed(2)}</div>
                  <div className="text-[11px] opacity-80 mt-1">
                    Entrate: +€{report.saldi.dettagli.entrate_contanti.toFixed(2)} | Uscite: -€{report.saldi.dettagli.uscite_contanti.toFixed(2)}
                  </div>
                </div>

                <div className="p-3 rounded bg-blue-100 dark:bg-blue-950/40 text-blue-900 dark:text-blue-300">
                  <div className="text-xs font-medium">Conto Corrente (Banca)</div>
                  <div className="text-2xl font-bold mt-1">€{report.saldi.saldo_banca_effettivo.toFixed(2)}</div>
                  <div className="text-[11px] opacity-80 mt-1">
                    Entrate: +€{report.saldi.dettagli.entrate_banca.toFixed(2)} | Uscite: -€{report.saldi.dettagli.uscite_banca.toFixed(2)}
                  </div>
                </div>

                <div className="p-3 rounded bg-purple-100 dark:bg-purple-950/40 text-purple-900 dark:text-purple-300">
                  <div className="text-xs font-medium">Totale Generale</div>
                  <div className="text-2xl font-bold mt-1">€{report.saldi.totale_generale_cassa.toFixed(2)}</div>
                  <div className="text-[11px] opacity-80 mt-1">Totale entrate e uscite sincronizzate</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
