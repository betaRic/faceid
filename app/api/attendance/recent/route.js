export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import {
  getSessionOfficeFilter,
  resolveStaffAttendanceSession,
  sessionAllowsOffice,
} from '@/lib/employee-access'
import { listLocalAttendanceLogs } from '@/lib/postgres/report-store'

export async function GET(request) {
  try {
    const resolvedSession = await resolveStaffAttendanceSession(request, null)
    if (!resolvedSession) {
      return NextResponse.json({ ok: false, message: 'Admin or HR attendance access is required.' }, { status: 403 })
    }

    const attendance = (await listLocalAttendanceLogs({
      officeId: getSessionOfficeFilter(resolvedSession), limit: 500, direction: 'desc',
    })).filter(entry => sessionAllowsOffice(resolvedSession, entry.officeId))

    return NextResponse.json({ ok: true, attendance })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to load attendance.' },
      { status: 500 },
    )
  }
}


