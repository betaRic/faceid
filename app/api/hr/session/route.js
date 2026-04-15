export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { createHrSessionCookieValue, getHrSessionCookieName, getHrSessionMaxAge, parseHrSessionCookieValue, resolveHrSession, sessionNeedsRefresh, sessionTimeRemaining } from '@/lib/hr-auth'
import { getHrProfileById } from '@/lib/hr-directory'

export async function GET(request) {
  const cookieValue = request.cookies.get(getHrSessionCookieName())?.value
  const session = parseHrSessionCookieValue(cookieValue)

  if (!session) {
    return NextResponse.json({ ok: false, message: 'HR login is required.' }, { status: 401 })
  }

  try {
    const db = getAdminDb()
    const resolvedSession = await resolveHrSession(db, session)

    if (!resolvedSession) {
      return NextResponse.json({ ok: false, message: 'HR session is no longer valid.' }, { status: 401 })
    }

    if (!resolvedSession.active) {
      return NextResponse.json({ ok: false, message: 'HR account is disabled.' }, { status: 401 })
    }

    const profile = await getHrProfileById(db, resolvedSession.hrUserId)

    const response = NextResponse.json({
      ok: true,
      hrUser: {
        id: resolvedSession.hrUserId,
        email: resolvedSession.email,
        displayName: resolvedSession.displayName,
        scope: resolvedSession.scope,
        officeId: resolvedSession.officeId,
        role: 'hr',
      },
      needsRefresh: sessionNeedsRefresh(session),
      timeRemaining: sessionTimeRemaining(session),
    })

    if (sessionNeedsRefresh(session)) {
      response.cookies.set({
        name: getHrSessionCookieName(),
        value: createHrSessionCookieValue(resolvedSession),
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: getHrSessionMaxAge(),
      })
    }

    return response
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to load HR session.' },
      { status: 500 },
    )
  }
}