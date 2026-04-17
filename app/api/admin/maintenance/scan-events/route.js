export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import {
  getAdminSessionCookieName,
  isRegionalAdminSession,
  parseAdminSessionCookieValue,
  resolveAdminSession,
} from '@/lib/admin-auth'
import { createOriginGuard } from '@/lib/csrf'
import { writeAuditLog } from '@/lib/audit-log'

function toNumber(value, fallback) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

async function countOlderThan(db, collectionName, field, cutoff) {
  const snapshot = await db.collection(collectionName).where(field, '<', cutoff).count().get()
  return snapshot.data().count
}

async function deleteOlderThan(db, collectionName, field, cutoff, batchSize = 200) {
  let deleted = 0
  while (true) {
    const snapshot = await db
      .collection(collectionName)
      .where(field, '<', cutoff)
      .limit(batchSize)
      .get()
    if (snapshot.empty) break
    const batch = db.batch()
    snapshot.docs.forEach(record => batch.delete(record.ref))
    await batch.commit()
    deleted += snapshot.size
  }
  return deleted
}

export async function GET(request) {
  const session = parseAdminSessionCookieValue(
    request.cookies.get(getAdminSessionCookieName())?.value,
  )
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Admin login is required.' }, { status: 401 })
  }

  try {
    const db = getAdminDb()
    const resolvedSession = await resolveAdminSession(db, session)
    if (!resolvedSession || !isRegionalAdminSession(resolvedSession)) {
      return NextResponse.json({ ok: false, message: 'Regional admin access is required.' }, { status: 403 })
    }

    const url = new URL(request.url)
    const retentionDays = Math.max(7, Math.min(365, toNumber(url.searchParams.get('days'), 30)))
    const cutoff = Date.now() - (retentionDays * 24 * 60 * 60 * 1000)

    const [scanEvents, attendanceChallenges] = await Promise.all([
      countOlderThan(db, 'scan_events', 'timestamp', cutoff),
      countOlderThan(db, 'attendance_challenges', 'expiresAtMs', cutoff),
    ])

    return NextResponse.json({
      ok: true,
      retentionDays,
      cutoff,
      deletable: {
        scanEvents,
        attendanceChallenges,
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
    const db = getAdminDb()
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

    const [deletedScanEvents, deletedChallenges] = await Promise.all([
      deleteOlderThan(db, 'scan_events', 'timestamp', cutoff),
      deleteOlderThan(db, 'attendance_challenges', 'expiresAtMs', cutoff),
    ])

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
