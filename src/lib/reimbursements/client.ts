'use client'

import { imageForRecognition } from '@/lib/ocr/receipt'
import { parseRequest } from './model'

export type ExpenseFunding = '' | 'UNIT' | 'PERSONAL'
export type ReimbursementInput = {
  id: string; year: string; beneficiary: string; date: string; amount: string;
  category: string; period: string; note: string;
}

export async function submitReimbursement(input: ReimbursementInput, file: File | null) {
  parseRequest(input)
  const data = new FormData()
  for (const [key, value] of Object.entries(input)) data.set(key, value)
  if (file) {
    let upload = file
    if (file.type.startsWith('image/')) {
      const blob = await imageForRecognition(file, 2200)
      if (blob !== file) upload = new File([blob], blob.type === 'image/jpeg' ? file.name.replace(/\.[^.]+$/, '') + '.jpg' : file.name, { type: blob.type })
    }
    if (upload.size > 3145728) throw Error('Il file supera 3 MB. Riduci il documento prima di caricarlo.')
    data.set('file', upload)
  }
  const response = await fetch('/api/rimborsi', { method: 'POST', body: data })
  if (response.redirected) throw Error('Accedi di nuovo prima di salvare la richiesta.')
  const result = await response.json()
  if (!response.ok) throw Error(result.error || 'Richiesta non salvata')
  return result as { ok: true; id: string }
}

// The two destinations are mutually exclusive: personal advances never call the ledger writer.
export async function saveExpenseEntry<T>(funding: ExpenseFunding, movement: () => Promise<T>, advance: () => Promise<{ ok: true; id: string }>) {
  if (funding === 'PERSONAL') return { kind: 'advance' as const, request: await advance() }
  if (funding !== 'UNIT') throw Error('Scegli chi ha pagato: reparto oppure utente da rimborsare.')
  return { kind: 'movement' as const, movement: await movement() }
}
