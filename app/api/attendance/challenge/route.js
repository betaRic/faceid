import { NextResponse } from 'next/server'
import { getAdminDb } from '../../../../lib/firebase-admin'
import { issueAttendanceChallenge } from '../../../../lib/attendance-challenge'

export async function POST(request) {
  try {
    const body = await request.json().catch(() => null)
    const db = getAdminDb()
    const challenge = await issueAttendanceChallenge(db, {
      source: body?.source,
      deviceLabel: body?.deviceLabel,
    })

    return NextResponse.json({
      ok: true,
      challenge,
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to issue attendance challenge.' },
      { status: 500 },
    )
  }
}
