import { getAdminDb } from '@/lib/firebase-admin'
import { buildAttendanceEntryTiming } from '@/lib/attendance-time'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const employeeId = searchParams.get('employeeId')

  if (!employeeId) {
    return Response.json({ ok: false, message: 'Employee ID required' }, { status: 400 })
  }

  try {
    const db = getAdminDb()

    const { currentMonth, currentYear } = buildAttendanceEntryTiming(Date.now())
    const { attendanceStartOfMonth, attendanceEndOfMonth } = getMonthRange(currentYear, currentMonth)

    const snapshot = await db.collection('attendance')
      .where('employeeId', '==', employeeId)
      .where('timestamp', '>=', attendanceStartOfMonth)
      .where('timestamp', '<=', attendanceEndOfMonth)
      .get()

    const records = snapshot.docs.map(doc => {
      const data = doc.data()
      return {
        id: doc.id,
        action: data.action,
        timestamp: data.timestamp,
        dateKey: data.dateKey,
        dateLabel: data.dateLabel,
        time: data.time,
        attendanceMode: data.attendanceMode,
        geofenceStatus: data.geofenceStatus,
      }
    })

    const dateKeySet = new Set(records.map(r => r.dateKey))
    const datesPresent = Array.from(dateKeySet).sort()

    const checkIns = records.filter(r => r.action === 'checkin')
    const checkOuts = records.filter(r => r.action === 'checkout')
    const wfhCount = records.filter(r => r.attendanceMode === 'wfh').length
    const onSiteCount = records.filter(r => r.attendanceMode === 'onsite').length

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
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 0, 23, 59, 59, 999)
  return {
    attendanceStartOfMonth: start.getTime(),
    attendanceEndOfMonth: end.getTime(),
  }
}