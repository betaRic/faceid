export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { adminSessionAllowsOffice, getAdminSessionCookieName, parseAdminSessionCookieValue, resolveAdminSession } from '@/lib/admin-auth'
import { getHrSessionCookieName, hrSessionAllowsOffice, parseHrSessionCookieValue, resolveHrSession } from '@/lib/hr-auth'
import { listOfficeRecords, getOfficeEmployeeCounts } from '@/lib/office-directory'

export async function GET(request) {
  try {
    const db = null
    const adminSession = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
    const resolvedAdmin = adminSession ? await resolveAdminSession(db, adminSession) : null
    const hrSession = resolvedAdmin ? null : parseHrSessionCookieValue(request.cookies.get(getHrSessionCookieName())?.value)
    const resolvedHr = hrSession ? await resolveHrSession(db, hrSession) : null

    if (!resolvedAdmin && !resolvedHr) {
      return NextResponse.json({ ok: false, message: 'Admin or HR login is required to load offices.' }, { status: 401 })
    }

    const offices = await listOfficeRecords(db)
    const visible = offices.filter(office => (
      resolvedAdmin
        ? adminSessionAllowsOffice(resolvedAdmin, office.id)
        : hrSessionAllowsOffice(resolvedHr, office.id)
    ))

    const counts = await getOfficeEmployeeCounts(db, visible.map(office => office.id))
    const enriched = visible.map(office => ({
      ...office,
      employees: Number(counts[office.id] ?? 0),
    }))

    return NextResponse.json({ ok: true, offices: enriched })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to load offices.' },
      { status: 500 },
    )
  }
}


