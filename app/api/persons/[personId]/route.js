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

export async function DELETE(request, { params }) {
  const checkOrigin = createOriginGuard()
  const originError = await checkOrigin(request)
  if (originError) return originError

  const { personId } = await params

  if (!personId) {
    return NextResponse.json({ ok: false, message: 'Invalid request.' }, { status: 400 })
  }

  const session = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Admin login is required to delete employees.' }, { status: 401 })
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

    if (!adminSessionAllowsOffice(resolvedSession, existing.data().officeId)) {
      return NextResponse.json({ ok: false, message: 'This admin session cannot delete that employee.' }, { status: 403 })
    }

    await db.collection('persons').doc(personId).delete()
    await deletePersonBiometricIndex(db, personId)
    await writeAuditLog(db, {
      actorRole: resolvedSession.role,
      actorScope: resolvedSession.scope,
      actorOfficeId: resolvedSession.officeId,
      action: 'person_delete',
      targetType: 'person',
      targetId: personId,
      officeId: existing.data().officeId || '',
      summary: `Deleted employee record for ${existing.data().name || personId}`,
      metadata: {
        employeeId: existing.data().employeeId || '',
        officeName: existing.data().officeName || '',
      },
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to delete employee.' },
      { status: 500 },
    )
  }
}
