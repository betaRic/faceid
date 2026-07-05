export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createOriginGuard } from '@/lib/csrf'
import { touchKioskDevice } from '@/lib/kiosk-devices'
import { prepareAttendanceChallenge } from '@/lib/attendance/process'
import { postgresEnabled } from '@/lib/postgres/client'

export async function POST(request) {
  const guard = createOriginGuard()
  const originError = await guard(request)
  if (originError) return originError

  try {
    const body = await request.json().catch(() => ({}))
    const kioskContext = body?.kioskContext && typeof body.kioskContext === 'object' ? body.kioskContext : {}
    const db = null
    touchKioskDevice(db, {
      ...kioskContext,
      userAgent: request.headers.get('user-agent') || '',
    }).catch(() => {})
    const { challenge, riskFlags } = await prepareAttendanceChallenge({
      db,
      request,
      body: {
        ...body,
        verificationMode: 'challenge_v2',
      },
    })
    return NextResponse.json({ ok: true, challenge, riskFlags })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to issue attendance challenge.' },
      { status: 500 },
    )
  }
}

