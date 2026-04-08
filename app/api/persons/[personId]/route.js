import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminDb } from '../../../../lib/firebase-admin'
import {
  adminSessionAllowsOffice,
  getAdminSessionCookieName,
  parseAdminSessionCookieValue,
} from '../../../../lib/admin-auth'
import { writeAuditLog } from '../../../../lib/audit-log'
import { deletePersonBiometricIndex, syncPersonBiometricIndex } from '../../../../lib/biometric-index'

function normalizeBody(body) {
  return {
    name: String(body?.name || '').trim(),
    officeId: String(body?.officeId || '').trim(),
    officeName: String(body?.officeName || '').trim(),
    active: body?.active !== false,
  }
}

function validateBody(body) {
  if (!body.name) return 'Employee name is required.'
  if (!body.officeId || !body.officeName) return 'Assigned office is required.'
  return null
}

export async function PUT(request, { params }) {
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
    const existing = await db.collection('persons').doc(params.personId).get()
    if (!existing.exists) {
      return NextResponse.json({ ok: false, message: 'Employee record was not found.' }, { status: 404 })
    }

    const existingData = existing.data()
    if (!adminSessionAllowsOffice(session, existingData.officeId) || !adminSessionAllowsOffice(session, body.officeId)) {
      return NextResponse.json({ ok: false, message: 'This admin session cannot update that employee.' }, { status: 403 })
    }

    const nextPerson = {
      ...existingData,
      ...body,
      nameLower: body.name.toLowerCase(),
      updatedAt: FieldValue.serverTimestamp(),
    }

    await db.collection('persons').doc(params.personId).set(nextPerson, { merge: true })
    await syncPersonBiometricIndex(db, params.personId, nextPerson)

    await writeAuditLog(db, {
      actorRole: session.role,
      actorScope: session.scope,
      actorOfficeId: session.officeId,
      action: 'person_update',
      targetType: 'person',
      targetId: params.personId,
      officeId: body.officeId,
      summary: `Updated employee record for ${body.name}`,
      metadata: {
        employeeId: existingData.employeeId || '',
        officeName: body.officeName,
        active: body.active,
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
  const session = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Admin login is required to delete employees.' }, { status: 401 })
  }

  try {
    const db = getAdminDb()
    const existing = await db.collection('persons').doc(params.personId).get()
    if (!existing.exists) {
      return NextResponse.json({ ok: false, message: 'Employee record was not found.' }, { status: 404 })
    }

    if (!adminSessionAllowsOffice(session, existing.data().officeId)) {
      return NextResponse.json({ ok: false, message: 'This admin session cannot delete that employee.' }, { status: 403 })
    }

    await db.collection('persons').doc(params.personId).delete()
    await deletePersonBiometricIndex(db, params.personId)
    await writeAuditLog(db, {
      actorRole: session.role,
      actorScope: session.scope,
      actorOfficeId: session.officeId,
      action: 'person_delete',
      targetType: 'person',
      targetId: params.personId,
      officeId: existing.data().officeId || '',
      summary: `Deleted employee record for ${existing.data().name || params.personId}`,
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
