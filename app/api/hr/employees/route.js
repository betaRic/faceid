export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getHrSessionCookieName, parseHrSessionCookieValue, resolveHrSession } from '@/lib/hr-auth'
import { getSessionOfficeFilter } from '@/lib/employee-access'
import { listLocalHrEmployeeAccessCodeDirectory, listLocalHrEmployees } from '@/lib/postgres/report-store'
import { serverErrorResponse } from '@/lib/http/server-error'

const PAGE_SIZE = 20
const text = value => String(value || '').trim()

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const cookie = parseHrSessionCookieValue(request.cookies.get(getHrSessionCookieName())?.value)
  if (!cookie) return NextResponse.json({ ok: false, message: 'HR login is required.' }, { status: 401 })
  try {
    const session = await resolveHrSession(null, cookie)
    if (!session?.active) return NextResponse.json({ ok: false, message: 'HR session is no longer valid.' }, { status: 403 })
    const sessionOfficeId = getSessionOfficeFilter(session, text(searchParams.get('officeId')))
    if (searchParams.get('mode') === 'access-codes') {
      const employees = await listLocalHrEmployeeAccessCodeDirectory({ sessionOfficeId })
      return NextResponse.json({ ok: true, employees })
    }
    const page = Math.max(1, Number.parseInt(searchParams.get('page') || '1', 10) || 1)
    const { employees, total } = await listLocalHrEmployees({
      sessionOfficeId, officeId: text(searchParams.get('officeId')), query: text(searchParams.get('query')),
      status: text(searchParams.get('status')), page, pageSize: PAGE_SIZE,
    })
    return NextResponse.json({ ok: true, employees, pagination: { page, pageSize: PAGE_SIZE, total, hasMore: page * PAGE_SIZE < total } })
  } catch (error) {
    return serverErrorResponse(error, {
      context: 'api/hr/employees:GET',
      publicMessage: 'Failed to load employees.',
    })
  }
}
