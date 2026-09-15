export function parseSheetAmount(value: unknown) {
  const raw = String(value ?? '').trim().replace(/\s/g, '')
  if (!raw) return null
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw
  const amount = Number(normalized.replace(/[^\d.-]/g, ''))
  return Number.isFinite(amount) && amount > 0 ? amount : null
}

export function parseSheetDate(value: unknown) {
  const isValidDate = (year: number, month: number, day: number) => {
    const date = new Date(Date.UTC(year, month - 1, day))
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  }
  const raw = String(value ?? '').trim()
  const italian = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/)
  const iso = raw.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/)
  if (italian) {
    const year = Number(italian[3]) < 100 ? 2000 + Number(italian[3]) : Number(italian[3])
    const result = `${year.toString().padStart(4, '0')}-${italian[2].padStart(2, '0')}-${italian[1].padStart(2, '0')}`
    return isValidDate(year, Number(italian[2]), Number(italian[1])) ? result : null
  }
  if (iso) {
    const result = `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`
    return isValidDate(Number(iso[1]), Number(iso[2]), Number(iso[3])) ? result : null
  }
  return null
}
