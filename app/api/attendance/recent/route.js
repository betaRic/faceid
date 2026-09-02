export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import {
  getSessionOfficeFilter,
  resolveStaffAttendanceSession,
  sessionAllowsOffice,
} from '@/lib/employee-access'
import { listLocalAttendanceLogs } from '@/lib/postgres/report-store'

const HR_RECENT_ATTENDANCE_FIELDS = [
  'id', 'employeeId', 'personId', 'name', 'officeId', 'officeName',
  'action', 'timestamp', 'dateKey', 'dateLabel', 'date', 'time',
  'attendanceMode', 'decisionCode', 'confidence', 'source', 'manualSlot', 'fieldDutyStatus',
]

function serializeHrRecentAttendance(entry) {
  // Raw geofence text can embed Wi-Fi/location details. Unknown payload fields
  // and object-valued legacy metadata must never enter the HR response.
  return Object.fromEntries(HR_RECENT_ATTENDANCE_FIELDS
    .map(field => [field, entry[field]])
    .filter(([, value]) => value === null || ['string', 'number', 'boolean'].includes(typeof value)))
}

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
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to load attendance.' },
      { status: 500 },
    )
  }
}


