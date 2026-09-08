export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import {
  getSessionOfficeFilter,
  resolveStaffAttendanceSession,
  sessionAllowsOffice,
} from '@/lib/employee-access'
import { serializeHrRecentAttendance } from '@/lib/attendance/response'
import { serverErrorResponse } from '@/lib/http/server-error'
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

    return NextResponse.json({
      ok: true,
      attendance: resolvedSession.role === 'hr' ? attendance.map(serializeHrRecentAttendance) : attendance,
    })
  } catch (error) {
    return serverErrorResponse(error, {
      context: 'api/attendance/recent:GET',
      publicMessage: 'Failed to load attendance.',
    })
  }
}


