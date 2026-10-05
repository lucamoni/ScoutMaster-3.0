export const BUONACACCIA_ORIGIN = 'https://buonacaccia.agesci.it'

export function htmlText(html: string) {
  return html.replace(/<[^>]*>/g, ' ').replace(/&#(x[\da-f]+|\d+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code.startsWith('x') ? code.slice(1) : code, code.startsWith('x') ? 16 : 10)))
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&agrave;/g, 'à').replace(/&egrave;/g, 'è').replace(/&eacute;/g, 'é').replace(/&ograve;/g, 'ò').replace(/&ugrave;/g, 'ù').replace(/&igrave;/g, 'ì').replace(/\s+/g, ' ').trim()
}

// Respect nested tables in the official ASP.NET event grid.
function outerElements(html: string, tag: 'tr' | 'td') {
  const pattern = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi')
  const elements: string[] = []
  let depth = 0, start = 0
  for (const match of html.matchAll(pattern)) {
    if (!match[1]) { if (depth++ === 0) start = match.index! + match[0].length }
    else if (depth > 0 && --depth === 0) elements.push(html.slice(start, match.index))
  }
  return elements
}

export function italianDate(value?: string | null) {
  const match = value?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return null
  const iso = `${match[3]}-${match[2]}-${match[1]}`
  const date = new Date(`${iso}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null
}

function fee(value: string) {
  if (!/\d/.test(value)) return null
  const amount = Number(value.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(amount) && amount >= 0 ? amount : null
}

export function eventCategory(type: string) {
  if (/\bCFT\b/i.test(type)) return 'CFT'
  if (/\bCFM\b/i.test(type)) return 'CFM'
  if (/\bCFA\b/i.test(type)) return 'CFA'
  if (/competenza/i.test(type)) return 'Competenza'
  if (/specialit/i.test(type)) return 'Specialita'
  if (/orme/i.test(type)) return 'Piccole Orme'
  return 'Altro'
}

export type CatalogEvent = {
  id: string; titolo: string; date: string; luogo: string; regione: string;
  categoria: string; costo: number | null; data_inizio: string | null; data_fine: string | null
}

export function parseEventCatalog(html: string): CatalogEvent[] {
  const unique = new Map<string, CatalogEvent>()
  for (const row of outerElements(html, 'tr')) {
    const link = row.match(/href=["'](?:\/)?Event\.aspx\?e=(\d+)["'][^>]*>([\s\S]*?)<\/a>/i)
    if (!link) continue
    const cells = outerElements(row, 'td').map(htmlText)
    if (cells.length < 8) continue
    const titolo = htmlText(link[2])
    if (!titolo) continue
    unique.set(link[1], { id: link[1], titolo, categoria: eventCategory(cells[0]), regione: cells[3], date: [cells[4], cells[5]].filter(Boolean).join(' – '), data_inizio: italianDate(cells[4]), data_fine: italianDate(cells[5]), costo: fee(cells[6]), luogo: cells[7] })
  }
  return [...unique.values()]
}

// The portal publishes calendar dates in Italy, not UTC timestamps.
function registrationBoundary(date: string | null, end: boolean) {
  if (!date) return null
  const noon = new Date(`${date}T12:00:00Z`)
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', hour: '2-digit', hourCycle: 'h23' }).format(noon))
  return `${date}T${end ? '23:59:59' : '00:00:00'}+0${hour - 12}:00`
}

export function parseEventDetail(html: string) {
  const field = (id: string) => htmlText(html.match(new RegExp(`<span[^>]*id=["']MainContent_EventFormView_${id}["'][^>]*>([\\s\\S]*?)<\\/span>`, 'i'))?.[1] || '')
  const title = field('lbTitle')
  if (!title) throw new Error('La pagina non contiene un evento BuonaCaccia verificabile')
  const type = field('Type')
  const capi = /branch_fc\.png/i.test(html)
  const from = italianDate(field('lbSubsFrom')), to = italianDate(field('lbSubsTo'))
  const appointments = html.match(/<table[^>]*id=["']MainContent_EventFormView_gvAppointments["'][^>]*>([\s\S]*?)<\/table>/i)?.[1]
  const firstAppointment = appointments ? outerElements(appointments, 'tr').find(row => /<td\b/i.test(row)) : null
  const location = field('lbLocation') || (firstAppointment ? htmlText(outerElements(firstAppointment, 'td')[1] || '') : '')
  return { titolo: title, categoria: eventCategory(type), branca: capi ? 'CAPI' : 'EG', regione: field('lbRegion') || null, luogo: location || null,
    data_inizio: italianDate(field('lbEventFrom')), data_fine: italianDate(field('lbEventTo')), costo_evento: fee(field('lbFee')),
    apertura_iscrizioni: registrationBoundary(from, false), chiusura_iscrizioni: registrationBoundary(to, true),
    note: field('lbDescription') || null }
}
