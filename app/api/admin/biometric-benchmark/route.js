export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAdminSessionCookieName, parseAdminSessionCookieValue, resolveAdminSession } from '@/lib/admin-auth'
import { buildBiometricBenchmarkReport } from '@/lib/biometric-benchmark'
import { resolveReportWindow } from '@/lib/report-window'
import { postgresEnabled, queryPostgres } from '@/lib/postgres/client'

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0))
}

export async function GET(request) {
  const sessionValue = request.cookies.get(getAdminSessionCookieName())?.value
  const session = parseAdminSessionCookieValue(sessionValue)
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 })
  }

  const usePostgres = postgresEnabled()
  const db = null
  const resolvedSession = await resolveAdminSession(db, session)
  if (!resolvedSession) {
    return NextResponse.json({ ok: false, message: 'Session invalid' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const now = Date.now()
    const window = resolveReportWindow(searchParams, { now, defaultDays: 14, maxDays: 62 })
    const limit = clamp(searchParams.get('limit') || 1200, 100, 2000)

    if (usePostgres) {
      const [eventsResult, personsResult] = await Promise.all([
        queryPostgres(
          `
            SELECT *
            FROM scan_events
            WHERE timestamp_ms >= $1 AND timestamp_ms < $2
            ORDER BY timestamp_ms DESC
            LIMIT $3
          `,
          [window.startMs, window.endMs, limit],
        ),
        queryPostgres(
          `
            SELECT *
            FROM persons
            WHERE active = true AND approval_status = 'approved'
          `,
        ),
      ])

      const currentEmployees = personsResult.rows
        .map(row => ({
          employeeId: row.employee_id,
          officeId: row.office_id,
        }))
        .filter(person => (
          resolvedSession.scope === 'regional'
            ? true
            : String(person.officeId || '') === String(resolvedSession.officeId || '')
        ))
      const currentEmployeeIds = currentEmployees.map(person => person.employeeId)
      const events = eventsResult.rows
        .map(row => ({
          ...(row.data || {}),
          status: row.status,
          decisionCode: row.decision_code,
          reason: row.reason,
          timestamp: Number(row.timestamp_ms || 0),
          employeeId: row.employee_id,
          personId: row.person_id,
          name: row.name,
          officeId: row.office_id,
          officeName: row.office_name,
          attendanceMode: row.attendance_mode,
          geofenceStatus: row.geofence_status,
          riskFlags: row.risk_flags || [],
          captureContext: row.capture_context || {},
          scanDiagnostics: row.scan_diagnostics || {},
          performance: row.performance || {},
          matchDebug: row.match_debug || {},
        }))
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
    }

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

