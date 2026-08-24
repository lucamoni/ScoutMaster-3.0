import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ message: 'Sheets import route ready' })
}

export async function POST() {
  return NextResponse.json({ message: 'Sheets import trigger endpoint' })
}
