'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Wallet, Save, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { createBrowserClient } from '@supabase/ssr'
import { Database } from '@/types/database.types'

export default function CensimentoSettings({
  initialCensimentoStandard = '45',
  initialCensimentoFratelli = '35',
  initialMensileStandard = '10'
}: {
  initialCensimentoStandard?: string
  initialCensimentoFratelli?: string
  initialMensileStandard?: string
}) {
  const [censimentoStandard, setCensimentoStandard] = useState(initialCensimentoStandard)
  const [censimentoFratelli, setCensimentoFratelli] = useState(initialCensimentoFratelli)
  const [mensileStandard, setMensileStandard] = useState(initialMensileStandard)
  const [loading, setLoading] = useState(false)

  const supabase = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const handleSave = async () => {
    setLoading(true)
    try {
      await supabase.from('impostazioni').upsert([
        { chiave: 'quota_censimento_standard', valore: censimentoStandard },
        { chiave: 'quota_censimento_fratelli', valore: censimentoFratelli },
        { chiave: 'quota_mensile_standard', valore: mensileStandard }
      ])
      toast.success('Quote standard e scontate salvate con successo!')
    } catch (err) {
      console.error(err)
      toast.error('Errore durante il salvataggio delle impostazioni')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="border-emerald-200 dark:border-emerald-900 shadow-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Wallet className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          <CardTitle className="text-xl">Configurazione Quote Censimento e Mensili</CardTitle>
        </div>
        <CardDescription>
          Imposta le quote predefinite per il censimento AGESCI (quota intera e quota scontata per fratelli) e le quote mensili di reparto.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
              Quota Censimento Standard (€)
            </Label>
            <Input 
              type="number" 
              value={censimentoStandard} 
              onChange={e => setCensimentoStandard(e.target.value)} 
              placeholder="45"
            />
            <p className="text-[11px] text-muted-foreground">Quota intera per il primo figlio/ragazzo</p>
          </div>

          <div className="space-y-2">
            <Label className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
              Quota Censimento Fratelli Scontata (€)
            </Label>
            <Input 
              type="number" 
              value={censimentoFratelli} 
              onChange={e => setCensimentoFratelli(e.target.value)} 
              placeholder="35"
            />
            <p className="text-[11px] text-muted-foreground">Quota ridotta per fratelli nel gruppo</p>
          </div>

          <div className="space-y-2">
            <Label className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
              Quota Mensile Standard (€)
            </Label>
            <Input 
              type="number" 
              value={mensileStandard} 
              onChange={e => setMensileStandard(e.target.value)} 
              placeholder="10"
            />
            <p className="text-[11px] text-muted-foreground">Quota mensile ordinaria di reparto</p>
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <Button onClick={handleSave} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Salva Configurazioni Quote
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
