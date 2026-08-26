'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Trash2, AlertTriangle, RefreshCw, Users, Calendar, Wallet, CreditCard, Compass } from 'lucide-react'
import { toast } from 'sonner'

export default function DataResetSettings() {
  const [loadingTarget, setLoadingTarget] = useState<string | null>(null)
  const [confirmTarget, setConfirmTarget] = useState<{ id: string, name: string } | null>(null)
  const [confirmationInput, setConfirmationInput] = useState('')

  const handleReset = async (targetId: string, targetName: string) => {
    setLoadingTarget(targetId)
    const toastId = toast.loading(`Eliminazione ${targetName} in corso...`)
    
    try {
      const res = await fetch('/api/admin/reset-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: targetId })
      })

      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Errore eliminazione dati')

      toast.success(data.message || 'Eliminazione completata!', { id: toastId })
      setConfirmTarget(null)
      setConfirmationInput('')
      
      // Ricarica la pagina per aggiornare le viste
      setTimeout(() => {
        window.location.reload()
      }, 1000)
    } catch (error: unknown) {
      const err = error as Error
      toast.error('Errore: ' + err.message, { id: toastId })
    } finally {
      setLoadingTarget(null)
    }
  }

  const sections = [
    {
      id: 'ragazzi',
      title: 'Anagrafica & Squadriglie',
      description: 'Elimina tutti i ragazzi censiti, contatti e squadriglie.',
      icon: Users,
      color: 'text-blue-600 bg-blue-50 border-blue-200'
    },
    {
      id: 'eventi',
      title: 'Eventi & Presenze Uscite',
      description: 'Cancella tutti gli eventi di reparto e le presenze registrate.',
      icon: Calendar,
      color: 'text-emerald-600 bg-emerald-50 border-emerald-200'
    },
    {
      id: 'registro_spese',
      title: 'Registro Spese & Cassa',
      description: 'Cancella tutti i movimenti in entrata ed uscita dalla cassa.',
      icon: Wallet,
      color: 'text-amber-600 bg-amber-50 border-amber-200'
    },
    {
      id: 'quote_mensili',
      title: 'Quote Mensili',
      description: 'Svuota la griglia dei pagamenti delle quote mensili.',
      icon: CreditCard,
      color: 'text-purple-600 bg-purple-50 border-purple-200'
    },
    {
      id: 'buonacaccia',
      title: 'Moduli & Candidature BuonaCaccia',
      description: 'Cancella tutti gli eventi scaricati da BuonaCaccia e le candidature.',
      icon: Compass,
      color: 'text-indigo-600 bg-indigo-50 border-indigo-200'
    }
  ]

  return (
    <Card className="border-red-200 shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl font-bold flex items-center gap-2 text-red-600">
          <Trash2 className="h-5 w-5" /> Gestione & Pulizia Dati Database
        </CardTitle>
        <CardDescription>
          Svuota i dati delle singole sezioni oppure esegui un reset totale di ScoutMaster.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* Griglia eliminazione singole sezioni */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sections.map(sec => {
            const Icon = sec.icon
            const isDeleting = loadingTarget === sec.id
            return (
              <div key={sec.id} className="p-4 border rounded-lg flex flex-col justify-between space-y-3 bg-card hover:bg-accent/5 transition-colors">
                <div className="flex items-start gap-3">
                  <div className={`p-2.5 rounded-lg border ${sec.color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">{sec.title}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{sec.description}</p>
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  disabled={isDeleting || loadingTarget !== null}
                  onClick={() => setConfirmTarget({ id: sec.id, name: sec.title })}
                  className="w-full text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                >
                  {isDeleting ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                  Svuota {sec.title.split('&')[0].trim()}
                </Button>
              </div>
            )
          })}
        </div>

        <hr className="my-4 border-red-100" />

        {/* Reset Totale dell'intero Database */}
        <div className="p-4 border border-red-300 rounded-lg bg-red-50/50 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-8 w-8 text-red-600 shrink-0" />
            <div>
              <h3 className="font-bold text-red-900 text-base">Reset Totale del Database</h3>
              <p className="text-xs text-red-700">
                Elimina TUTTI i dati di ScoutMaster (Ragazzi, Spese, Eventi, Quote e BuonaCaccia) per ripartire da zero.
              </p>
            </div>
          </div>
          <Button 
            variant="destructive"
            disabled={loadingTarget !== null}
            onClick={() => setConfirmTarget({ id: 'all', name: 'TUTTI I DATI DEL DATABASE' })}
            className="w-full md:w-auto font-semibold shadow-sm shrink-0"
          >
            <Trash2 className="h-4 w-4 mr-2" /> Elimina Tutto il Database
          </Button>
        </div>

      </CardContent>

      {/* Modal di Conferma Sicurezza */}
      <Dialog open={confirmTarget !== null} onOpenChange={(open) => { if (!open) { setConfirmTarget(null); setConfirmationInput(''); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" /> Conferma Eliminazione
            </DialogTitle>
            <DialogDescription>
              Stai per eliminare definitivamente: <strong className="text-foreground">{confirmTarget?.name}</strong>. Questa azione è irreversibile.
            </DialogDescription>
          </DialogHeader>

          {confirmTarget?.id === 'all' && (
            <div className="space-y-2 py-2">
              <p className="text-xs font-semibold text-red-600">
                Per confermare l&apos;eliminazione totale, digita <strong>ELIMINA</strong> qui sotto:
              </p>
              <Input 
                value={confirmationInput}
                onChange={e => setConfirmationInput(e.target.value)}
                placeholder="Digita ELIMINA..."
                className="border-red-300 focus-visible:ring-red-500"
              />
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button variant="outline" onClick={() => setConfirmTarget(null)}>Annulla</Button>
            <Button 
              variant="destructive"
              disabled={confirmTarget?.id === 'all' && confirmationInput !== 'ELIMINA'}
              onClick={() => confirmTarget && handleReset(confirmTarget.id, confirmTarget.name)}
            >
              Conferma ed Elimina
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
