export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import {
  getAdminSessionCookieName,
  isRegionalAdminSession,
  parseAdminSessionCookieValue,
  resolveAdminSession,
} from '@/lib/admin-auth'
import { createOriginGuard } from '@/lib/csrf'
import { writeAuditLog } from '@/lib/audit-log'
import { countLocalRowsBefore, deleteLocalRowsBefore } from '@/lib/postgres/report-store'

function toNumber(value, fallback) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

export async function GET(request) {
  const session = parseAdminSessionCookieValue(
    request.cookies.get(getAdminSessionCookieName())?.value,
  )
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Admin login is required.' }, { status: 401 })
  }

  try {
    const db = null
    const resolvedSession = await resolveAdminSession(db, session)
    if (!resolvedSession || !isRegionalAdminSession(resolvedSession)) {
      return NextResponse.json({ ok: false, message: 'Regional admin access is required.' }, { status: 403 })
    }

    const url = new URL(request.url)
    const retentionDays = Math.max(7, Math.min(365, toNumber(url.searchParams.get('days'), 30)))
    const cutoff = Date.now() - (retentionDays * 24 * 60 * 60 * 1000)

    const counts = await countLocalRowsBefore(cutoff)

    return NextResponse.json({
      ok: true,
      retentionDays,
      cutoff,
      deletable: {
        scanEvents: Number(counts.scan_events || 0),
        attendanceChallenges: Number(counts.attendance_challenges || 0),
      },
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to preview scan retention.' },
      { status: 500 },
    )
  }
}

export async function POST(request) {
  const guard = createOriginGuard()
  const originError = await guard(request)
  if (originError) return originError

  const session = parseAdminSessionCookieValue(
    request.cookies.get(getAdminSessionCookieName())?.value,
  )
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Admin login is required.' }, { status: 401 })
  }

  try {
    const db = null
    const resolvedSession = await resolveAdminSession(db, session)
    if (!resolvedSession || !isRegionalAdminSession(resolvedSession)) {
      return NextResponse.json({ ok: false, message: 'Regional admin access is required.' }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    if (!body?.confirm) {
      return NextResponse.json({ ok: false, message: 'Send { "confirm": true } to prune old telemetry.' }, { status: 400 })
    }

    const retentionDays = Math.max(7, Math.min(365, toNumber(body?.days, 30)))
    const cutoff = Date.now() - (retentionDays * 24 * 60 * 60 * 1000)

    const deleted = await deleteLocalRowsBefore(cutoff)
    const deletedScanEvents = Number(deleted.scanEventsDeleted || 0)
    const deletedChallenges = Number(deleted.attendanceChallengesDeleted || 0)

    await writeAuditLog(db, {
      actorRole: resolvedSession.role,
      actorScope: resolvedSession.scope,
      actorOfficeId: resolvedSession.officeId,
      action: 'scan_event_retention_prune',
      targetType: 'system',
      targetId: 'scan_events',
      officeId: '',
      summary: `Pruned telemetry older than ${retentionDays} day(s)`,
      metadata: {
        retentionDays,
        deletedScanEvents,
        deletedChallenges,
      },
    })

    return NextResponse.json({
      ok: true,
      retentionDays,
      deletedScanEvents,
      deletedChallenges,
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to prune old telemetry.' },
      { status: 500 },
    )
  }
}

