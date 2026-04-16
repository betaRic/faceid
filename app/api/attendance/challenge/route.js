export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { createOriginGuard } from '@/lib/csrf'
import { issueAttendanceChallenge } from '@/lib/attendance-challenge'

export async function POST(request) {
  const guard = createOriginGuard()
  const originError = await guard(request)
  if (originError) return originError

  try {
    const body = await request.json().catch(() => ({}))
    const kioskContext = body?.kioskContext && typeof body.kioskContext === 'object' ? body.kioskContext : {}
    const db = getAdminDb()
    const challenge = await issueAttendanceChallenge(db, {
      kioskId: kioskContext.kioskId,
      source: kioskContext.source || 'web-kiosk',
      userAgent: request.headers.get('user-agent') || '',
    })
    return NextResponse.json({ ok: true, challenge })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to issue attendance challenge.' },
      { status: 500 },
    )
  }
}
