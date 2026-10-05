'use client'

import type { Tables } from '@/types/database.types'

type Boy = Tables<'ragazzi'>
type Result<T> = { data: T; error: null } | { data: null; error: { message: string } }
export type AnnualCensus = { method?: 'Contanti' | 'Bonifico' | 'Carta'; date?: string }

async function annualRequest<T>(url: string, init?: RequestInit): Promise<Result<T>> {
  try {
    const response = await fetch(url, { ...init, cache: 'no-store' })
    const body = await response.json()
    if (!response.ok) return { data: null, error: { message: typeof body.error === 'string' ? body.error : 'Impossibile salvare l’anagrafica dell’anno selezionato' } }
    if (body.data == null) return { data: null, error: { message: 'Risposta anagrafica incompleta' } }
    return { data: body.data as T, error: null }
  } catch {
    return { data: null, error: { message: 'Connessione non riuscita. Riprova.' } }
  }
}

export function annualBoyUpdate(id: string, changes: Record<string, unknown>, year?: string, census?: AnnualCensus): Promise<Result<Boy>> {
  return annualRequest('/api/anagrafica', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, changes, ...(year ? { year } : {}), ...(census ? { census } : {}) }) })
}

export function annualBoyCreate(changes: Record<string, unknown>, year?: string, census?: AnnualCensus): Promise<Result<Boy>> {
  return annualRequest('/api/anagrafica', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ changes, ...(year ? { year } : {}), ...(census ? { census } : {}) }) })
}

export function annualBoys(year?: string): Promise<Result<Boy[]>> {
  return annualRequest(`/api/anagrafica${year ? `?year=${encodeURIComponent(year)}` : ''}`)
}
