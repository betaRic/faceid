export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import {
  getAdminSessionCookieName,
  isRegionalAdminSession,
  parseAdminSessionCookieValue,
  resolveAdminSession,
} from '@/lib/admin-auth'
import { writeAuditLog } from '@/lib/audit-log'
import { createOriginGuard } from '@/lib/csrf'
import { enforceRateLimit, getRequestIp } from '@/lib/rate-limit'

// Collections that are NEVER deleted
const PROTECTED_COLLECTIONS = new Set([
  'offices',
  'admins',
])

// Collections that ARE deleted during reset
const RESET_COLLECTIONS = [
  'persons',
  'person_biometrics',
  'biometric_index',
  'attendance',
  'attendance_daily',
  'attendance_locks',
  'attendance_challenges',
  'audit_logs',
  'scan_events',
  'person_enrollment_locks',
]

const PREVIEW_LIMIT = { limit: 6, windowMs: 60 * 60 * 1000 }
const EXECUTE_LIMIT = { limit: 2, windowMs: 60 * 60 * 1000 }

async function deleteCollection(db, collectionName, batchSize = 200) {
  const collectionRef = db.collection(collectionName)
  let deleted = 0

  while (true) {
    const snapshot = await collectionRef.limit(batchSize).get()
    if (snapshot.empty) break

    const batch = db.batch()
    snapshot.docs.forEach(doc => batch.delete(doc.ref))
    await batch.commit()
    deleted += snapshot.size
  }

  return deleted
}

/**
 * GET  — preview what will be deleted (dry run)
 * POST — actually wipe the data (requires confirm=true in body)
 */

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

    const previewLimit = await enforceRateLimit(db, {
      key: `maint-reset-preview:${resolvedSession.email || resolvedSession.adminId || getRequestIp(request)}`,
      ...PREVIEW_LIMIT,
    })
    if (!previewLimit.ok) {
      return NextResponse.json(
        { ok: false, message: 'Too many reset previews. Wait before trying again.' },
        { status: 429 },
      )
    }

    // Count documents in each collection
    const counts = {}
    for (const name of RESET_COLLECTIONS) {
      const snapshot = await db.collection(name).count().get()
      counts[name] = snapshot.data().count
    }

    // Also count protected collections for reference
    const protectedCounts = {}
    for (const name of PROTECTED_COLLECTIONS) {
      const snapshot = await db.collection(name).count().get()
      protectedCounts[name] = snapshot.data().count
    }

    const totalToDelete = Object.values(counts).reduce((s, c) => s + c, 0)

    return NextResponse.json({
      ok: true,
      dryRun: true,
      message: `This will delete ${totalToDelete} documents across ${RESET_COLLECTIONS.length} collections. POST with { "confirm": true } to execute.`,
      willDelete: counts,
      willKeep: protectedCounts,
      protectedCollections: Array.from(PROTECTED_COLLECTIONS),
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to preview reset.' },
      { status: 500 },
    )
  }
}

export async function POST(request) {
  const checkOrigin = createOriginGuard()
  const originError = await checkOrigin(request)
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

    const executeLimit = await enforceRateLimit(db, {
      key: `maint-reset-execute:${resolvedSession.email || resolvedSession.adminId || getRequestIp(request)}`,
      ...EXECUTE_LIMIT,
    })
    if (!executeLimit.ok) {
      return NextResponse.json(
        { ok: false, message: 'Too many reset attempts. Wait before trying again.' },
        { status: 429 },
      )
    }

    const body = await request.json().catch(() => null)
    if (!body?.confirm) {
      return NextResponse.json(
        { ok: false, message: 'Send { "confirm": true } to confirm data reset. Use GET to preview what will be deleted.' },
        { status: 400 },
      )
    }

    const results = {}
    let totalDeleted = 0

    for (const name of RESET_COLLECTIONS) {
      const deleted = await deleteCollection(db, name)
      results[name] = deleted
      totalDeleted += deleted
    }

    // Write audit log AFTER the wipe (audit_logs was just cleared, this is the first entry)
    await writeAuditLog(db, {
      actorRole: resolvedSession.role,
      actorScope: resolvedSession.scope,
      actorOfficeId: resolvedSession.officeId,
      action: 'system_reset',
      targetType: 'system',
      targetId: 'firestore',
      officeId: '',
      summary: `System reset: deleted ${totalDeleted} documents across ${RESET_COLLECTIONS.length} collections`,
      metadata: {
        deletedByCollection: results,
        totalDeleted,
        protectedCollections: Array.from(PROTECTED_COLLECTIONS),
      },
    })

    return NextResponse.json({
      ok: true,
      message: `Reset complete. Deleted ${totalDeleted} documents.`,
      deleted: results,
      totalDeleted,
      kept: Array.from(PROTECTED_COLLECTIONS),
      nextSteps: [
        'Re-enroll employees at /registration',
        'Approve enrollments in admin dashboard',
        'No biometric index rebuild is needed after a full reset because persons and index rows were deleted together',
      ],
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to reset system.' },
      { status: 500 },
    )
  }
}
