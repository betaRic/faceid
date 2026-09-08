export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getSessionOfficeFilter, resolveEmployeeManagementSession } from '@/lib/employee-access'
import { serverErrorResponse } from '@/lib/http/server-error'
import { listLocalPersons } from '@/lib/postgres/person-store'

export async function GET(request) {
  try {
    const db = null
    const resolvedSession = await resolveEmployeeManagementSession(request, db)
    if (!resolvedSession) {
      return NextResponse.json({ ok: false, message: 'Admin or HR login is required.' }, { status: 401 })
    }

    const pending = (await listLocalPersons({
      officeId: getSessionOfficeFilter(resolvedSession),
    })).filter(person => person.lifecycleStatus === 'pending').length

    return NextResponse.json({ ok: true, pending })
  } catch (error) {
    return serverErrorResponse(error, {
      context: 'api/persons/pending-count:GET',
      publicMessage: 'Failed to load pending count.',
    })
  }
}

