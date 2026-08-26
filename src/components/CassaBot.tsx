'use client'

import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MessageSquare, X, Send, Loader2, Compass } from 'lucide-react'

export function CassaBot() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<{ role: 'user' | 'bot', text: string }[]>([
    { role: 'bot', text: 'Ciao! Sono ScoutBot ⚜️. Come posso aiutarti oggi con la gestione del Reparto, della cassa o delle presenze?' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSend = async () => {
    if (!input.trim()) return

    const userMsg = input.trim()
    setMessages(prev => [...prev, { role: 'user', text: userMsg }])
    setInput('')
    setLoading(true)

    try {
      const response = await fetch('/api/chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg })
      })
      const data = await response.json()
      
      setMessages(prev => [...prev, { role: 'bot', text: data.reply || "Scusa, si è verificato un errore." }])
    } catch {
      setMessages(prev => [...prev, { role: 'bot', text: "Errore di connessione." }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed bottom-20 right-4 md:bottom-4 md:right-4 z-50">
      {!isOpen && (
        <Button 
          onClick={() => setIsOpen(true)} 
          className="rounded-full h-14 w-14 shadow-lg bg-agesci-blue hover:bg-agesci-blue-light text-amber-400 border border-amber-400/30 transition-transform hover:scale-105"
          title="Apri ScoutBot"
        >
          <Compass className="h-7 w-7 animate-pulse" />
        </Button>
      )}

      {isOpen && (
        <Card className="w-80 md:w-96 shadow-2xl border-agesci-blue/20 flex flex-col h-[420px] rounded-xl overflow-hidden">
          <CardHeader className="p-3 bg-agesci-blue text-white flex flex-row justify-between items-center">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Compass className="h-4 w-4 text-amber-400" /> ScoutBot ⚜️
            </CardTitle>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-white hover:bg-agesci-blue-light" onClick={() => setIsOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="flex-1 p-3 overflow-y-auto space-y-3 bg-slate-50">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div 
                  className={`px-3 py-2 rounded-xl max-w-[85%] text-xs md:text-sm shadow-sm whitespace-pre-line ${
                    msg.role === 'user' 
                      ? 'bg-agesci-blue text-white rounded-br-none' 
                      : 'bg-white text-slate-800 border border-slate-200 rounded-bl-none'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-600 rounded-bl-none flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-agesci-blue" /> <span>ScoutBot sta elaborando...</span>
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="p-3 bg-white border-t border-slate-200">
            <form 
              onSubmit={(e) => { e.preventDefault(); handleSend(); }} 
              className="flex w-full gap-2"
            >
              <Input 
                value={input} 
                onChange={(e) => setInput(e.target.value)} 
                placeholder="Chiedi a ScoutBot..." 
                className="flex-1 text-xs md:text-sm h-9"
              />
              <Button type="submit" size="icon" className="h-9 w-9 bg-agesci-blue hover:bg-agesci-blue-light text-white" disabled={loading || !input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </CardFooter>
        </Card>
      )}
    </div>
  )
}
