export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAdminSessionCookieName, parseAdminSessionCookieValue } from '@/lib/admin-auth'
import { getHrSessionCookieName, parseHrSessionCookieValue } from '@/lib/hr-auth'
import { writeAuditLog } from '@/lib/audit-log'
import { createOriginGuard } from '@/lib/csrf'
import { postgresEnabled } from '@/lib/postgres/client'
import { staffSessionCookieOptions } from '@/lib/staff-session-cookie'

export async function POST(request) {
  const checkOrigin = createOriginGuard()
  const originError = await checkOrigin(request)
  if (originError) return originError

  const adminSession = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
  const hrSession = parseHrSessionCookieValue(request.cookies.get(getHrSessionCookieName())?.value)
  const session = adminSession || hrSession

  if (session) {
    try {
      const db = null
      await writeAuditLog(db, {
        actorRole: session.role || 'admin',
        actorScope: session.scope,
        actorOfficeId: session.officeId,
        action: `${session.role || 'admin'}_logout`,
        targetType: 'session',
        targetId: session.scope === 'office' ? session.officeId : 'regional',
        officeId: session.officeId,
        summary: `${session.role || 'admin'} logout`,
      })
    } catch (err) {
      console.error('Audit log failed on logout:', err)
    }
  }

  const response = NextResponse.json({ ok: true })
  // Clear both session cookies
  response.cookies.set({
    name: getAdminSessionCookieName(),
    value: '',
    ...staffSessionCookieOptions({ maxAge: 0 }),
  })
  response.cookies.set({
    name: getHrSessionCookieName(),
    value: '',
    ...staffSessionCookieOptions({ maxAge: 0 }),
  })

  return response
}


