import { NextResponse } from 'next/server'

export async function POST(request) {
  return NextResponse.json(
    { ok: false, message: 'PIN admin login has been removed. Use Google admin login instead.' },
    { status: 410 },
  )
}
