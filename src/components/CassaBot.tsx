'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Dialog } from '@base-ui/react/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { X, Send, Loader2, Compass } from 'lucide-react'

function renderMarkdownMessage(text: string) {
  const lines = text.split('\n')
  return (
    <div className="space-y-1 text-slate-800">
      {lines.map((line, lIdx) => {
        if (!line.trim()) return <div key={lIdx} className="h-1" />

        // Parse **grassetto**
        const parts = line.split(/(\*\*[^*]+\*\*)/g)
        const parsedLine = parts.map((part, pIdx) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={pIdx} className="font-bold text-slate-950">{part.slice(2, -2)}</strong>
          }
          return part
        })

        if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
          return (
            <div key={lIdx} className="flex items-start gap-1.5 pl-1 my-0.5">
              <span className="text-amber-500 font-bold shrink-0">•</span>
              <span>{parsedLine}</span>
            </div>
          )
        }

        return <div key={lIdx}>{parsedLine}</div>
      })}
    </div>
  )
}

export function CassaBot() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<{ role: 'user' | 'bot', text: string }[]>([
    { role: 'bot', text: 'Ciao! Sono ScoutBot ⚜️. Come posso aiutarti oggi con la gestione del Reparto, della cassa o delle presenze?' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [viewportStyle, setViewportStyle] = useState<CSSProperties>({})
  const messageList = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isOpen) return
    const viewport = window.visualViewport
    const resize = () => {
      setViewportStyle(window.matchMedia('(max-width: 767px)').matches ? {
        '--scoutbot-top': `${viewport?.offsetTop ?? 0}px`,
        '--scoutbot-height': `${viewport?.height ?? window.innerHeight}px`,
      } as CSSProperties : {})
    }
    resize()
    window.addEventListener('resize', resize)
    viewport?.addEventListener('resize', resize)
    viewport?.addEventListener('scroll', resize)
    return () => {
      window.removeEventListener('resize', resize)
      viewport?.removeEventListener('resize', resize)
      viewport?.removeEventListener('scroll', resize)
    }
  }, [isOpen])

  useEffect(() => {
    if (messageList.current) messageList.current.scrollTop = messageList.current.scrollHeight
  }, [messages, loading, isOpen])

  const handleSend = async () => {
    if (loading || !input.trim()) return

    const userMsg = input.trim()
    setMessages(prev => [...prev, { role: 'user', text: userMsg }])
    setInput('')
    setLoading(true)
    setError('')

    try {
      const response = await fetch('/api/chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(40_000),
        body: JSON.stringify({ message: userMsg, history: messages.slice(-6).map(m => ({ role: m.role === 'bot' ? 'assistant' : 'user', content: m.text })) })
      })
      const data = response.headers.get('content-type')?.includes('application/json')
        ? await response.json()
        : { error: response.redirected && new URL(response.url).pathname.startsWith('/login') ? 'Sessione scaduta. Accedi nuovamente a ScoutMaster.' : 'Risposta del server non valida. Riprova.' }
      
      if (!response.ok || !data.reply) {
        setError(data.error || 'ScoutBot non ha risposto. Riprova.')
        setInput(userMsg)
        setMessages(prev => prev.slice(0, -1))
      } else setMessages(prev => [...prev, { role: 'bot', text: data.reply }])
    } catch {
      setError('Connessione interrotta o risposta troppo lenta. Riprova.')
      setInput(userMsg)
      setMessages(prev => prev.slice(0, -1))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
      <Dialog.Trigger render={<Button
          className="rounded-full h-10 w-10 md:h-14 md:w-14 shadow-md bg-agesci-blue hover:bg-agesci-blue-light text-amber-400 border border-amber-400/30 transition-transform hover:scale-105"
          title="Apri ScoutBot"
          aria-label="Apri ScoutBot"
        />} className="fixed bottom-20 right-4 md:bottom-4 md:right-4 z-50">
          <Compass className="h-5 w-5 md:h-7 md:w-7" />
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[60] bg-slate-950/40" />
        <Dialog.Popup initialFocus={closeButton} style={viewportStyle}
          className="fixed right-0 top-[var(--scoutbot-top,0px)] z-[61] flex h-[var(--scoutbot-height,100dvh)] w-full min-h-0 flex-col overflow-hidden bg-white outline-none md:top-auto md:bottom-4 md:right-4 md:h-[min(600px,calc(100dvh-2rem))] md:w-96 md:rounded-xl md:shadow-2xl">
          <header className="flex shrink-0 items-center justify-between bg-agesci-blue p-3 pt-[max(0.75rem,env(safe-area-inset-top))] text-white">
            <Dialog.Title className="text-base font-bold flex items-center gap-2">
              <Compass className="h-4 w-4 text-amber-400" /> ScoutBot ⚜️
            </Dialog.Title>
            <Dialog.Close aria-label="Chiudi ScoutBot" render={<Button ref={closeButton} variant="ghost" size="icon" className="h-11 w-11 text-white hover:bg-agesci-blue-light" />}>
              <X className="h-4 w-4" />
            </Dialog.Close>
          </header>
          <div ref={messageList} role="log" aria-label="Conversazione ScoutBot" aria-live="polite" className="min-h-0 flex-1 p-3 overflow-y-auto overscroll-contain space-y-3 bg-slate-50">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div 
                  className={`px-3.5 py-2.5 rounded-xl max-w-[88%] break-words [overflow-wrap:anywhere] text-sm shadow-2xs leading-relaxed ${
                    msg.role === 'user' 
                      ? 'bg-agesci-blue text-white rounded-br-none' 
                      : 'bg-white text-slate-800 border border-slate-200/90 rounded-bl-none'
                  }`}
                >
                  {msg.role === 'user' ? msg.text : renderMarkdownMessage(msg.text)}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-600 rounded-bl-none flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-agesci-blue" /> <span>ScoutBot sta consultando i dati...</span>
                </div>
              </div>
            )}
          </div>
          <footer className="shrink-0 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-white border-t border-slate-200">
            {error && <p role="alert" className="mb-2 text-sm text-red-700">{error}</p>}
            <form 
              onSubmit={(e) => { e.preventDefault(); handleSend(); }} 
              className="flex w-full gap-2"
            >
              <Input 
                value={input} 
                disabled={loading}
                maxLength={2000}
                onChange={(e) => setInput(e.target.value)} 
                placeholder="Chiedi a ScoutBot..." 
                aria-label="Messaggio a ScoutBot"
                className="min-w-0 flex-1 text-base md:text-base h-11"
              />
              <Button type="submit" size="icon" aria-label="Invia messaggio" className="h-11 w-11 bg-agesci-blue hover:bg-agesci-blue-light text-white" disabled={loading || !input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
