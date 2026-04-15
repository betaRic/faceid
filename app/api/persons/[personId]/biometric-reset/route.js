export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminDb } from '@/lib/firebase-admin'
import {
  adminSessionAllowsOffice,
  getAdminSessionCookieName,
  parseAdminSessionCookieValue,
  resolveAdminSession,
} from '@/lib/admin-auth'
import { deletePersonBiometricIndex } from '@/lib/biometric-index'
import { writeAuditLog } from '@/lib/audit-log'
import { createOriginGuard } from '@/lib/csrf'
import { PERSON_APPROVAL_PENDING } from '@/lib/person-approval'

/**
 * Admin-initiated biometric reset for a single employee.
 * Clears stored face descriptors and rebuilds (empties) their biometric index.
 * Sets approval back to pending — employee must re-enroll and be re-approved.
 *
 * POST /api/persons/[personId]/biometric-reset
 * Requires valid admin session cookie.
 */
export async function POST(request, { params }) {
  const guard = createOriginGuard()
  const originError = await guard(request)
  if (originError) return originError

  const { personId } = await params
  if (!personId) {
    return NextResponse.json({ ok: false, message: 'Missing person ID.' }, { status: 400 })
  }

  const session = parseAdminSessionCookieValue(
    request.cookies.get(getAdminSessionCookieName())?.value,
  )
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Admin login is required.' }, { status: 401 })
  }

  try {
    const db = getAdminDb()
    const resolvedSession = await resolveAdminSession(db, session)
    if (!resolvedSession) {
      return NextResponse.json({ ok: false, message: 'Admin session is no longer valid.' }, { status: 403 })
    }

    const personRef = db.collection('persons').doc(personId)
    const personDoc = await personRef.get()
    if (!personDoc.exists) {
      return NextResponse.json({ ok: false, message: 'Employee record not found.' }, { status: 404 })
    }

    const person = personDoc.data()
    if (!adminSessionAllowsOffice(resolvedSession, person.officeId)) {
      return NextResponse.json({ ok: false, message: 'This admin session cannot reset that employee.' }, { status: 403 })
    }

    const previousSampleCount = Array.isArray(person.descriptors) ? person.descriptors.length : 0

    await personRef.update({
      descriptors: [],
      sampleCount: 0,
      approvalStatus: PERSON_APPROVAL_PENDING,
      biometricResetAt: FieldValue.serverTimestamp(),
      biometricResetByEmail: resolvedSession.email || '',
    })

    await deletePersonBiometricIndex(db, personId)

    await writeAuditLog(db, {
      actorRole: resolvedSession.role,
      actorScope: resolvedSession.scope,
      actorOfficeId: resolvedSession.officeId,
      action: 'person_biometric_reset',
      targetType: 'person',
      targetId: personId,
      officeId: person.officeId || '',
      summary: `Biometric reset for ${person.name} — ${previousSampleCount} sample(s) cleared, set to pending re-enrollment`,
      metadata: {
        employeeId: person.employeeId || '',
        previousSampleCount,
        officeName: person.officeName || '',
      },
    })

    return NextResponse.json({
      ok: true,
      message: `Face data cleared. ${person.name} must re-enroll in admin or at /registration and be re-approved.`,
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Biometric reset failed.' },
      { status: 500 },
    )
  }
}
