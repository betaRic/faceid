export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { createOriginGuard } from '@/lib/csrf'
import { consumeAttendanceChallenge } from '@/lib/attendance-challenge'
import { processAttendanceSubmission } from '@/lib/attendance/process'
import { getRequestIp } from '@/lib/rate-limit'

export async function POST(request) {
  try {
    const guard = createOriginGuard()
    const originError = await guard(request)
    if (originError) return originError

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ ok: false, message: 'Invalid request body.' }, { status: 400 })
    }

    const db = getAdminDb()
    const challengeResult = await consumeAttendanceChallenge(db, body.challenge, {
      kioskId: body?.kioskContext?.kioskId,
      source: body?.kioskContext?.source || 'web-scan',
      userAgent: request.headers.get('user-agent') || '',
      clientIp: getRequestIp(request),
      clientKey: body?.kioskContext?.clientKey || body?.captureContext?.clientKey || '',
    })

    if (!challengeResult.ok) {
      return NextResponse.json(
        {
          ok: false,
          message: challengeResult.message,
          decisionCode: challengeResult.decisionCode,
        },
        { status: 403 },
      )
    }

    return await processAttendanceSubmission({
      db,
      request,
      body: {
        ...body,
        verificationMode: 'challenge_v2',
      },
      consumedChallenge: challengeResult.challenge,
    })
  } catch (error) {
    console.error('[attendance/v2] Unhandled error:', error)
    return NextResponse.json(
      {
        ok: false,
        message: 'Attendance service encountered an unexpected error. Please try again.',
        decisionCode: 'blocked_server_error',
      },
      { status: 500 },
    )
  }
}
