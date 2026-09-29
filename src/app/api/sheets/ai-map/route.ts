import { NextResponse } from 'next/server'
import { google } from 'googleapis'
import { fetchPublicWorkbook } from '@/lib/googleSheetsPublic'
import { buildKnownSheetMapping } from '@/lib/googleSheetsMapping'
import { authorizationErrorResponse, requireRole } from '@/lib/security/auth'

export async function GET(request: Request) {
  try {
    await requireRole(['admin', 'capo', 'tesoriere'])
    const raw = new URL(request.url).searchParams.get('spreadsheetId') ?? ''
    const id = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1] ?? raw.trim()
    if (!/^[a-zA-Z0-9_-]{20,}$/.test(id)) return NextResponse.json({ error: 'ID Google Sheets non valido' }, { status: 400 })
    let workbook: Record<string, string[][]> = {}
    if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
      try {
        const auth = new google.auth.JWT({ email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'), scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] })
        const sheets = google.sheets({ version: 'v4', auth })
        const info = await sheets.spreadsheets.get({ spreadsheetId: id })
        for (const sheet of info.data.sheets ?? []) {
          const title = sheet.properties?.title
          if (!title) continue
          const data = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `'${title.replace(/'/g, "''")}'!1:4` })
          workbook[title] = (data.data.values ?? []).map(row => row.map(value => String(value ?? '')))
        }
      } catch { workbook = await fetchPublicWorkbook(id) }
    } else workbook = await fetchPublicWorkbook(id)
    const mappings = Object.entries(workbook).flatMap(([name, rows]) => {
      const mapping = buildKnownSheetMapping(name, rows[0] ?? [])
      return mapping ? [mapping] : []
    })
    const ignoredSheets = Object.keys(workbook).filter(name => !mappings.some(mapping => mapping.sheetName === name))
    return NextResponse.json({ success: true, mappings, ignoredSheets, sheetsData: Object.fromEntries(Object.entries(workbook).map(([name, rows]) => [name, rows.slice(0, 3)])) })
  } catch (error) {
    return authorizationErrorResponse(error) ?? NextResponse.json({ error: error instanceof Error ? error.message : 'Analisi non riuscita' }, { status: 500 })
  }
}
