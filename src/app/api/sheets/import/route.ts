import { NextResponse } from 'next/server'
import { authorizationErrorResponse, requireRole } from '@/lib/security/auth'

export async function GET() {
  try {
    await requireRole(['admin', 'capo', 'tesoriere'])
    return NextResponse.json(
      { error: 'Importazione Google Sheets non ancora configurata: usa prima la mappatura AI nelle Impostazioni.' },
      { status: 501 }
    )
  } catch (error: unknown) {
    return authorizationErrorResponse(error) || NextResponse.json({ error: 'Errore interno server' }, { status: 500 })
  }
}

export async function POST() {
  try {
    await requireRole(['admin', 'capo', 'tesoriere'])
    return NextResponse.json(
      { error: 'Importazione Google Sheets non ancora configurata: usa prima la mappatura AI nelle Impostazioni.' },
      { status: 501 }
    )
  } catch (error: unknown) {
    return authorizationErrorResponse(error) || NextResponse.json({ error: 'Errore interno server' }, { status: 500 })
  }
}
