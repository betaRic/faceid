export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getHrSessionCookieName, parseHrSessionCookieValue, resolveHrSession } from '@/lib/hr-auth'
import { getAdminSessionCookieName, parseAdminSessionCookieValue, resolveAdminSession } from '@/lib/admin-auth'
import { listLocalDtrEmployees } from '@/lib/postgres/report-store'

export async function GET(request) {
  const adminCookie = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
  const hrCookie = parseHrSessionCookieValue(request.cookies.get(getHrSessionCookieName())?.value)
  const session = (adminCookie && await resolveAdminSession(null, adminCookie)) || (hrCookie && await resolveHrSession(null, hrCookie))
  if (!session?.active) return NextResponse.json({ ok: false, message: 'Admin or HR login is required.' }, { status: 401 })
  try {
    const divisionId = String(new URL(request.url).searchParams.get('divisionId') || '').trim()
    const employees = (await listLocalDtrEmployees({ ...session, divisionId })).map(person => ({
      id: person.id, name: person.name || '', employeeId: person.employeeId || '', officeId: person.officeId || '', officeName: person.officeName || '',
      divisionId: person.divisionId || '', divisionName: person.divisionName || '', lifecycleStatus: person.lifecycleStatus,
    }))
    return NextResponse.json({ ok: true, employees })
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : 'Failed to load employees.' }, { status: 500 })
  }
}
