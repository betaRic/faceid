import { listEmployeeDailyAttendanceRecordsForMonth, hasDailyAttendanceLogs } from '@/lib/attendance-daily-store'
import { resolveAttendanceViewer } from '@/lib/employee-access'
import { buildAttendanceEntryTiming } from '@/lib/attendance-time'
import { listLocalAttendanceLogs } from '@/lib/postgres/report-store'

export const dynamic = 'force-dynamic'

function normalizeAttendanceMode(value) {
  return String(value || '').trim().toLowerCase()
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const employeeId = searchParams.get('employeeId')

  try {
    const db = null
    const access = await resolveAttendanceViewer(request, db, employeeId)
    if (!access.viewer) {
      return Response.json({ ok: false, message: access.message }, { status: access.status })
    }

    const { dateKey } = buildAttendanceEntryTiming(Date.now())
    const [currentYear, currentMonth] = String(dateKey).split('-').map(Number)
    const { attendanceStartOfMonth, attendanceEndOfMonth } = getMonthRange(currentYear, currentMonth)

    const personId = String(access.person?.id || '').trim()
    const resolvedEmployeeId = String(access.person?.employeeId || employeeId || '').trim()
    const dailyRecords = await listEmployeeDailyAttendanceRecordsForMonth(db, personId, currentYear, currentMonth, resolvedEmployeeId)
    if (dailyRecords.length > 0) {
      const records = dailyRecords
        .filter(record => hasDailyAttendanceLogs(record))
        .map(record => ({
          id: record.id,
          dateKey: record.dateKey,
          dateLabel: record.dateLabel,
          amInTimestamp: record.amInTimestamp,
          amOutTimestamp: record.amOutTimestamp,
          pmInTimestamp: record.pmInTimestamp,
          pmOutTimestamp: record.pmOutTimestamp,
          decisionCodes: record.decisionCodes || [],
        }))

      const dateKeySet = new Set(records.map(r => r.dateKey))
      const checkIns = records.reduce((sum, record) => sum + (record.amInTimestamp ? 1 : 0) + (record.pmInTimestamp ? 1 : 0), 0)
      const checkOuts = records.reduce((sum, record) => sum + (record.amOutTimestamp ? 1 : 0) + (record.pmOutTimestamp ? 1 : 0), 0)
      const wfhCount = records.filter(r => r.decisionCodes.some(code => normalizeAttendanceMode(code) === 'accepted_wfh')).length
      const onSiteCount = records.filter(r => r.decisionCodes.some(code => normalizeAttendanceMode(code).startsWith('accepted_onsite'))).length

      return Response.json({
        ok: true,
        month: currentMonth,
        year: currentYear,
        totalDays: dateKeySet.size,
        checkIns,
        checkOuts,
        wfhCount,
        onSiteCount,
        dates: Array.from(dateKeySet).sort(),
        records: records.slice(0, 50),
      })
    }

    const records = await listLocalAttendanceLogs({ personId, startMs: attendanceStartOfMonth, endMs: attendanceEndOfMonth, direction: 'asc', limit: 2000 })
    const dateKeySet = new Set(records.map(r => r.dateKey))
    const datesPresent = Array.from(dateKeySet).sort()
    const checkIns = records.filter(r => r.action === 'checkin')
    const checkOuts = records.filter(r => r.action === 'checkout')
    const wfhCount = records.filter(r => normalizeAttendanceMode(r.attendanceMode) === 'wfh').length
    const onSiteCount = records.filter(r => ['onsite', 'on-site'].includes(normalizeAttendanceMode(r.attendanceMode))).length
    return Response.json({
        ok: true,
        month: currentMonth,
        year: currentYear,
        totalDays: datesPresent.length,
        checkIns: checkIns.length,
        checkOuts: checkOuts.length,
        wfhCount,
        onSiteCount,
        dates: datesPresent,
        records: records.slice(0, 50),
    })
  } catch (error) {
    console.error('Monthly summary error:', error)
    return Response.json({ ok: false, message: error.message }, { status: 500 })
  }
}

function getMonthRange(year, month) {
  const start = new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00+08:00`)
  const end = new Date(`${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}T23:59:59.999+08:00`)
  return {
    attendanceStartOfMonth: start.getTime(),
    attendanceEndOfMonth: end.getTime(),
  }
}

