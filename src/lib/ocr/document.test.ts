import { describe, expect, it } from 'vitest'
import { normalizeDocumentData } from './document'

describe('normalizeDocumentData', () => {
  it('normalizes OCR text and accepts valid fields', () => {
    expect(normalizeDocumentData({ nome: '  Luca   ', sesso: 'm', data_nascita: '2010-02-03', telefono_ragazzo: '+39 333 1234567', codice_fiscale: 'RSSMRA10A01H501U', scheda_medica_ci: true })).toMatchObject({ nome: 'Luca', sesso: 'M', data_nascita: '2010-02-03', telefono_ragazzo: '393331234567', codice_fiscale: 'RSSMRA10A01H501U', scheda_medica_ci: true })
  })

  it('rejects malformed dates, tax codes and phones', () => {
    expect(normalizeDocumentData({ data_nascita: '03/02/2010', codice_fiscale: 'x', telefono_ragazzo: '12' })).toMatchObject({ data_nascita: null, codice_fiscale: null, telefono_ragazzo: null })
  })
})
