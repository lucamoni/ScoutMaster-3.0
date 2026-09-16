export interface NormalizedDocumentData {
  nome: string | null
  cognome: string | null
  pattuglia: string | null
  sesso: 'M' | 'F' | null
  data_nascita: string | null
  codice_fiscale: string | null
  telefono_ragazzo: string | null
  genitore_1_nome: string | null
  genitore_1_telefono: string | null
  genitore_2_nome: string | null
  genitore_2_telefono: string | null
  tipo_documento_riconosciuto: string | null
  foglio_privacy_firmato: boolean
  scheda_medica_ci: boolean
  scheda_medica_ce: boolean
  ricevuta_censimento: boolean
}

const text = (value: unknown) => {
  if (typeof value !== 'string') return null
  const normalized = value.trim().replace(/\s+/g, ' ')
  return normalized || null
}

const date = (value: unknown) => {
  const candidate = text(value)
  if (!candidate) return null
  const match = candidate.match(/^(\d{4})-(\d{2})-(\d{2})$/) || candidate.match(/^(\d{2})[\/. -](\d{2})[\/. -](\d{4})$/)
  if (!match) return null
  const iso = match[1].length === 4 ? candidate : \`${match[3]}-${match[2]}-${match[1]}\`
  const parsed = new Date(\`${iso}T00:00:00Z\`)
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso ? null : iso
}

const phone = (value: unknown) => {
  const candidate = text(value)
  if (!candidate) return null
  const digits = candidate.replace(/\D/g, '')
  return digits.length >= 6 && digits.length <= 15 ? digits : null
}

export function normalizeDocumentData(input: unknown): NormalizedDocumentData {
  const source = input && typeof input === 'object' ? input as Record<string, unknown> : {}
  const sesso = text(source.sesso)?.toUpperCase()
  const codice = text(source.codice_fiscale)?.replace(/\s/g, '').toUpperCase()

  return {
    nome: text(source.nome),
    cognome: text(source.cognome),
    pattuglia: text(source.pattuglia),
    sesso: sesso === 'M' || sesso === 'F' ? sesso : null,
    data_nascita: date(source.data_nascita),
    codice_fiscale: codice && /^[A-Z0-9]{16}$/.test(codice) ? codice : null,
    telefono_ragazzo: phone(source.telefono_ragazzo),
    genitore_1_nome: text(source.genitore_1_nome),
    genitore_1_telefono: phone(source.genitore_1_telefono),
    genitore_2_nome: text(source.genitore_2_nome),
    genitore_2_telefono: phone(source.genitore_2_telefono),
    tipo_documento_riconosciuto: text(source.tipo_documento_riconosciuto),
    foglio_privacy_firmato: source.foglio_privacy_firmato === true,
    scheda_medica_ci: source.scheda_medica_ci === true,
    scheda_medica_ce: source.scheda_medica_ce === true,
    ricevuta_censimento: source.ricevuta_censimento === true,
  }
}
