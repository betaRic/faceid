import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminDb } from '../../../../lib/firebase-admin'
import { getAdminSessionCookieName, isRegionalAdminSession, parseAdminSessionCookieValue } from '../../../../lib/admin-auth'
import { writeAuditLog } from '../../../../lib/audit-log'
import { getActiveRegionalAdminCount } from '../../../../lib/admin-directory'

function normalizeBody(body) {
  return {
    email: String(body?.email || '').trim().toLowerCase(),
    displayName: String(body?.displayName || '').trim(),
    scope: String(body?.scope || 'office').trim().toLowerCase() === 'regional' ? 'regional' : 'office',
    officeId: String(body?.officeId || '').trim(),
    active: body?.active !== false,
  }
}

function validateBody(body) {
  if (!body.email) return 'Email is required.'
  if (body.scope === 'office' && !body.officeId) return 'Office-scoped admins require an office.'
  return null
}

export async function PUT(request, { params }) {
  const session = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
  if (!isRegionalAdminSession(session)) {
    return NextResponse.json({ ok: false, message: 'Regional admin access is required.' }, { status: 403 })
  }

  const body = normalizeBody(await request.json().catch(() => null))
  const validationError = validateBody(body)
  if (validationError) {
    return NextResponse.json({ ok: false, message: validationError }, { status: 400 })
  }

  try {
    const db = getAdminDb()
    const ref = db.collection('admins').doc(params.adminId)
    const existing = await ref.get()
    if (!existing.exists) {
      return NextResponse.json({ ok: false, message: 'Admin record was not found.' }, { status: 404 })
    }

    const duplicate = await db.collection('admins').where('email', '==', body.email).limit(2).get()
    if (duplicate.docs.some(record => record.id !== params.adminId)) {
      return NextResponse.json({ ok: false, message: 'Another admin record already uses that email.' }, { status: 409 })
    }

    const existingData = existing.data() || {}
    const wasActiveRegional = existingData.active !== false && String(existingData.scope || 'regional') !== 'office'
    const willBeActiveRegional = body.active !== false && body.scope !== 'office'

    if (wasActiveRegional && !willBeActiveRegional) {
      const remainingRegionalAdmins = await getActiveRegionalAdminCount(db, params.adminId)
      if (remainingRegionalAdmins === 0) {
        return NextResponse.json(
          { ok: false, message: 'You cannot remove or demote the last active regional admin.' },
          { status: 409 },
        )
      }
    }

    await ref.set({
      email: body.email,
      displayName: body.displayName,
      scope: body.scope,
      officeId: body.scope === 'office' ? body.officeId : '',
      active: body.active,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })

    await writeAuditLog(db, {
      actorRole: session.role,
      actorScope: session.scope,
      actorOfficeId: session.officeId,
      action: 'admin_update',
      targetType: 'admin',
      targetId: params.adminId,
      officeId: body.scope === 'office' ? body.officeId : '',
      summary: `Updated admin record for ${body.email}`,
      metadata: {
        email: body.email,
        scope: body.scope,
        active: body.active,
      },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to update admin record.' },
      { status: 500 },
    )
  }
}

export async function DELETE(request, { params }) {
  const session = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
  if (!isRegionalAdminSession(session)) {
    return NextResponse.json({ ok: false, message: 'Regional admin access is required.' }, { status: 403 })
  }

  try {
    const db = getAdminDb()
    const ref = db.collection('admins').doc(params.adminId)
    const existing = await ref.get()
    if (!existing.exists) {
      return NextResponse.json({ ok: false, message: 'Admin record was not found.' }, { status: 404 })
    }

    const existingData = existing.data() || {}
    const isActiveRegional = existingData.active !== false && String(existingData.scope || 'regional') !== 'office'
    if (isActiveRegional) {
      const remainingRegionalAdmins = await getActiveRegionalAdminCount(db, params.adminId)
      if (remainingRegionalAdmins === 0) {
        return NextResponse.json(
          { ok: false, message: 'You cannot delete the last active regional admin.' },
          { status: 409 },
        )
      }
    }

    await ref.delete()

    await writeAuditLog(db, {
      actorRole: session.role,
      actorScope: session.scope,
      actorOfficeId: session.officeId,
      action: 'admin_delete',
      targetType: 'admin',
      targetId: params.adminId,
      officeId: existingData.officeId || '',
      summary: `Deleted admin record for ${existingData.email || params.adminId}`,
      metadata: {
        email: existingData.email || '',
      },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to delete admin record.' },
      { status: 500 },
    )
  }
}
