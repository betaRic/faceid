export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { adminSessionAllowsOffice, getAdminSessionCookieName, parseAdminSessionCookieValue, resolveAdminSession } from '@/lib/admin-auth'
import { getHrSessionCookieName, hrSessionAllowsOffice, parseHrSessionCookieValue, resolveHrSession } from '@/lib/hr-auth'
import { listDailyAttendanceRecordsForDate } from '@/lib/attendance-daily-store'
import { buildAttendanceSummary } from '@/lib/attendance-summary'
import { recalculateDailyAttendanceMetrics } from '@/lib/daily-attendance'
import { listOfficeRecords } from '@/lib/office-directory'
import { queryPostgres } from '@/lib/postgres/client'
import { listLocalAttendanceLogs } from '@/lib/postgres/report-store'

function hasSegmentTimestamp(record) { return Boolean(record?.amInTimestamp || record?.amOutTimestamp || record?.pmInTimestamp || record?.pmOutTimestamp) }
function shouldRebuildFromRawLogs(records) { return records.some(record => Number(record?.logCount ?? 0) > 0 && !hasSegmentTimestamp(record)) }

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const date = String(searchParams.get('date') || '').trim()
  const officeFilter = String(searchParams.get('officeId') || 'all').trim()
  const divisionFilter = String(searchParams.get('divisionId') || 'all').trim()
  if (!date) return NextResponse.json({ ok: false, message: 'Date is required.' }, { status: 400 })
  try {
    const adminCookie = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
    const admin = adminCookie ? await resolveAdminSession(null, adminCookie) : null
    const hrCookie = admin ? null : parseHrSessionCookieValue(request.cookies.get(getHrSessionCookieName())?.value)
    const hr = hrCookie ? await resolveHrSession(null, hrCookie) : null
    if (!admin && !hr) return NextResponse.json({ ok: false, message: 'Admin or HR login is required to load daily attendance records.' }, { status: 401 })
    const permitsOffice = officeId => admin ? adminSessionAllowsOffice(admin, officeId) : hrSessionAllowsOffice(hr, officeId)
    const offices = await listOfficeRecords(null)
    const officesById = new Map(offices.map(office => [office.id, office]))
    const cached = await listDailyAttendanceRecordsForDate(null, date)
    if (cached.length && !shouldRebuildFromRawLogs(cached)) {
      const personIds = cached.map(entry => entry.personId).filter(Boolean)
      const people = personIds.length ? await queryPostgres('SELECT id, division_id FROM persons WHERE id = ANY($1::text[])', [personIds]) : { rows: [] }
      const divisionByPersonId = new Map(people.rows.map(row => [row.id, row.division_id || '']))
      const records = cached.filter(entry => permitsOffice(entry.officeId))
        .filter(entry => officeFilter === 'all' || entry.officeId === officeFilter)
        .filter(entry => divisionFilter === 'all' || divisionByPersonId.get(entry.personId) === divisionFilter)
        .map(entry => recalculateDailyAttendanceMetrics(entry, officesById.get(entry.officeId) || null))
        .sort((a, b) => a.name.localeCompare(b.name))
      return NextResponse.json({ ok: true, records })
    }
    const attendance = (await listLocalAttendanceLogs({ dateKey: date, direction: 'asc', limit: 2000 }))
      .filter(entry => permitsOffice(entry.officeId))
      .filter(entry => officeFilter === 'all' || entry.officeId === officeFilter)
    const employeeIds = [...new Set(attendance.map(entry => entry.employeeId).filter(Boolean))]
    const people = employeeIds.length ? await queryPostgres('SELECT id, employee_id, name, office_id, office_name, division_id, division_name FROM persons WHERE employee_id = ANY($1::text[])', [employeeIds]) : { rows: [] }
    const persons = people.rows.map(row => ({ id: row.id, employeeId: row.employee_id, name: row.name, officeId: row.office_id, officeName: row.office_name, divisionId: row.division_id, divisionName: row.division_name }))
    const records = buildAttendanceSummary({ attendance, persons, offices, targetDate: date })
      .filter(row => divisionFilter === 'all' || row.divisionId === divisionFilter)
      .map(row => ({ id: row.employeeId ? `${row.employeeId}_${date}` : `${row.name}_${date}`, ...row }))
    return NextResponse.json({ ok: true, records })
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : 'Failed to load daily attendance records.' }, { status: 500 })
  }
}
