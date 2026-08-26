import { NextResponse } from 'next/server'

export interface BuonaCacciaEvent {
  id: string
  nome_evento: string
  quota_standard: number
  tipo_evento: 'CI' | 'CE' | 'USCITA' | 'ALTRO'
  data_inizio: string
  organizzatore: string
  descrizione: string
  url: string
}

export async function GET() {
  // Lista eventi predefiniti/esplorabili da BuonaCaccia per il Reparto Scout
  const catalog: BuonaCacciaEvent[] = [
    {
      id: 'bc-001',
      nome_evento: 'Campo Invernale Reparto 2026',
      quota_standard: 45,
      tipo_evento: 'CI',
      data_inizio: '2026-12-27',
      organizzatore: 'AGESCI - Staff Reparto',
      descrizione: 'Campo invernali di 3 giorni in casa di caccia sulle montagne.',
      url: 'https://www.buonacaccia.net/event.aspx?e=ci2026'
    },
    {
      id: 'bc-002',
      nome_evento: 'San Giorgio di Distretto 2026',
      quota_standard: 25,
      tipo_evento: 'USCITA',
      data_inizio: '2026-04-23',
      organizzatore: 'Zona / Distretto AGESCI',
      descrizione: 'Grande grande evento di San Giorgio per tutte le Squadriglie di Zona.',
      url: 'https://www.buonacaccia.net/event.aspx?e=sg2026'
    },
    {
      id: 'bc-003',
      nome_evento: 'Campo Estivo di Reparto 2026',
      quota_standard: 180,
      tipo_evento: 'CE',
      data_inizio: '2026-07-15',
      organizzatore: 'AGESCI - Staff Reparto',
      descrizione: 'Campo Estivo di 12 giorni sotto le tende in val Rosandra.',
      url: 'https://www.buonacaccia.net/event.aspx?e=ce2026'
    },
    {
      id: 'bc-004',
      nome_evento: 'Campo Guidoncine di Volo 2026',
      quota_standard: 30,
      tipo_evento: 'ALTRO',
      data_inizio: '2026-05-10',
      organizzatore: 'Incaricati di Branca EG',
      descrizione: 'Evento di formazione per i Capisquadriglia e Vice Capisquadriglia.',
      url: 'https://www.buonacaccia.net/event.aspx?e=cgv2026'
    },
    {
      id: 'bc-005',
      nome_evento: 'Uscita di Primavera & Pernottamento',
      quota_standard: 20,
      tipo_evento: 'USCITA',
      data_inizio: '2026-03-21',
      organizzatore: 'Staff Reparto',
      descrizione: 'Uscita di 2 giorni con pernottamento in base scout.',
      url: 'https://www.buonacaccia.net/event.aspx?e=usc2026'
    }
  ]

  return NextResponse.json({ events: catalog })
}
