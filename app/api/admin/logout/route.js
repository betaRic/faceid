import { NextResponse } from 'next/server'
import { getAdminSessionCookieName, parseAdminSessionCookieValue } from '../../../../lib/admin-auth'
import { getAdminDb } from '../../../../lib/firebase-admin'
import { writeAuditLog } from '../../../../lib/audit-log'

export async function POST(request) {
  const session = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
  if (session) {
    try {
      const db = getAdminDb()
      await writeAuditLog(db, {
        actorRole: session.role,
        actorScope: session.scope,
        actorOfficeId: session.officeId,
        action: 'admin_logout',
        targetType: 'session',
        targetId: session.scope === 'office' ? session.officeId : 'regional',
        officeId: session.officeId,
        summary: session.scope === 'office'
          ? `Office admin logout for ${session.officeId}`
          : 'Regional admin logout',
      })
    } catch {}
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set({
    name: getAdminSessionCookieName(),
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })

  return response
}
