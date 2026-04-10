import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminDb } from '../../../lib/firebase-admin'
import { getAdminSessionCookieName, isRegionalAdminSession, parseAdminSessionCookieValue, resolveAdminSession } from '../../../lib/admin-auth'
import { listAdminProfiles } from '../../../lib/admin-directory'
import { writeAuditLog } from '../../../lib/audit-log'

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

export async function GET(request) {
  const session = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Admin login is required.' }, { status: 401 })
  }

  try {
    const db = getAdminDb()
    const resolvedSession = await resolveAdminSession(db, session)
    if (!resolvedSession) {
      return NextResponse.json({ ok: false, message: 'Admin session is no longer valid.' }, { status: 403 })
    }
    if (!isRegionalAdminSession(resolvedSession)) {
      return NextResponse.json({ ok: false, message: 'Regional admin access is required.' }, { status: 403 })
    }

    const admins = await listAdminProfiles(db)
    return NextResponse.json({ ok: true, admins })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to load admin records.' },
      { status: 500 },
    )
  }
}

export async function POST(request) {
  const session = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Admin login is required.' }, { status: 401 })
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
    if (!isRegionalAdminSession(resolvedSession)) {
      return NextResponse.json({ ok: false, message: 'Regional admin access is required.' }, { status: 403 })
    }

    const existing = await db.collection('admins').where('email', '==', body.email).limit(1).get()
    if (!existing.empty) {
      return NextResponse.json({ ok: false, message: 'An admin record already exists for that email.' }, { status: 409 })
    }

    const record = await db.collection('admins').add({
      email: body.email,
      displayName: body.displayName,
      scope: body.scope,
      officeId: body.scope === 'office' ? body.officeId : '',
      active: body.active,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })

    await writeAuditLog(db, {
      actorRole: resolvedSession.role,
      actorScope: resolvedSession.scope,
      actorOfficeId: resolvedSession.officeId,
      action: 'admin_create',
      targetType: 'admin',
      targetId: record.id,
      officeId: body.scope === 'office' ? body.officeId : '',
      summary: `Created admin record for ${body.email}`,
      metadata: {
        email: body.email,
        scope: body.scope,
      },
    })

    return NextResponse.json({ ok: true, id: record.id })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to create admin record.' },
      { status: 500 },
    )
  }
}

