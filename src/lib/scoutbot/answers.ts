import type { ScoutBotContext } from './context'
import { SCOUT_FEE_MONTHS } from '@/lib/utils/debts'

const normalized = (text: string) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’']/g, ' ')
export const euro = (amount: number) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(amount)
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)

export function answerFromData(message: string, facts: ScoutBotContext, previousQuestion = ''): string | null {
  const current = normalized(message)
  const text = /^(e\b|invece\b|solo\b|quelle\b|quelli\b)/.test(current) ? `${normalized(previousQuestion)} ${current}` : current
  const heading = `**Anno scout ${facts.anno_scout.replace('-', '/')}**`
  const winter = /\binvernal|\b(?:campo|al|del|per|quota)\s+ci\b/.test(text) || text.trim() === 'ci'
  const summer = /\bestiv|\b(?:campo|al|del|per|quota)\s+ce\b/.test(text) || text.trim() === 'ce'
  const financial = /\b(cassa|bilancio|banca|bonifico|contanti|spese|speso|movimenti|entrate)\b/.test(text)
  const expenses = /\b(uscite|spese|speso|movimenti|entrate)\b/.test(text) && financial
  if (expenses) {
    const knownWords = new Set('quante quanti quanto quale quali elenco elenca lista sono abbiamo fatto registrato registrati totale totali importo importi numero uscite spese speso movimenti entrate cassa bilancio banca bonifico bonifici contanti carta campo invernale estivo scout anno reparto quelle quelli invece soltanto mostra dammi voglio sapere presenti tutte tutti della delle dello nostro questa questi questi nelle'.split(' '))
    const terms = text.split(/\W+/).filter(word => word.length > 3 && !knownWords.has(word) && !/^\d+$/.test(word))
    // A qualifier such as "pane" must restrict the result, never silently return all expenses.
    if (terms.some(word => !facts.movimenti.some(m => normalized(`${m.categoria} ${m.descrizione}`).includes(word)))) return null
    const type = /\bentrate\b/.test(text) && !/\b(uscite|spese|speso)\b/.test(text) ? 'ENTRATA' : /\b(uscite|spese|speso)\b/.test(text) && !/\bentrate\b/.test(text) ? 'USCITA' : null
    const methodText = /\b(contanti|bonifico|bonifici|carta|banca)\b/.test(current) ? current : text
    const method = /\bcontanti\b/.test(methodText) ? 'Contanti' : /\bbonific/.test(methodText) ? 'Bonifico' : /\bcarta\b/.test(methodText) ? 'Carta' : /\bbanca\b/.test(methodText) ? 'Banca' : null
    const filtered = facts.movimenti.filter(m => (!type || m.tipo === type) && (!method || (method === 'Banca' ? m.metodo !== 'Contanti' : m.metodo === method)) && (!winter || m.momento?.toUpperCase() === 'CI') && (!summer || m.momento?.toUpperCase() === 'CE') && terms.every(word => normalized(`${m.categoria} ${m.descrizione}`).includes(word)))
    const label = type === 'USCITA' ? 'movimenti in uscita' : type === 'ENTRATA' ? 'movimenti in entrata' : 'movimenti'
    const total = sum(filtered.map(m => m.importo))
    const note = method ? ` · ${method}` : ''
    return `${heading}${note}\nRisultano **${filtered.length} ${label}**, per un totale di **${euro(total)}**.${winter ? ' Campo invernale.' : summer ? ' Campo estivo.' : ''}${facts.dati_da_verificare.movimenti_senza_data ? `\n${facts.dati_da_verificare.movimenti_senza_data} movimenti senza data restano da verificare e sono esclusi dai totali dell’anno.` : ''}`
  }
  const matchingEvents = facts.eventi.filter(event => normalized(event.nome).length > 3 && text.includes(normalized(event.nome)) || winter && (event.tipo?.toUpperCase() === 'CI' || normalized(event.nome).includes('invernal')) || summer && (event.tipo?.toUpperCase() === 'CE' || normalized(event.nome).includes('estiv')))
  if (matchingEvents.length > 1) return `${heading}\nCi sono più eventi corrispondenti. Quale intendi?\n${matchingEvents.map(e => `- ${e.nome} (${e.data})`).join('\n')}`
  if (matchingEvents.length === 1) {
    const event = matchingEvents[0]
    const paymentMethod = /\bcontanti\b/.test(text) ? 'Contanti' : /\bbonific/.test(text) ? 'Bonifico' : /\bcarta\b/.test(text) ? 'Carta' : null
    if (paymentMethod) {
      const selected = event.partecipanti.filter(p => p.metodo === paymentMethod && p.quota > 0)
      const paid = selected.filter(p => p.pagato)
      return `${heading}\n**${event.nome}** · ${paymentMethod}\n- Paganti saldati: **${paid.length}**, incassato **${euro(sum(paid.map(p => p.quota)))}**\n- Da pagare: **${selected.filter(p => !p.pagato).length}**, **${euro(sum(selected.filter(p => !p.pagato).map(p => p.quota)))}**\n${selected.map(p => `- ${p.nome}: ${euro(p.quota)} · ${p.pagato ? 'pagato' : 'da pagare'}`).join('\n')}`
    }
    const unpaid = event.partecipanti.filter(p => !p.pagato && p.quota > 0)
    if (/pag|quota|incass|bonific|contanti|deve|devono/.test(text)) {
      return `${heading}\n**${event.nome}** (${event.data})\n- Presenti/pendolari: **${event.presenti}**\n- Quote pagate non gratuite: **${event.partecipanti.filter(p => p.pagato && p.quota > 0).length}**\n- Partecipanti a quota zero: **${event.gratuiti}**\n- Incassato: **${euro(event.incassato)}**\n- Da incassare: **${euro(event.da_incassare)}**\n${unpaid.length ? unpaid.map(p => `- ${p.nome}: ${euro(p.quota)} da pagare`).join('\n') : 'Nessuna quota da incassare tra i presenti registrati.'}`
    }
    return `${heading}\n**${event.nome}** (${event.data}): **${event.presenti} presenti/pendolari** su ${event.registrazioni} registrazioni.\n${event.partecipanti.map(p => `- ${p.nome}`).join('\n') || 'Non sono registrate presenze per questo evento.'}`
  }
  if (winter || summer) return `${heading}\nNon risultano eventi ${winter ? 'di campo invernale' : 'di campo estivo'} con una data in questo anno scout. Non posso ricavare presenze o pagamenti senza le registrazioni.`
  if (/\b(saldo|cassa|bilancio|banca|contanti)\b/.test(text)) {
    return `${heading}\n- Saldo totale: **${euro(facts.cassa.saldoFinaleTotale)}**\n- Contanti: **${euro(facts.cassa.saldoFinaleCassa)}**\n- Banca/carta: **${euro(facts.cassa.saldoFinaleBanca)}**\n- Entrate: **${euro(facts.cassa.entrate)}**\n- Uscite: **${euro(facts.cassa.uscite)}**\nSaldi iniziali inclusi: contanti ${euro(facts.periodo.initialCash)}, banca ${euro(facts.periodo.initialBank)}. Censimento ${facts.cassa.censimento_incluso ? 'incluso' : 'escluso'} dalle entrate.`
  }
  if (/eventi|uscite/.test(text) && /quant|qual|elenc|programm|ci sono/.test(text)) {
    const events = /uscite/.test(text) ? facts.eventi.filter(e => e.tipo?.toUpperCase() === 'USCITA') : facts.eventi
    return `${heading}\nRisultano **${events.length} ${/uscite/.test(text) ? 'uscite di reparto' : 'eventi'}**.\n${events.map(e => `- ${e.nome} (${e.data})`).join('\n') || 'Nessun evento registrato con data in questo anno.'}`
  }
  const people = facts.ragazzi.filter(p => text.includes(normalized(p.nome)))
  if (people.length === 1 && /pag|quota|censimento|deve|devono|pendenz/.test(text)) {
    const person = people[0]
    return `${heading}\n**${person.nome}**\n- Quote mensili scadute da pagare: **${euro(person.mensili_da_pagare)}**${person.quote_mensili.some(m => m.scaduto && !m.pagato) ? ` (${person.quote_mensili.filter(m => m.scaduto && !m.pagato).map(m => m.mese).join(', ')})` : ''}\n- Censimento, stato attuale: **${person.censimento_pagato ? 'saldato' : 'non saldato'}** (${euro(person.quota_censimento)})\n${facts.eventi.flatMap(e => e.partecipanti.filter(p => p.nome === person.nome).map(p => `- ${e.nome}: ${p.quota === 0 ? 'quota zero' : `${euro(p.quota)} · ${p.pagato ? 'pagato' : 'da pagare'}`}`)).join('\n')}`
  }
  if (/mensil|\bnovembre\b|\bdicembre\b|\bgennaio\b|\bfebbraio\b|\bmarzo\b|\baprile\b|\bmaggio\b|\bgiugno\b/.test(text) && /quota|pag|pendenz|manca/.test(text)) {
    const month = SCOUT_FEE_MONTHS.find(m => text.includes(m))
    const wantPaid = /chi.*ha pagato/.test(text) && !/non|manca/.test(text)
    const rows = facts.ragazzi.map(p => ({ person: p, months: p.quote_mensili.filter(m => (!month || m.mese === month) && (month ? true : m.scaduto) && m.pagato === wantPaid) })).filter(p => p.months.length)
    return `${heading}\n**${rows.length} ragazzi** con quote mensili ${wantPaid ? 'pagate' : 'non pagate'}${month ? ` di ${month}` : ' già scadute'}.\n${rows.map(({ person, months }) => `- ${person.nome}: ${months.map(m => `${m.mese}${m.scaduto ? '' : ' (non ancora scaduta)'}`).join(', ')}`).join('\n') || 'Nessuna corrispondenza.'}`
  }
  if (/censimento/.test(text)) return `${heading}\nCensimento, **stato attuale dell’anagrafica**: ${facts.ragazzi.filter(p => p.censimento_pagato).length} saldati, ${facts.ragazzi.filter(p => !p.censimento_pagato).length} non saldati.\n${facts.ragazzi.filter(p => !p.censimento_pagato).map(p => `- ${p.nome}: ${euro(p.quota_censimento)}`).join('\n')}\nIl censimento è ${facts.cassa.censimento_incluso ? 'incluso' : 'escluso'} dal computo delle entrate.`
  if (/ragazz|anagrafica|squadrigl/.test(text) && /quant|qual|elenc|ci sono/.test(text)) {
    const squad = facts.ragazzi.find(p => p.squadriglia && text.includes(normalized(p.squadriglia)))?.squadriglia
    const selected = squad ? facts.ragazzi.filter(p => p.squadriglia === squad) : facts.ragazzi
    return `${heading}\nL’anagrafica attuale contiene **${selected.length} ragazzi attivi**${squad ? ` nella squadriglia ${squad}` : ''}.\n${selected.map(p => `- ${p.nome}${p.squadriglia ? ` (${p.squadriglia})` : ''}`).join('\n')}`
  }
  return null
}

export function modelContext(facts: ScoutBotContext, message: string) {
  const words = normalized(message).split(/\W+/).filter(w => w.length > 3)
  const matching = facts.movimenti.filter(m => words.some(w => normalized(`${m.categoria} ${m.descrizione}`).includes(w)))
  return { ...facts, movimenti: (matching.length ? matching : facts.movimenti).slice(-30), nota_movimenti: `I totali e conteggi sono completi; qui sono riportati ${Math.min(matching.length || facts.movimenti.length, 30)} movimenti di esempio. Non usarli per ricalcolare i totali.` }
}
