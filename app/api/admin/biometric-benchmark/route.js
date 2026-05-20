export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { getAdminSessionCookieName, parseAdminSessionCookieValue, resolveAdminSession } from '@/lib/admin-auth'
import { buildBiometricBenchmarkReport } from '@/lib/biometric-benchmark'
import { resolveReportWindow } from '@/lib/report-window'

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
    const now = Date.now()
    const window = resolveReportWindow(searchParams, { now, defaultDays: 14, maxDays: 62 })
    const limit = clamp(searchParams.get('limit') || 1200, 100, 2000)

    const [snapshot, personsSnapshot] = await Promise.all([
      db
        .collection('scan_events')
        .where('timestamp', '>=', window.startMs)
        .where('timestamp', '<', window.endMs)
        .orderBy('timestamp', 'desc')
        .limit(limit)
        .get(),
      db.collection('persons').get(),
    ])

    const currentEmployees = personsSnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter(person => person.active !== false)
      .filter(person => String(person.approvalStatus || 'approved') === 'approved')
      .filter(person => (
        resolvedSession.scope === 'regional'
          ? true
          : String(person.officeId || '') === String(resolvedSession.officeId || '')
      ))
    const currentEmployeeIds = currentEmployees.map(person => person.employeeId)

    const events = snapshot.docs
      .map(doc => doc.data())
      .filter(event => (
        resolvedSession.scope === 'regional'
          ? true
          : String(event?.officeId || '') === String(resolvedSession.officeId || '')
      ))

    return NextResponse.json({
      ok: true,
      report: buildBiometricBenchmarkReport(events, {
        days: window.windowDays,
        now,
        window,
        currentEmployeeIds,
      }),
      scope: {
        role: resolvedSession.role,
        scope: resolvedSession.scope,
        officeId: resolvedSession.officeId || '',
        currentApprovedActiveEmployees: currentEmployees.length,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to build biometric benchmark report.' },
      { status: 500 },
    )
  }
}
