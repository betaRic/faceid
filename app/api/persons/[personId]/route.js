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
import { writeAuditLog } from '@/lib/audit-log'
import { deletePersonBiometricIndex, syncPersonBiometricIndex } from '@/lib/biometric-index'
import { getOfficeRecord } from '@/lib/office-directory'
import { createOriginGuard } from '@/lib/csrf'
import { resolveEmployeeManagementSession, sessionAllowsOffice } from '@/lib/employee-access'
import { deletePersonBiometricsRecord, syncPersonBiometricsRecord } from '@/lib/person-biometrics'
import { kvDel, kvKeys } from '@/lib/kv-utils'
import { deleteEnrollmentPhoto } from '@/lib/storage'
import {
  getEffectivePersonApprovalStatus,
  PERSON_APPROVAL_APPROVED,
  PERSON_APPROVAL_PENDING,
  PERSON_APPROVAL_REJECTED,
  normalizePersonApprovalStatus,
} from '@/lib/person-approval'

function normalizeBody(body) {
  return {
    name: String(body?.name || '').trim(),
    officeId: String(body?.officeId || '').trim(),
    officeName: String(body?.officeName || '').trim(),
    active: body?.active !== false,
    approvalStatus: typeof body?.approvalStatus === 'string'
      ? normalizePersonApprovalStatus(body?.approvalStatus, '')
      : '',
  }
}

function validateBody(body) {
  if (!body.name) return 'Employee name is required.'
  if (!body.officeId) return 'Assigned office is required.'
  if (body.approvalStatus && ![
    PERSON_APPROVAL_PENDING,
    PERSON_APPROVAL_APPROVED,
    PERSON_APPROVAL_REJECTED,
  ].includes(body.approvalStatus)) return 'Approval status is not valid.'
  return null
}

async function commitDeleteBatch(db, refs) {
  if (!refs.length) return 0
  let deleted = 0
  for (let index = 0; index < refs.length; index += 400) {
    const batch = db.batch()
    refs.slice(index, index + 400).forEach(ref => {
      batch.delete(ref)
      deleted += 1
    })
    await batch.commit()
  }
  return deleted
}

async function invalidateDeletedEmployeeCaches(employeeId, officeId) {
  const keys = []
  if (employeeId) {
    const attendanceKeys = await kvKeys(`attendance:logs:${employeeId}:*`)
    keys.push(...attendanceKeys)
  }
  if (officeId) {
    keys.push(`bioidx:${officeId}`)
  }
  await Promise.all(Array.from(new Set(keys)).map(key => kvDel(key)))
}

export async function PUT(request, { params }) {
  const checkOrigin = createOriginGuard()
  const originError = await checkOrigin(request)
  if (originError) return originError

  const { personId } = await params

  if (!personId) {
    return NextResponse.json({ ok: false, message: 'Invalid request.' }, { status: 400 })
  }

  const session = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Admin login is required to update employees.' }, { status: 401 })
  }

  const body = normalizeBody(await request.json().catch(() => null))
  const validationError = validateBody(body)
  if (validationError) {
    return NextResponse.json({ ok: false, message: validationError }, { status: 400 })
  }

  try {
    const db = getAdminDb()
    const resolvedSession = await resolveAdminSession(db, session)
    if (!resolvedSession) {
      return NextResponse.json({ ok: false, message: 'Admin session is no longer valid.' }, { status: 403 })
    }

    const existing = await db.collection('persons').doc(personId).get()
    if (!existing.exists) {
      return NextResponse.json({ ok: false, message: 'Employee record was not found.' }, { status: 404 })
    }

    const office = await getOfficeRecord(db, body.officeId)
    if (!office) {
      return NextResponse.json({ ok: false, message: 'Assigned office was not found.' }, { status: 400 })
    }

    const existingData = existing.data()
    if (!adminSessionAllowsOffice(resolvedSession, existingData.officeId) || !adminSessionAllowsOffice(resolvedSession, office.id)) {
      return NextResponse.json({ ok: false, message: 'This admin session cannot update that employee.' }, { status: 403 })
    }

    const previousApprovalStatus = getEffectivePersonApprovalStatus(existingData)
    const nextApprovalStatus = body.approvalStatus || previousApprovalStatus
    const approvalChanged = previousApprovalStatus !== nextApprovalStatus
    const approvalUpdatedAt = approvalChanged ? FieldValue.serverTimestamp() : existingData.approvalUpdatedAt
    const approvalUpdatedByEmail = approvalChanged ? resolvedSession.email : existingData.approvalUpdatedByEmail
    const approvedAt = approvalChanged
      ? nextApprovalStatus === PERSON_APPROVAL_APPROVED
        ? FieldValue.serverTimestamp()
        : previousApprovalStatus === PERSON_APPROVAL_APPROVED
          ? FieldValue.delete()
          : existingData.approvedAt
      : existingData.approvedAt

    const officeChanged = existingData.officeId !== office.id
    const nextPerson = {
      ...existingData,
      ...body,
      officeId: office.id,
      officeName: office.name,
      nameLower: body.name.toLowerCase(),
      updatedAt: FieldValue.serverTimestamp(),
      approvalStatus: nextApprovalStatus,
      approvalUpdatedAt,
      approvalUpdatedByEmail,
      approvedAt,
    }

    await db.collection('persons').doc(personId).set(nextPerson, { merge: true })
    await syncPersonBiometricIndex(db, personId, nextPerson)
    try {
      await syncPersonBiometricsRecord(db, personId, nextPerson)
    } catch (err) {
      console.warn(`[PersonUpdate] person_biometrics sync failed for ${personId}:`, err?.message)
    }

    const action = approvalChanged
      ? nextApprovalStatus === PERSON_APPROVAL_APPROVED
        ? 'person_approve'
        : nextApprovalStatus === PERSON_APPROVAL_REJECTED
          ? 'person_reject'
          : 'person_review_reset'
      : officeChanged
        ? 'person_transfer'
        : 'person_update'

    const summary = approvalChanged
      ? nextApprovalStatus === PERSON_APPROVAL_APPROVED
        ? `Approved employee enrollment for ${body.name}`
        : nextApprovalStatus === PERSON_APPROVAL_REJECTED
          ? `Rejected employee enrollment for ${body.name}`
          : `Returned employee enrollment to pending review for ${body.name}`
      : officeChanged
        ? `Transferred ${body.name} from ${existingData.officeName || 'unknown'} to ${office.name}`
        : `Updated employee record for ${body.name}`

    await writeAuditLog(db, {
      actorRole: resolvedSession.role,
      actorScope: resolvedSession.scope,
      actorOfficeId: resolvedSession.officeId,
      action,
      targetType: 'person',
      targetId: personId,
      officeId: office.id,
      summary,
      metadata: {
        employeeId: existingData.employeeId || '',
        officeName: office.name,
        active: body.active,
        approvalStatus: nextApprovalStatus,
        ...(officeChanged && {
          previousOffice: existingData.officeName || existingData.officeId || 'unknown',
          previousOfficeId: existingData.officeId || '',
        }),
      },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to update employee.' },
      { status: 500 },
    )
  }
}

async function hardDeleteEmployee(db, resolvedSession, personId, personData) {
  const personIdStr = String(personId)
  const employeeIdStr = String(personData.employeeId || '')
  const officeIdStr = String(personData.officeId || '')
  const biometricDeleted = Array.isArray(personData.descriptors) ? personData.descriptors.length : 0

  const entriesToDelete = await Promise.all([
    employeeIdStr ? db.collection('attendance').where('employeeId', '==', employeeIdStr).get() : Promise.resolve({ empty: true, docs: [] }),
    employeeIdStr ? db.collection('attendance_daily').where('employeeId', '==', employeeIdStr).get() : Promise.resolve({ empty: true, docs: [] }),
    employeeIdStr ? db.collection('attendance_locks').where('employeeId', '==', employeeIdStr).get() : Promise.resolve({ empty: true, docs: [] }),
    db.collection('person_enrollment_locks').where('personId', '==', personIdStr).get(),
  ])

  const attendanceRefs = entriesToDelete[0].docs.map(doc => doc.ref)
  const attendanceDailyRefs = entriesToDelete[1].docs.map(doc => doc.ref)
  const attendanceLockRefs = entriesToDelete[2].docs.map(doc => doc.ref)
  const enrollmentLockRefs = entriesToDelete[3].docs.map(doc => doc.ref)

  if (employeeIdStr) {
    attendanceLockRefs.push(db.collection('attendance_locks').doc(employeeIdStr))
    enrollmentLockRefs.push(db.collection('person_enrollment_locks').doc(employeeIdStr))
  }

  await deletePersonBiometricIndex(db, personIdStr)
  await deletePersonBiometricsRecord(db, personIdStr)
  const attendanceDeleted = await commitDeleteBatch(db, attendanceRefs)
  const attendanceDailyDeleted = await commitDeleteBatch(db, attendanceDailyRefs)
  const attendanceLocksDeleted = await commitDeleteBatch(db, Array.from(new Map(attendanceLockRefs.map(ref => [ref.path, ref])).values()))
  const enrollmentLocksDeleted = await commitDeleteBatch(db, Array.from(new Map(enrollmentLockRefs.map(ref => [ref.path, ref])).values()))
  await db.collection('persons').doc(personIdStr).delete()

  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  const photoDeleted = storageBucket ? await deleteEnrollmentPhoto(storageBucket, personIdStr) : false
  await invalidateDeletedEmployeeCaches(employeeIdStr, officeIdStr)

  await writeAuditLog(db, {
    actorRole: resolvedSession.role,
    actorScope: resolvedSession.scope,
    actorOfficeId: resolvedSession.officeId,
    action: 'person_hard_delete',
    targetType: 'person',
    targetId: personIdStr,
    officeId: officeIdStr,
    summary: `Hard deleted employee ${personData.name || personIdStr} and all related data`,
    metadata: {
      employeeId: employeeIdStr,
      officeName: personData.officeName || '',
      biometricDeleted,
      attendanceDeleted,
      attendanceDailyDeleted,
      attendanceLocksDeleted,
      enrollmentLocksDeleted,
      photoDeleted,
    },
  })

  return {
    biometricDeleted,
    attendanceDeleted,
    attendanceDailyDeleted,
    attendanceLocksDeleted,
    enrollmentLocksDeleted,
    photoDeleted,
  }
}

export async function DELETE(request, { params }) {
  const checkOrigin = createOriginGuard()
  const originError = await checkOrigin(request)
  if (originError) return originError

  const { personId } = await params

  if (!personId) {
    return NextResponse.json({ ok: false, message: 'Invalid request.' }, { status: 400 })
  }

  const { searchParams } = new URL(request.url)
  const hardDelete = searchParams.get('hard') === 'true'
  const confirmName = String(searchParams.get('confirm') || '').trim().toLowerCase()

  try {
    const db = getAdminDb()
    const resolvedSession = await resolveEmployeeManagementSession(request, db)
    if (!resolvedSession) {
      return NextResponse.json({ ok: false, message: 'Admin or HR login with employee access is required to delete employees.' }, { status: 401 })
    }

    const existing = await db.collection('persons').doc(personId).get()
    if (!existing.exists) {
      return NextResponse.json({ ok: false, message: 'Employee record was not found.' }, { status: 404 })
    }

    const personData = existing.data()
    if (!personData) {
      return NextResponse.json({ ok: false, message: 'Employee record was not found.' }, { status: 404 })
    }

    if (!sessionAllowsOffice(resolvedSession, personData.officeId)) {
      return NextResponse.json({ ok: false, message: 'This session cannot delete that employee.' }, { status: 403 })
    }

    if (hardDelete) {
      if (!confirmName) {
        return NextResponse.json({ ok: false, message: 'Employee name confirmation is required for hard delete.' }, { status: 400 })
      }
      const employeeName = String(personData.name || '').trim().toLowerCase()
      if (confirmName !== employeeName) {
        return NextResponse.json({ ok: false, message: 'Employee name does not match. Hard delete requires exact name confirmation.' }, { status: 400 })
      }

      const deletedCounts = await hardDeleteEmployee(db, resolvedSession, personId, personData)
      return NextResponse.json({ ok: true, hardDeleted: true, deletedCounts })
    }

    await db.collection('persons').doc(personId).delete()
    await deletePersonBiometricIndex(db, personId)
    await deletePersonBiometricsRecord(db, personId)
    await writeAuditLog(db, {
      actorRole: resolvedSession.role,
      actorScope: resolvedSession.scope,
      actorOfficeId: resolvedSession.officeId,
      action: 'person_delete',
      targetType: 'person',
      targetId: personId,
      officeId: personData.officeId || '',
      summary: `Deleted employee record for ${personData.name || personId}`,
      metadata: {
        employeeId: personData.employeeId || '',
        officeName: personData.officeName || '',
      },
    })
    return NextResponse.json({ ok: true, hardDeleted: false })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to delete employee.' },
      { status: 500 },
    )
  }
}
