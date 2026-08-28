export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAdminSessionCookieName, parseAdminSessionCookieValue, resolveAdminSession } from '@/lib/admin-auth'
import { buildMaintenanceEvidenceReport } from '@/lib/maintenance/event-evidence'
import { buildSystemEvidence } from '@/lib/maintenance/system-evidence'
import { resolveReportWindow } from '@/lib/report-window'
import { queryPostgres } from '@/lib/postgres/client'

const MAINTENANCE_EVENT_DETAIL_LIMIT = 1200

function mapScanEvent(row = {}) {
  return {
    ...(row.data || {}),
    status: row.status,
    decisionCode: row.decision_code,
    timestamp: Number(row.timestamp_ms || 0),
    employeeId: row.employee_id,
    personId: row.person_id,
    officeId: row.office_id,
    attendanceMode: row.attendance_mode,
    riskFlags: row.risk_flags || [],
    captureContext: row.capture_context || {},
    scanDiagnostics: row.scan_diagnostics || {},
    performance: row.performance || {},
    matchDebug: row.match_debug || {},
  }
}

async function loadRegionalSystemEvidence() {
  try {
    return await buildSystemEvidence({ query: queryPostgres })
  } catch (error) {
    console.error('[maintenance-evidence] system evidence unavailable', {
      code: error?.code,
      name: error?.name,
    })
    return { status: 'unknown', unavailable: true }
  }
}

export async function GET(request) {
  const sessionValue = request.cookies.get(getAdminSessionCookieName())?.value
  const session = parseAdminSessionCookieValue(sessionValue)
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 })
  }

  const db = null
  const resolvedSession = await resolveAdminSession(db, session)
  if (!resolvedSession) {
    return NextResponse.json({ ok: false, message: 'Session invalid' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const now = Date.now()
    const window = resolveReportWindow(searchParams, { now, defaultDays: 14, maxDays: 62 })
    const officeId = resolvedSession.scope === 'office'
      ? String(resolvedSession.officeId || '')
      : ''
    const eventParams = [window.startMs, window.endMs, officeId]
    const eventWhere = `
      timestamp_ms >= $1
      AND timestamp_ms < $2
      AND (
        $3 = ''
        OR COALESCE(
          NULLIF(match_debug->>'officeId', ''),
          NULLIF(office_id, '')
        ) = $3
      )
    `

    const [countResult, eventsResult, personsResult, system] = await Promise.all([
        queryPostgres(
          `SELECT count(*)::integer AS count FROM scan_events WHERE ${eventWhere}`,
          eventParams,
        ),
        queryPostgres(
          `
            SELECT
              status,
              decision_code,
              timestamp_ms,
              employee_id,
              person_id,
              office_id,
              attendance_mode,
              risk_flags,
              capture_context,
              scan_diagnostics,
              performance,
              match_debug,
              data
            FROM scan_events
            WHERE ${eventWhere}
            ORDER BY timestamp_ms DESC
            LIMIT $4
          `,
          [...eventParams, MAINTENANCE_EVENT_DETAIL_LIMIT],
        ),
        queryPostgres(
          `
            SELECT id, employee_id, office_id
            FROM persons
            WHERE active = true AND approval_status = 'approved'
              AND ($1 = '' OR office_id = $1)
          `,
          [officeId],
        ),
        resolvedSession.scope === 'regional' ? loadRegionalSystemEvidence() : null,
      ])

      const currentEmployees = personsResult.rows
        .map(row => ({
          personId: row.id,
          employeeId: row.employee_id,
          officeId: row.office_id,
        }))
      const events = eventsResult.rows.map(mapScanEvent)
      const report = buildMaintenanceEvidenceReport(events, {
        now,
        window,
        totalWindowEvents: Number(countResult.rows[0]?.count || 0),
        currentEmployees,
      })

    return NextResponse.json({
      ok: true,
      ...report,
      system,
      scope: {
        role: resolvedSession.role,
        scope: resolvedSession.scope,
        officeId: resolvedSession.officeId || '',
        currentApprovedActiveEmployees: currentEmployees.length,
      },
    })
  } catch (error) {
    console.error('[maintenance-evidence] report failed', {
      code: error?.code,
      name: error?.name,
    })
    return NextResponse.json(
      { ok: false, message: 'Failed to build maintenance evidence report.' },
      { status: 500 },
    )
  }
}

