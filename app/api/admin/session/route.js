import { NextResponse } from 'next/server'
import { parseAdminSessionCookieValue, createAdminSessionCookieValue, getAdminSessionCookieName, getAdminSessionMaxAge, sessionNeedsRefresh, sessionTimeRemaining, resolveAdminSession } from '@/lib/admin-auth'
import { getAdminDb } from '@/lib/firebase-admin'

export async function GET(request) {
  const session = parseAdminSessionCookieValue(
    request.cookies.get(getAdminSessionCookieName())?.value,
  )

  if (!session) {
    return NextResponse.json({ ok: false, message: 'No active session.' }, { status: 401 })
  }

  const db = getAdminDb()
  const resolvedSession = await resolveAdminSession(db, session)

  if (!resolvedSession) {
    return NextResponse.json({ ok: false, message: 'Session is no longer valid.' }, { status: 403 })
  }

  const needsRefresh = sessionNeedsRefresh(session)
  const timeRemaining = sessionTimeRemaining(session)

  if (!needsRefresh) {
    return NextResponse.json({
      ok: true,
      needsRefresh: false,
      timeRemaining,
      expiresIn: `${Math.floor(timeRemaining / 86400)} days`,
    })
  }

  const newCookieValue = createAdminSessionCookieValue({
    scope: resolvedSession.scope,
    officeId: resolvedSession.officeId,
    email: resolvedSession.email,
    uid: resolvedSession.uid,
  })

  const response = NextResponse.json({
    ok: true,
    needsRefresh: true,
    refreshed: true,
    timeRemaining: timeRemaining,
    expiresIn: `${Math.floor(timeRemaining / 3600)} hours`,
  })

  response.cookies.set(getAdminSessionCookieName(), newCookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: getAdminSessionMaxAge(),
    path: '/',
  })

  return response
}
