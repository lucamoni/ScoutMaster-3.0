'use client'

import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MessageSquare, X, Send, Loader2 } from 'lucide-react'

export function CassaBot() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<{ role: 'user' | 'bot', text: string }[]>([
    { role: 'bot', text: 'Ciao! Sono CassaBot. Come posso aiutarti con la gestione del Reparto oggi?' }
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
          className="rounded-full h-14 w-14 shadow-lg bg-primary hover:bg-primary/90"
        >
          <MessageSquare className="h-6 w-6" />
        </Button>
      )}

      {isOpen && (
        <Card className="w-80 md:w-96 shadow-xl border-primary/20 flex flex-col h-[400px]">
          <CardHeader className="p-3 bg-primary text-primary-foreground flex flex-row justify-between items-center rounded-t-lg">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <MessageSquare className="h-4 w-4" /> CassaBot
            </CardTitle>
            <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-primary/80" onClick={() => setIsOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="flex-1 p-3 overflow-y-auto space-y-3 bg-muted/20">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div 
                  className={`px-3 py-2 rounded-lg max-w-[85%] text-sm ${
                    msg.role === 'user' ? 'bg-primary text-primary-foreground rounded-br-none' : 'bg-muted rounded-bl-none'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="px-3 py-2 rounded-lg bg-muted text-sm rounded-bl-none flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> <span>Sto pensando...</span>
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="p-3 bg-background border-t">
            <form 
              onSubmit={(e) => { e.preventDefault(); handleSend(); }} 
              className="flex w-full gap-2"
            >
              <Input 
                value={input} 
                onChange={(e) => setInput(e.target.value)} 
                placeholder="Chiedi qualcosa..." 
                className="flex-1"
              />
              <Button type="submit" size="icon" disabled={loading || !input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </CardFooter>
        </Card>
      )}
    </div>
  )
}
