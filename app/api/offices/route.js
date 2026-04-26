export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { adminSessionAllowsOffice, getAdminSessionCookieName, parseAdminSessionCookieValue, resolveAdminSession } from '@/lib/admin-auth'
import { listOfficeRecords, getOfficeEmployeeCounts } from '@/lib/office-directory'

export async function GET(request) {
  const session = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Admin login is required to load offices.' }, { status: 401 })
  }

  try {
    const db = getAdminDb()
    const resolvedSession = await resolveAdminSession(db, session)
    if (!resolvedSession) {
      return NextResponse.json({ ok: false, message: 'Admin session is no longer valid.' }, { status: 403 })
    }

    const offices = await listOfficeRecords(db)
    const visible = offices.filter(office => adminSessionAllowsOffice(resolvedSession, office.id))

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

