const ALLOWED_HOSTS = new Set(['buonacaccia.net', 'www.buonacaccia.net'])
const MAX_HTML_BYTES = 1_000_000
const REQUEST_TIMEOUT_MS = 8_000

export async function fetchBuonaCacciaHtml(input: string) {
  let url: URL

  try {
    url = new URL(input)
  } catch {
    throw new Error('URL non valido')
  }

  if (
    url.protocol !== 'https:' ||
    !ALLOWED_HOSTS.has(url.hostname.toLowerCase()) ||
    (url.port && url.port !== '443') ||
    url.username ||
    url.password
  ) {
    throw new Error('Sono consentiti solo URL HTTPS di buonacaccia.net')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'ScoutMaster/3.0',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'manual',
      signal: controller.signal,
      cache: 'no-store',
    })

    if (response.status >= 300 && response.status < 400) {
      throw new Error('Redirect esterni non consentiti')
    }

    if (!response.ok) {
      throw new Error(`Download non riuscito (HTTP ${response.status})`)
    }

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      throw new Error('Il contenuto remoto non è HTML')
    }

    const declaredLength = Number(response.headers.get('content-length') || 0)
    if (declaredLength > MAX_HTML_BYTES) {
      throw new Error('Pagina remota troppo grande')
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('Risposta remota vuota')

    const chunks: Uint8Array[] = []
    let totalBytes = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > MAX_HTML_BYTES) {
        await reader.cancel()
        throw new Error('Pagina remota troppo grande')
      }
      chunks.push(value)
    }

    const merged = new Uint8Array(totalBytes)
    let offset = 0
    for (const chunk of chunks) {
      merged.set(chunk, offset)
      offset += chunk.byteLength
    }

    return new TextDecoder().decode(merged)
  } finally {
    clearTimeout(timeout)
  }
}
