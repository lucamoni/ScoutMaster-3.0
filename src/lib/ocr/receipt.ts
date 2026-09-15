export type ReceiptOcrResult = {
  provider: 'paddleocr-browser'
  importo: number | null
  data: string | null
  fornitore: string | null
  voce_spesa: string | null
  confidence: number
  raw_text: string
}

type PaddleModule = typeof import('@paddleocr/paddleocr-js')
type PaddleEngine = Awaited<ReturnType<PaddleModule['PaddleOCR']['create']>>

let enginePromise: Promise<PaddleEngine> | null = null

const getEngine = () => {
  if (!enginePromise) {
    enginePromise = import('@paddleocr/paddleocr-js').then(({ PaddleOCR }) => {
      return PaddleOCR.create({
        textDetectionModelName: 'PP-OCRv6_tiny_det',
        textRecognitionModelName: 'PP-OCRv6_tiny_rec',
        ortOptions: { backend: 'auto' },
      })
    })
  }
  return enginePromise
}

const parseItalianAmount = (raw: string) => {
  const compact = raw.replace(/\s/g, '')
  if (compact.includes(',')) return Number(compact.replace(/\./g, '').replace(',', '.'))
  return Number(compact)
}

const extractAmount = (lines: string[]) => {
  const amountPattern = /(?<!\d)(\d{1,3}(?:\.\d{3})*,\d{2}|\d{1,6}[.,]\d{2})(?!\d)/g
  const totalWords = ['totale', 'total', 'importo', 'da pagare', 'pagato']
  const excludedWords = ['subtotale', 'iva', 'imponibile', 'resto', 'sconto']
  const candidates: Array<{ priority: number; line: number; value: number }> = []

  lines.forEach((text, line) => {
    const normalized = text.toLowerCase()
    if (excludedWords.some(word => normalized.includes(word))) return
    const priority = totalWords.some(word => normalized.includes(word)) ? 2 : 1
    for (const match of text.matchAll(amountPattern)) {
      const value = parseItalianAmount(match[1])
      if (Number.isFinite(value) && value > 0 && value < 100000) {
        candidates.push({ priority, line, value })
      }
    }
  })

  candidates.sort((a, b) => a.priority - b.priority || a.line - b.line || a.value - b.value)
  return candidates.at(-1)?.value ?? null
}

const extractDate = (lines: string[]) => {
  for (const text of lines) {
    const italian = text.match(/(?<!\d)(\d{2})[./-](\d{2})[./-](\d{2,4})(?!\d)/)
    const iso = text.match(/(?<!\d)(\d{4})[./-](\d{2})[./-](\d{2})(?!\d)/)
    const parts = italian
      ? [Number(italian[3]) < 100 ? 2000 + Number(italian[3]) : Number(italian[3]), Number(italian[2]), Number(italian[1])]
      : iso
        ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
        : null
    if (!parts) continue

    const [year, month, day] = parts
    const value = new Date(Date.UTC(year, month - 1, day))
    const valid = value.getUTCFullYear() === year && value.getUTCMonth() === month - 1 && value.getUTCDate() === day
    if (valid && year >= 2000 && value.getTime() <= Date.now()) {
      return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
    }
  }
  return null
}

const extractSupplier = (lines: string[]) => {
  const ignored = ['scontrino', 'documento commerciale', 'partita iva', 'p.iva', 'codice fiscale', 'totale']
  return lines.slice(0, 10).find(text => {
    const normalized = text.trim().toLowerCase()
    return text.trim().length >= 3 && /[a-zà-ÿ]/i.test(text) && !ignored.some(word => normalized.includes(word))
  })?.trim().slice(0, 120) ?? null
}

const chooseCategory = (lines: string[], categories: string[]) => {
  if (categories.length === 0) return null
  const text = lines.join(' ').toLowerCase()
  const find = (documentWords: string[], categoryWords: string[]) => {
    if (!documentWords.some(word => text.includes(word))) return null
    return categories.find(category => categoryWords.some(word => category.toLowerCase().includes(word))) ?? null
  }
  return find(
    ['aliment', 'supermerc', 'market', 'coop', 'conad', 'esselunga', 'pane', 'frutta'],
    ['kambu', 'aliment', 'vitto', 'cibo'],
  ) ?? find(
    ['ferrament', 'brico', 'leroy', 'legno', 'vite', 'utensil', 'attrezz'],
    ['materiale', 'attrezz', 'ferrament'],
  ) ?? categories.find(category => category.toLowerCase() === 'altro') ?? categories[0]
}

export async function scanReceiptLocally(file: File, categories: string[]): Promise<ReceiptOcrResult> {
  const engine = await getEngine()
  const [result] = await engine.predict(file, { textRecScoreThresh: 0.35 })
  const items = result?.items ?? []
  const lines = items.map(item => item.text.trim()).filter(Boolean)
  if (lines.length === 0) throw new Error('Nessun testo riconosciuto')

  const confidence = items.length > 0
    ? items.reduce((sum, item) => sum + item.score, 0) / items.length
    : 0

  return {
    provider: 'paddleocr-browser',
    importo: extractAmount(lines),
    data: extractDate(lines),
    fornitore: extractSupplier(lines),
    voce_spesa: chooseCategory(lines, categories),
    confidence: Number(confidence.toFixed(4)),
    raw_text: lines.join('\n').slice(0, 12000),
  }
}
