export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { resolveEmployeeManagementSession, sessionAllowsOffice } from '@/lib/employee-access'
import { deletePersonBiometricIndex } from '@/lib/biometric-index'
import { writeAuditLog } from '@/lib/audit-log'
import { createOriginGuard } from '@/lib/csrf'
import { syncPersonBiometricsRecord } from '@/lib/person-biometrics'
import { PERSON_APPROVAL_PENDING } from '@/lib/person-approval'
import { postgresEnabled } from '@/lib/postgres/client'
import { getLocalPersonById, resetLocalPersonBiometrics } from '@/lib/postgres/person-store'

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

  try {
    const usePostgres = postgresEnabled()
    const db = null
    const resolvedSession = await resolveEmployeeManagementSession(request, db)
    if (!resolvedSession) {
      return NextResponse.json({ ok: false, message: 'Admin or HR employee-management access is required.' }, { status: 403 })
    }

    const personRef = usePostgres ? null : db.collection('persons').doc(personId)
    const personDoc = usePostgres ? await getLocalPersonById(personId) : await personRef.get()
    if (usePostgres ? !personDoc : !personDoc.exists) {
      return NextResponse.json({ ok: false, message: 'Employee record not found.' }, { status: 404 })
    }

    const person = usePostgres ? personDoc : personDoc.data()
    if (!sessionAllowsOffice(resolvedSession, person.officeId)) {
      return NextResponse.json({ ok: false, message: 'This session cannot reset that employee.' }, { status: 403 })
    }

    const previousSampleCount = Array.isArray(person.descriptors) ? person.descriptors.length : 0

    if (usePostgres) {
      await resetLocalPersonBiometrics(personId)
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
    }

    await personRef.update({
      descriptors: [],
      sampleCount: 0,
      approvalStatus: PERSON_APPROVAL_PENDING,
      needsReenrollment: true,
      biometricResetAt: FieldValue.serverTimestamp(),
      biometricResetByEmail: resolvedSession.email || '',
    })

    await deletePersonBiometricIndex(db, personId, { officeIds: [person.officeId] })
    try {
      await syncPersonBiometricsRecord(db, personId, {
        ...person,
        descriptors: [],
        sampleCount: 0,
        approvalStatus: PERSON_APPROVAL_PENDING,
        needsReenrollment: true,
      })
    } catch (err) {
      console.warn(`[BiometricReset] person_biometrics sync failed for ${personId}:`, err?.message)
    }

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

