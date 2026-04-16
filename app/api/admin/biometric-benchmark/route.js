export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { getAdminSessionCookieName, parseAdminSessionCookieValue, resolveAdminSession } from '@/lib/admin-auth'
import { buildBiometricBenchmarkReport } from '@/lib/biometric-benchmark'

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0))
}

export async function GET(request) {
  const sessionValue = request.cookies.get(getAdminSessionCookieName())?.value
  const session = parseAdminSessionCookieValue(sessionValue)
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 })
  }

  const db = getAdminDb()
  const resolvedSession = await resolveAdminSession(db, session)
  if (!resolvedSession) {
    return NextResponse.json({ ok: false, message: 'Session invalid' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const days = clamp(searchParams.get('days') || 14, 1, 30)
    const limit = clamp(searchParams.get('limit') || 1200, 100, 2000)
    const minTimestamp = Date.now() - (days * 24 * 60 * 60 * 1000)

    const snapshot = await db
      .collection('scan_events')
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .get()

    const events = snapshot.docs
      .map(doc => doc.data())
      .filter(event => Number(event?.timestamp || 0) >= minTimestamp)
      .filter(event => (
        resolvedSession.scope === 'regional'
          ? true
          : String(event?.officeId || '') === String(resolvedSession.officeId || '')
      ))

    return NextResponse.json({
      ok: true,
      report: buildBiometricBenchmarkReport(events, { days, now: Date.now() }),
      scope: {
        role: resolvedSession.role,
        scope: resolvedSession.scope,
        officeId: resolvedSession.officeId || '',
      },
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to build biometric benchmark report.' },
      { status: 500 },
    )
  }
}
