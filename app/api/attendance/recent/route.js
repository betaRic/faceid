export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { adminSessionAllowsOffice, getAdminSessionCookieName, parseAdminSessionCookieValue, resolveAdminSession } from '@/lib/admin-auth'
import { listLocalAttendanceLogs } from '@/lib/postgres/report-store'

export async function GET(request) {
  const session = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Admin login is required to load attendance.' }, { status: 401 })
  }

  try {
    const resolvedSession = await resolveAdminSession(null, session)
    if (!resolvedSession) {
      return NextResponse.json({ ok: false, message: 'Admin session is no longer valid.' }, { status: 403 })
    }

    const attendance = (await listLocalAttendanceLogs({
      officeId: resolvedSession.scope === 'office' ? resolvedSession.officeId : '', limit: 500, direction: 'desc',
    })).filter(entry => adminSessionAllowsOffice(resolvedSession, entry.officeId))

    return NextResponse.json({ ok: true, attendance })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to load attendance.' },
      { status: 500 },
    )
  }
}


