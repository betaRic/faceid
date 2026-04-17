export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { createOriginGuard } from '@/lib/csrf'

export async function POST(request) {
  const guard = createOriginGuard()
  const originError = await guard(request)
  if (originError) return originError

  return NextResponse.json(
    {
      ok: false,
      message: 'Direct attendance submissions are no longer accepted on this endpoint. Use /api/attendance/v2.',
      decisionCode: 'blocked_legacy_attendance_route',
    },
    { status: 410 },
  )
}
