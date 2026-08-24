'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, MessageCircle, Send } from 'lucide-react'

type DebitoreData = {
  ragazzo: { nome: string; cognome: string }
  quoteArretrate: string[]
  usciteNonPagate: string[]
  privacyMancante: boolean
}

export default function ReminderClient({ data }: { data: DebitoreData[] }) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleGenerate = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ debitori: data })
      })
      const result = await response.json()
      if (result.message) {
        setMessage(result.message)
      } else {
        alert("Errore nella generazione del messaggio.")
      }
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const openWhatsApp = () => {
    const text = encodeURIComponent(message)
    window.open(`https://wa.me/?text=${text}`, '_blank')
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Elenco Debitori */}
      <Card>
        <CardHeader>
          <CardTitle>Situazione Sospesi</CardTitle>
          <CardDescription>Esploratori con quote arretrate o documenti mancanti ({data.length})</CardDescription>
        </CardHeader>
        <CardContent className="max-h-[500px] overflow-auto space-y-4">
          {data.length === 0 ? (
            <p className="text-green-600 font-medium">Tutti in regola! Nessun sospeso.</p>
          ) : (
            data.map((d, i) => (
              <div key={i} className="p-3 border rounded-md text-sm">
                <span className="font-bold block mb-1">{d.ragazzo.nome} {d.ragazzo.cognome}</span>
                {d.quoteArretrate.length > 0 && (
                  <p className="text-red-600">Mesi: {d.quoteArretrate.join(', ')}</p>
                )}
                {d.usciteNonPagate.length > 0 && (
                  <p className="text-orange-600">Uscite: {d.usciteNonPagate.join(', ')}</p>
                )}
                {d.privacyMancante && (
                  <p className="text-yellow-600">Manca Foglio Privacy</p>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Generatore AI */}
      <Card className="flex flex-col">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" /> Testo WhatsApp (AI)
          </CardTitle>
          <CardDescription>L&apos;AI formulerà un messaggio gentile includendo tutti i sospesi.</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col gap-4">
          <Button onClick={handleGenerate} disabled={loading || data.length === 0}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Genera Messaggio
          </Button>

          <Textarea 
            className="flex-1 min-h-[250px] resize-none"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Il messaggio generato comparirà qui..."
          />
        </CardContent>
        <CardFooter>
          <Button 
            variant="default" 
            className="w-full bg-green-600 hover:bg-green-700 text-white" 
            disabled={!message}
            onClick={openWhatsApp}
          >
            <Send className="mr-2 h-4 w-4" /> Invia su WhatsApp
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
