export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'

// Authentication has one authoritative entry point. Keeping a separate HR
// login implementation created a shadow Firebase-era path with different
// rules and rate limits.
export async function POST() {
  return NextResponse.json({ ok: false, message: 'This endpoint has been retired. Use /api/login.' }, { status: 410 })
}
