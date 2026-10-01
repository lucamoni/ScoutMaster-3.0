'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'
import { reminderText, validWhatsAppGroupLink, whatsappNumber, type ReminderPerson } from '@/lib/reminder'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export default function ReminderClient({ data, initialGroupLink }: { data: ReminderPerson[]; initialGroupLink: string }) {
  const [mode, setMode] = useState<'group' | 'single'>('group')
  const [personId, setPersonId] = useState(data[0]?.id || '')
  const [parent, setParent] = useState<1 | 2>(1)
  const [selected, setSelected] = useState(() => new Set(data.flatMap(person => person.items.map(item => item.id))))
  const [message, setMessage] = useState('')
  const [groupLink, setGroupLink] = useState(initialGroupLink)
  const [savedGroupLink, setSavedGroupLink] = useState(initialGroupLink)
  const [savingLink, setSavingLink] = useState(false)
  const person = data.find(row => row.id === personId)
  const visiblePeople = useMemo(() => mode === 'single' ? data.filter(row => row.id === personId) : data, [data, mode, personId])
  const selectedCount = visiblePeople.reduce((count, row) => count + row.items.filter(item => selected.has(item.id)).length, 0)
  const phone = whatsappNumber(parent === 1 ? person?.parent1.phone || null : person?.parent2.phone || null)

  const toggle = (id: string) => { setMessage(''); setSelected(previous => {
    const next = new Set(previous)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  }) }

  const prepare = () => {
    const text = reminderText(visiblePeople, selected, mode === 'single')
    if (!text) { toast.error('Seleziona almeno una voce.'); return }
    setMessage(text)
  }

  const copy = async () => {
    if (!message.trim()) { toast.error('Prepara o scrivi prima il messaggio.'); return }
    try { await navigator.clipboard.writeText(message); toast.success('Messaggio copiato.') }
    catch { toast.error('Copia non riuscita. Seleziona il testo e copialo manualmente.') }
  }

  const saveGroupLink = async () => {
    const validated = validWhatsAppGroupLink(groupLink)
    if (groupLink.trim() && !validated) { toast.error('Inserisci un link d’invito WhatsApp valido.'); return }
    setSavingLink(true)
    const { error } = await createClient().from('impostazioni').upsert({ chiave: 'reminder_link_gruppo', valore: validated || '' })
    setSavingLink(false)
    if (error) { toast.error('Non sono riuscito a salvare il link del gruppo.'); return }
    setSavedGroupLink(validated || '')
    setGroupLink(validated || '')
    toast.success('Link del gruppo salvato')
  }

  const openGroup = () => {
    const validated = validWhatsAppGroupLink(savedGroupLink)
    if (!validated) { toast.error('Salva prima il link del gruppo.'); return }
    window.open(validated, '_blank', 'noopener,noreferrer')
  }

  const openParent = () => {
    if (!message.trim()) { toast.error('Prepara o scrivi prima il messaggio.'); return }
    if (!phone) { toast.error('Questo genitore non ha un numero WhatsApp valido.'); return }
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
  }

  return <div className="grid gap-6 lg:grid-cols-2">
    <section className="space-y-4 rounded-xl border bg-white p-4 md:p-6">
      <h2 className="text-lg font-semibold">Cosa ricordare</h2>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Destinatari del reminder">
        <Button variant={mode === 'group' ? 'default' : 'outline'} onClick={() => { setMode('group'); setMessage('') }}>Gruppo genitori</Button>
        <Button variant={mode === 'single' ? 'default' : 'outline'} onClick={() => { setMode('single'); setMessage('') }}>Singolo genitore</Button>
      </div>
      {mode === 'single' && <div className="space-y-2"><Label htmlFor="reminder-person">Ragazzo o ragazza</Label><select id="reminder-person" className="w-full rounded-md border p-2" value={personId} onChange={event => { setPersonId(event.target.value); setMessage('') }}><option value="">Seleziona</option>{data.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div>}
      {data.length === 0 ? <p className="text-sm text-muted-foreground">Nessuna quota scaduta o modulo mancante rilevato per questo anno scout. Puoi comunque scrivere un messaggio libero.</p> : <div className="max-h-[460px] space-y-4 overflow-auto">{visiblePeople.map(row => <div key={row.id} className="space-y-2 rounded-lg border p-3"><h3 className="font-medium">{row.name}</h3>{row.items.map(item => <label key={item.id} className="flex cursor-pointer items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={selected.has(item.id)} onChange={() => toggle(item.id)} /><span>{item.label}</span></label>)}</div>)}</div>}
      <p className="text-xs text-muted-foreground">{selectedCount} voci selezionate. Puoi selezionare più quote, eventi e moduli nello stesso messaggio.</p>
    </section>
    <section className="space-y-4 rounded-xl border bg-white p-4 md:p-6">
      <h2 className="text-lg font-semibold">Messaggio WhatsApp</h2>
      <Button variant="outline" onClick={prepare} disabled={!selectedCount}>Prepara messaggio dalle voci</Button>
      <div className="space-y-2"><Label htmlFor="reminder-message">Testo modificabile</Label><Textarea id="reminder-message" rows={11} value={message} onChange={event => setMessage(event.target.value)} placeholder="Prepara il messaggio oppure scrivilo qui…" /></div>
      {mode === 'group' ? <div className="space-y-3 rounded-lg border p-3"><Label htmlFor="reminder-group-link">Link d’invito del gruppo genitori</Label><Input id="reminder-group-link" type="url" placeholder="https://chat.whatsapp.com/…" value={groupLink} onChange={event => setGroupLink(event.target.value)} /><Button variant="outline" disabled={savingLink || groupLink === savedGroupLink} onClick={saveGroupLink}>{savingLink ? 'Salvataggio…' : 'Salva link gruppo'}</Button><p className="text-xs text-muted-foreground">Copia il messaggio, apri il gruppo e incollalo lì. Il link d’invito non permette di compilare automaticamente il testo.</p><div className="flex flex-wrap gap-2"><Button disabled={!message.trim()} onClick={copy}>Copia messaggio</Button><Button variant="outline" disabled={!savedGroupLink || groupLink !== savedGroupLink} onClick={openGroup}>Apri gruppo WhatsApp</Button></div></div> : <div className="space-y-3 rounded-lg border p-3"><Label htmlFor="reminder-parent">Genitore destinatario</Label><select id="reminder-parent" className="w-full rounded-md border p-2" value={parent} onChange={event => setParent(Number(event.target.value) as 1 | 2)} disabled={!person}><option value={1}>{person?.parent1.name || 'Genitore 1'}{person?.parent1.phone ? ` · ${person.parent1.phone}` : ' · numero mancante'}</option><option value={2}>{person?.parent2.name || 'Genitore 2'}{person?.parent2.phone ? ` · ${person.parent2.phone}` : ' · numero mancante'}</option></select><Button disabled={!message.trim() || !phone} onClick={openParent}>Apri chat WhatsApp</Button>{!phone && <p className="text-xs text-muted-foreground">Numero assente o non valido: aggiungilo nell’anagrafica, oppure copia il testo.</p>}<Button variant="outline" disabled={!message.trim()} onClick={copy}>Copia messaggio</Button></div>}
    </section>
  </div>
}
