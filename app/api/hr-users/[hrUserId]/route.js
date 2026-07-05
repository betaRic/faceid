export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAdminSessionCookieName, isRegionalAdminSession, parseAdminSessionCookieValue, resolveAdminSession } from '@/lib/admin-auth'
import { hashPin } from '@/lib/hr-auth'
import { writeAuditLog } from '@/lib/audit-log'
import { createOriginGuard } from '@/lib/csrf'
import { postgresEnabled } from '@/lib/postgres/client'
import {
  deleteLocalHrProfile,
  getLocalHrProfileById,
  localEmailExists,
  updateLocalHrProfile,
} from '@/lib/postgres/user-store'

function normalizeBody(body) {
  return {
    email: String(body?.email || '').trim().toLowerCase(),
    displayName: String(body?.displayName || '').trim(),
    scope: String(body?.scope || 'office').trim().toLowerCase() === 'regional' ? 'regional' : 'office',
    officeId: String(body?.officeId || '').trim(),
    pin: String(body?.pin || '').trim(),
    active: body?.active !== false,
  }
}

function validateBody(body) {
  if (!body.email) return 'Email is required.'
  if (!body.displayName) return 'Display name is required.'
  if (body.scope === 'office' && !body.officeId) return 'Office-scoped HR users require an office.'
  return null
}

export async function PUT(request, { params }) {
  const checkOrigin = createOriginGuard()
  const originError = await checkOrigin(request)
  if (originError) return originError

  const { hrUserId } = await params
  if (!hrUserId) {
    return NextResponse.json({ ok: false, message: 'Invalid request.' }, { status: 400 })
  }

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
    const usePostgres = postgresEnabled()
    const db = null
    const resolvedSession = await resolveAdminSession(db, session)
    if (!resolvedSession) {
      return NextResponse.json({ ok: false, message: 'Admin session is no longer valid.' }, { status: 403 })
    }
    if (!isRegionalAdminSession(resolvedSession)) {
      return NextResponse.json({ ok: false, message: 'Regional admin access is required.' }, { status: 403 })
    }

    const existing = usePostgres ? await getLocalHrProfileById(hrUserId) : await db.collection('hr_users').doc(hrUserId).get()
    if (usePostgres ? !existing : !existing.exists) {
      return NextResponse.json({ ok: false, message: 'HR user record was not found.' }, { status: 404 })
    }

    const duplicate = usePostgres
      ? await localEmailExists('hr_users', body.email, hrUserId)
      : (await db.collection('hr_users').where('email', '==', body.email).limit(2).get()).docs.some(record => record.id !== hrUserId)
    if (duplicate) {
      return NextResponse.json({ ok: false, message: 'Another HR user record already uses that email.' }, { status: 409 })
    }

    if (usePostgres) {
      await updateLocalHrProfile(hrUserId, body)
    } else {
      const updateData = {
        email: body.email,
        displayName: body.displayName,
        scope: body.scope,
        officeId: body.scope === 'office' ? body.officeId : '',
        active: body.active,
        updatedAt: FieldValue.serverTimestamp(),
      }

      if (body.pin) {
        updateData.pinHash = hashPin(body.pin)
      }

      await db.collection('hr_users').doc(hrUserId).set(updateData, { merge: true })
    }

    await writeAuditLog(db, {
      actorRole: resolvedSession.role,
      actorScope: resolvedSession.scope,
      actorOfficeId: resolvedSession.officeId,
      action: 'hr_user_update',
      targetType: 'hr_user',
      targetId: hrUserId,
      officeId: body.scope === 'office' ? body.officeId : '',
      summary: `Updated HR user record for ${body.email}`,
      metadata: {
        email: body.email,
        scope: body.scope,
        active: body.active,
      },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to update HR user record.' },
      { status: 500 },
    )
  }
}

export async function DELETE(request, { params }) {
  const checkOrigin = createOriginGuard()
  const originError = await checkOrigin(request)
  if (originError) return originError

  const { hrUserId } = await params
  if (!hrUserId) {
    return NextResponse.json({ ok: false, message: 'Invalid request.' }, { status: 400 })
  }

  const session = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Admin login is required.' }, { status: 401 })
  }

  try {
    const usePostgres = postgresEnabled()
    const db = null
    const resolvedSession = await resolveAdminSession(db, session)
    if (!resolvedSession) {
      return NextResponse.json({ ok: false, message: 'Admin session is no longer valid.' }, { status: 403 })
    }
    if (!isRegionalAdminSession(resolvedSession)) {
      return NextResponse.json({ ok: false, message: 'Regional admin access is required.' }, { status: 403 })
    }

    const existing = usePostgres ? await getLocalHrProfileById(hrUserId) : await db.collection('hr_users').doc(hrUserId).get()
    if (usePostgres ? !existing : !existing.exists) {
      return NextResponse.json({ ok: false, message: 'HR user record was not found.' }, { status: 404 })
    }

    const existingData = usePostgres ? existing : existing.data() || {}

    if (usePostgres) await deleteLocalHrProfile(hrUserId)
    else await db.collection('hr_users').doc(hrUserId).delete()

    await writeAuditLog(db, {
      actorRole: resolvedSession.role,
      actorScope: resolvedSession.scope,
      actorOfficeId: resolvedSession.officeId,
      action: 'hr_user_delete',
      targetType: 'hr_user',
      targetId: hrUserId,
      officeId: existingData.officeId || '',
      summary: `Deleted HR user record for ${existingData.email || hrUserId}`,
      metadata: {
        email: existingData.email || '',
      },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to delete HR user record.' },
      { status: 500 },
    )
  }
}

