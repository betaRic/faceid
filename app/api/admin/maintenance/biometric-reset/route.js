export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminDb } from '@/lib/firebase-admin'
import {
  getAdminSessionCookieName,
  isRegionalAdminSession,
  parseAdminSessionCookieValue,
  resolveAdminSession,
} from '@/lib/admin-auth'
import { writeAuditLog } from '@/lib/audit-log'
import { createOriginGuard } from '@/lib/csrf'

/**
 * Biometric-only reset: clears all face descriptors and biometric index
 * while preserving person records, attendance history, and office config.
 *
 * After this, all employees must re-enroll their faces.
 *
 * GET  — preview (counts what will be affected)
 * POST — execute (requires { "confirm": true })
 */

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

    const personsSnapshot = await db.collection('persons').get()
    let personsWithDescriptors = 0
    let totalSamples = 0
    for (const doc of personsSnapshot.docs) {
      const descriptors = doc.data().descriptors
      if (Array.isArray(descriptors) && descriptors.length > 0) {
        personsWithDescriptors++
        totalSamples += descriptors.length
      }
    }

    const indexSnapshot = await db.collection('biometric_index').count().get()
    const indexCount = indexSnapshot.data().count

    return NextResponse.json({
      ok: true,
      dryRun: true,
      message: `Will clear face data for ${personsWithDescriptors} employees (${totalSamples} samples) and ${indexCount} index entries. Person records, attendance, and offices are preserved. POST with { "confirm": true } to execute.`,
      affected: {
        personsWithDescriptors,
        totalSamples,
        biometricIndexEntries: indexCount,
      },
      preserved: ['persons (name, employeeId, officeId, etc.)', 'attendance', 'offices', 'admins'],
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to preview.' },
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

    const body = await request.json().catch(() => null)
    if (!body?.confirm) {
      return NextResponse.json(
        { ok: false, message: 'Send { "confirm": true } to confirm biometric reset. Use GET to preview.' },
        { status: 400 },
      )
    }

    // Step 1: Clear descriptors from all person records
    const personsSnapshot = await db.collection('persons').get()
    let clearedCount = 0
    for (const doc of personsSnapshot.docs) {
      const data = doc.data()
      if (Array.isArray(data.descriptors) && data.descriptors.length > 0) {
        await doc.ref.update({
          descriptors: [],
          biometricResetAt: FieldValue.serverTimestamp(),
        })
        clearedCount++
      }
    }

    // Step 2: Wipe the biometric index
    const indexDeleted = await deleteCollection(db, 'biometric_index')

    await writeAuditLog(db, {
      actorRole: resolvedSession.role,
      actorScope: resolvedSession.scope,
      actorOfficeId: resolvedSession.officeId,
      action: 'biometric_reset',
      targetType: 'system',
      targetId: 'biometric_index',
      officeId: '',
      summary: `Biometric reset: cleared descriptors for ${clearedCount} persons, deleted ${indexDeleted} index entries`,
      metadata: { clearedCount, indexDeleted },
    })

    return NextResponse.json({
      ok: true,
      message: `Biometric reset complete. ${clearedCount} employees need to re-enroll.`,
      clearedPersons: clearedCount,
      deletedIndexEntries: indexDeleted,
      nextSteps: [
        'All employees must re-enroll at /registration',
        'Approve enrollments in admin dashboard',
      ],
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to reset biometrics.' },
      { status: 500 },
    )
  }
}
