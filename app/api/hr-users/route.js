export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAdminSessionCookieName, isRegionalAdminSession, parseAdminSessionCookieValue, resolveAdminSession } from '@/lib/admin-auth'
import { listHrProfiles } from '@/lib/hr-directory'
import { getOfficeRecord } from '@/lib/office-directory'
import { validateHrOfficeAssignment } from '@/lib/hr-scope'
import { writeAuditLog } from '@/lib/audit-log'
import { createOriginGuard } from '@/lib/csrf'
import { serverErrorResponse } from '@/lib/http/server-error'
import { createLocalHrProfile, localEmailExists } from '@/lib/postgres/user-store'

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
  if (!/^\d{4,8}$/.test(body.pin)) return 'PIN must be 4 to 8 digits.'
  return null
}

export async function GET(request) {
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

    const hrUsers = await listHrProfiles(db)
    return NextResponse.json({ ok: true, hrUsers })
  } catch (error) {
    return serverErrorResponse(error, {
      context: 'api/hr-users:GET',
      publicMessage: 'Failed to load HR user records.',
    })
  }
}

export async function POST(request) {
  const checkOrigin = createOriginGuard()
  const originError = await checkOrigin(request)
  if (originError) return originError

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
    const db = null
    const resolvedSession = await resolveAdminSession(db, session)
    if (!resolvedSession) {
      return NextResponse.json({ ok: false, message: 'Admin session is no longer valid.' }, { status: 403 })
    }
    if (!isRegionalAdminSession(resolvedSession)) {
      return NextResponse.json({ ok: false, message: 'Regional admin access is required.' }, { status: 403 })
    }

    const office = await getOfficeRecord(null, body.officeId)
    const assignmentError = validateHrOfficeAssignment(body.scope, office)
    if (assignmentError) {
      return NextResponse.json({ ok: false, message: assignmentError }, { status: 400 })
    }

    const exists = body.email && await localEmailExists('hr_users', body.email)
    if (exists) {
      return NextResponse.json({ ok: false, message: 'An HR user record already exists for that email.' }, { status: 409 })
    }

    const recordId = await createLocalHrProfile(body)

    await writeAuditLog(db, {
      actorRole: resolvedSession.role,
      actorScope: resolvedSession.scope,
      actorOfficeId: resolvedSession.officeId,
      action: 'hr_user_create',
      targetType: 'hr_user',
      targetId: recordId,
      officeId: body.officeId,
      summary: `Created HR user record for ${body.email}`,
      metadata: {
        email: body.email,
        scope: body.scope,
      },
    })

    return NextResponse.json({ ok: true, id: recordId })
  } catch (error) {
    return serverErrorResponse(error, {
      context: 'api/hr-users:POST',
      publicMessage: 'Failed to create HR user record.',
    })
  }
}

