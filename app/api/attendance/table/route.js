import { listEmployeeDailyAttendanceRecords, hasDailyAttendanceLogs } from '@/lib/attendance-daily-store'
import { resolveAttendanceViewer } from '@/lib/employee-access'
import { deriveDailyAttendanceRecord } from '@/lib/daily-attendance'
import { getOfficeRecord } from '@/lib/office-directory'
import { listLocalAttendanceLogs } from '@/lib/postgres/report-store'
import { loadWorkforcePolicies, resolveEmployeeDayPolicy } from '@/lib/workforce-policy'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const employeeId = searchParams.get('employeeId')
  const officeId = searchParams.get('officeId')
  const month = searchParams.get('month')
  const year = searchParams.get('year')

  try {
    const db = null
    const access = await resolveAttendanceViewer(request, db, employeeId)
    if (!access.viewer) {
      return Response.json({ ok: false, message: access.message }, { status: access.status })
    }

    const now = new Date()
    const targetYear = year ? parseInt(year) : now.getFullYear()
    const targetMonth = month ? parseInt(month) : now.getMonth() + 1

    const personId = String(access.person?.id || '').trim()
    const resolvedEmployeeId = String(access.person?.employeeId || employeeId || '').trim()
    const dailyRecords = await listEmployeeDailyAttendanceRecords(db, personId, resolvedEmployeeId)
    if (dailyRecords.length > 0) {
      const days = dailyRecords
        .filter(record => {
          const [recordYear, recordMonth] = String(record.dateKey || '').split('-').map(Number)
          return recordYear === targetYear && recordMonth === targetMonth && hasDailyAttendanceLogs(record)
        })
        .map(record => ({
          dateKey: record.dateKey,
          date: formatDateDisplay(record.dateKey),
          amIn: record.amIn || '--',
          amOut: record.amOut || '--',
          pmIn: record.pmIn || '--',
          pmOut: record.pmOut || '--',
          undertime: Number(record.undertimeMinutes ?? 0),
          undertimeDisplay: formatUndertime(Number(record.undertimeMinutes ?? 0)),
          totalHours: Number(record.workingMinutes ?? 0),
          logCount: Number(record.logCount ?? 0),
        }))

      return Response.json({
        ok: true,
        employeeId: resolvedEmployeeId,
        month: targetMonth,
        year: targetYear,
        totalDays: days.length,
        totalLogs: days.reduce((sum, day) => sum + Number(day.logCount || 0), 0),
        days,
      })
    }

    const monthLabel = String(targetMonth).padStart(2, '0')
    const lastDay = String(new Date(targetYear, targetMonth, 0).getDate()).padStart(2, '0')
    const startDate = new Date(`${targetYear}-${monthLabel}-01T00:00:00+08:00`)
    const endDate = new Date(`${targetYear}-${monthLabel}-${lastDay}T23:59:59.999+08:00`)

    const logs = await listLocalAttendanceLogs({ personId, startMs: startDate.getTime(), endMs: endDate.getTime(), direction: 'asc', limit: 3000 })
    const office = await getOfficeRecord(db, access.person?.officeId || logs[0]?.officeId || '')
    if (!office?.workPolicy) {
      throw new Error('Office work policy is not configured for attendance history.')
    }
    const policies = await loadWorkforcePolicies()
    const logsByDate = {}
    logs.forEach(log => {
        const dateKey = log.dateKey
        if (!logsByDate[dateKey]) logsByDate[dateKey] = []
        logsByDate[dateKey].push(log)
      })

      const days = Object.keys(logsByDate).sort().map(dateKey => {
        const dayLogs = logsByDate[dateKey].sort((a, b) => a.timestamp - b.timestamp)
        const dayOfWeek = new Date(`${dateKey}T12:00:00Z`).getUTCDay()
        const policyOverride = resolveEmployeeDayPolicy({
          person: access.person,
          office,
          policies,
          dayOfWeek,
        })
        const record = deriveDailyAttendanceRecord({
          logs: dayLogs,
          person: access.person,
          office,
          targetDateKey: dateKey,
          targetDateLabel: dayLogs[0]?.dateLabel || dateKey,
          policyOverride,
        })
        return {
          dateKey: record.dateKey,
          date: formatDateDisplay(record.dateKey),
          amIn: record.amIn,
          amOut: record.amOut,
          pmIn: record.pmIn,
          pmOut: record.pmOut,
          undertime: record.undertimeMinutes,
          undertimeDisplay: formatUndertime(record.undertimeMinutes),
          totalHours: record.workingMinutes,
          logCount: record.logCount,
        }
      })

    return Response.json({
        ok: true,
        employeeId: resolvedEmployeeId,
        personId,
        month: targetMonth,
        year: targetYear,
        totalDays: days.length,
        totalLogs: logs.length,
        days,
    })
  } catch (error) {
    console.error('Attendance table error:', error)
    return Response.json({ ok: false, message: error.message }, { status: 500 })
  }
}

function formatDateDisplay(dateKey) {
  if (!dateKey) return ''
  const [y, m, d] = dateKey.split('-')
  const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d))
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatUndertime(minutes) {
  if (minutes === 0) return '0h 0m'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}h ${m}m`
}

