export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import * as adminAuth from '@/lib/admin-auth'
import { getHrSessionCookieName, parseHrSessionCookieValue, resolveHrSession } from '@/lib/hr-auth'
import { listLocalPersons } from '@/lib/postgres/person-store'

export async function GET(request) {
  const adminSession = adminAuth.parseAdminSessionCookieValue(
    request.cookies.get(adminAuth.getAdminSessionCookieName())?.value,
  )

  try {
    const db = null
    const resolvedAdmin = adminSession ? await adminAuth.resolveAdminSession(db, adminSession) : null
    const hrSession = resolvedAdmin ? null : parseHrSessionCookieValue(request.cookies.get(getHrSessionCookieName())?.value)
    const resolvedHr = hrSession ? await resolveHrSession(db, hrSession) : null
    const resolvedSession = resolvedAdmin || resolvedHr
    if (!resolvedSession) {
      return NextResponse.json({ ok: false, message: 'Admin or HR login is required.' }, { status: 401 })
    }

    const pending = (await listLocalPersons({
      officeId: resolvedSession.scope === 'office' ? resolvedSession.officeId : '',
    })).filter(person => person.lifecycleStatus === 'pending').length

    return NextResponse.json({ ok: true, pending })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to load pending count.' },
      { status: 500 },
    )
  }
}

