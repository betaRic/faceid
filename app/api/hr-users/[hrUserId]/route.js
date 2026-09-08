export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAdminSessionCookieName, isRegionalAdminSession, parseAdminSessionCookieValue, resolveAdminSession } from '@/lib/admin-auth'
import { writeAuditLog } from '@/lib/audit-log'
import { createOriginGuard } from '@/lib/csrf'
import { serverErrorResponse } from '@/lib/http/server-error'
import { getOfficeRecord } from '@/lib/office-directory'
import { validateHrOfficeAssignment } from '@/lib/hr-scope'
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
  if (!body.displayName) return 'Display name is required.'
  if (!body.officeId) return 'An assigned office is required for every HR account.'
  if (body.pin && !/^\d{4,8}$/.test(body.pin)) return 'PIN must be 4 to 8 digits.'
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

  try {
    const db = null
    const resolvedSession = await resolveAdminSession(db, session)
    if (!resolvedSession) {
      return NextResponse.json({ ok: false, message: 'Admin session is no longer valid.' }, { status: 403 })
    }
    if (!isRegionalAdminSession(resolvedSession)) {
      return NextResponse.json({ ok: false, message: 'Regional admin access is required.' }, { status: 403 })
    }

    const existing = await getLocalHrProfileById(hrUserId)
    if (!existing) {
      return NextResponse.json({ ok: false, message: 'HR user record was not found.' }, { status: 404 })
    }

    const supplied = await request.json().catch(() => null)
    if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied)) {
      return NextResponse.json({ ok: false, message: 'A valid HR user update is required.' }, { status: 400 })
    }
    const body = normalizeBody({
      ...existing,
      ...Object.fromEntries(
        ['email', 'displayName', 'scope', 'officeId', 'pin', 'active']
          .filter(field => Object.hasOwn(supplied, field))
          .map(field => [field, supplied[field]]),
      ),
    })
    const validationError = validateBody(body)
    if (validationError) {
      return NextResponse.json({ ok: false, message: validationError }, { status: 400 })
    }

    const office = await getOfficeRecord(null, body.officeId)
    const assignmentError = validateHrOfficeAssignment(body.scope, office)
    if (assignmentError) {
      return NextResponse.json({ ok: false, message: assignmentError }, { status: 400 })
    }

    const duplicate = body.email && await localEmailExists('hr_users', body.email, hrUserId)
    if (duplicate) {
      return NextResponse.json({ ok: false, message: 'Another HR user record already uses that email.' }, { status: 409 })
    }

    await updateLocalHrProfile(hrUserId, body)

    await writeAuditLog(db, {
      actorRole: resolvedSession.role,
      actorScope: resolvedSession.scope,
      actorOfficeId: resolvedSession.officeId,
      action: 'hr_user_update',
      targetType: 'hr_user',
      targetId: hrUserId,
      officeId: body.officeId,
      summary: `Updated HR user record for ${body.email}`,
      metadata: {
        email: body.email,
        scope: body.scope,
        active: body.active,
      },
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    return serverErrorResponse(error, {
      context: 'api/hr-users/[hrUserId]:PUT',
      publicMessage: 'Failed to update HR user record.',
    })
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
    const db = null
    const resolvedSession = await resolveAdminSession(db, session)
    if (!resolvedSession) {
      return NextResponse.json({ ok: false, message: 'Admin session is no longer valid.' }, { status: 403 })
    }
    if (!isRegionalAdminSession(resolvedSession)) {
      return NextResponse.json({ ok: false, message: 'Regional admin access is required.' }, { status: 403 })
    }

    const existing = await getLocalHrProfileById(hrUserId)
    if (!existing) {
      return NextResponse.json({ ok: false, message: 'HR user record was not found.' }, { status: 404 })
    }

    const existingData = existing

    await deleteLocalHrProfile(hrUserId)

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
    return serverErrorResponse(error, {
      context: 'api/hr-users/[hrUserId]:DELETE',
      publicMessage: 'Failed to delete HR user record.',
    })
  }
}

