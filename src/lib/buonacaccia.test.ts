import { expect, it } from 'vitest'
import { italianDate, parseEventCatalog, parseEventDetail } from './buonacaccia'

it('legge righe con tabelle annidate preservando date, quota e località', () => {
  const row = `<tr><td><table><tr><td><img src="branch_fc.png"></td><td>CFM E/G</td></tr></table></td><td></td><td><a href="Event.aspx?e=123">Campo &amp; formazione</a></td><td>Marche</td><td>30/10/2026</td><td>08/12/2026</td><td>51,50 €</td><td>Urbino (PU)</td><td>26 / 25</td></tr>`
  const events = parseEventCatalog(`<table>${row}${row}</table>`)
  expect(events).toHaveLength(1)
  expect(events[0]).toMatchObject({ id: '123', titolo: 'Campo & formazione', categoria: 'CFM', costo: 51.5, data_inizio: '2026-10-30', data_fine: '2026-12-08', luogo: 'Urbino (PU)' })
})

it('non inventa eventi, date e quote quando non sono presenti', () => {
  expect(parseEventCatalog('<table><tr><td>Nessun evento</td></tr></table>')).toEqual([])
  expect(italianDate('31/02/2026')).toBeNull()
  expect(() => parseEventDetail('<title>Lista Eventi</title>')).toThrow()
  expect(parseEventDetail('<span id="MainContent_EventFormView_lbTitle">Campo test</span>')).toMatchObject({ data_inizio: null, costo_evento: null, apertura_iscrizioni: null })
})

it('legge i dettagli ufficiali senza dipendere dall’IA', () => {
  const fields: Record<string, string> = { lbTitle: '[Marche] Campo test', Type: 'CFM E/G', lbRegion: 'Marche', lbEventFrom: '30/10/2026', lbEventTo: '08/12/2026', lbFee: '0,00 €', lbSubsFrom: '19/09/2026', lbSubsTo: '14/10/2026' }
  const html = '<img src="Images/branch_fc.png">' + Object.entries(fields).map(([id, value]) => `<span id="MainContent_EventFormView_${id}">${value}</span>`).join('')
  expect(parseEventDetail(html)).toMatchObject({ branca: 'CAPI', costo_evento: 0, data_inizio: '2026-10-30', apertura_iscrizioni: '2026-09-19T00:00:00+02:00' })
})

it('mantiene la data italiana di chiusura anche in inverno', () => {
  const html = '<span id="MainContent_EventFormView_lbTitle">Campo</span><span id="MainContent_EventFormView_lbSubsTo">14/12/2026</span>'
  expect(parseEventDetail(html).chiusura_iscrizioni).toBe('2026-12-14T23:59:59+01:00')
})
