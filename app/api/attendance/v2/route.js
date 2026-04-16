export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { consumeAttendanceChallenge } from '@/lib/attendance-challenge'
import { POST as legacyAttendancePost } from '../route'

export async function POST(request) {
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ ok: false, message: 'Invalid request body.' }, { status: 400 })
  }

  const db = getAdminDb()
  const challengeResult = await consumeAttendanceChallenge(db, body.challenge, {
    kioskId: body?.kioskContext?.kioskId,
    source: body?.kioskContext?.source || 'web-kiosk',
    userAgent: request.headers.get('user-agent') || '',
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

  const forwardedRequest = new Request(request.url.replace(/\/v2(?:\?.*)?$/, ''), {
    method: 'POST',
    headers: new Headers(request.headers),
    body: JSON.stringify({
      ...body,
      verificationMode: 'challenge_v2',
    }),
  })

  return legacyAttendancePost(forwardedRequest)
}
