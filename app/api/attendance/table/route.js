import { getAdminDb } from '@/lib/firebase-admin'
import { buildAttendanceEntryTiming } from '@/lib/attendance-time'
import { parseTimeToMinutes } from '@/lib/daily-attendance'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const employeeId = searchParams.get('employeeId')
  const officeId = searchParams.get('officeId')
  const month = searchParams.get('month')
  const year = searchParams.get('year')

  if (!employeeId) {
    return Response.json({ ok: false, message: 'Employee ID required' }, { status: 400 })
  }

  try {
    const db = getAdminDb()
    const now = new Date()
    const targetYear = year ? parseInt(year) : now.getFullYear()
    const targetMonth = month ? parseInt(month) : now.getMonth() + 1

    const startDate = new Date(targetYear, targetMonth - 1, 1)
    const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59, 999)

    const snapshot = await db.collection('attendance')
      .where('employeeId', '==', employeeId)
      .where('timestamp', '>=', startDate.getTime())
      .where('timestamp', '<=', endDate.getTime())
      .orderBy('timestamp', 'asc')
      .get()

    const logs = snapshot.docs.map(doc => doc.data())

    const logsByDate = {}
    logs.forEach(log => {
      const dateKey = log.dateKey
      if (!logsByDate[dateKey]) logsByDate[dateKey] = []
      logsByDate[dateKey].push(log)
    })

    const days = Object.keys(logsByDate).sort().map(dateKey => {
      const dayLogs = logsByDate[dateKey].sort((a, b) => a.timestamp - b.timestamp)
      return deriveDailyRecord(dayLogs, dateKey)
    })

    return Response.json({
      ok: true,
      employeeId,
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

function deriveDailyRecord(logs, dateKey) {
  const segments = computeSegments(logs)
  const undertime = computeUndertime(segments)
  
  return {
    dateKey,
    date: formatDateDisplay(dateKey),
    amIn: formatTime(segments.amIn),
    amOut: formatTime(segments.amOut),
    pmIn: formatTime(segments.pmIn),
    pmOut: formatTime(segments.pmOut),
    undertime,
    undertimeDisplay: formatUndertime(undertime),
    logCount: logs.length,
  }
}

function computeSegments(logs) {
  if (!logs || logs.length === 0) {
    return { amIn: null, amOut: null, pmIn: null, pmOut: null }
  }

  const sorted = logs.sort((a, b) => a.timestamp - b.timestamp)
  let amIn = null, amOut = null, pmIn = null, pmOut = null

  sorted.forEach(log => {
    const hour = new Date(log.timestamp).getHours()
    if (hour < 12) {
      if (!amIn) amIn = log
      amOut = log
    } else {
      if (!pmIn) pmIn = log
      pmOut = log
    }
  })

  if (amIn === amOut) amOut = null
  if (pmIn === pmOut) pmOut = null

  return { amIn, amOut, pmIn, pmOut }
}

function computeUndertime(segments) {
  const DEFAULT_OUT = 17 * 60
  
  let undertime = 0
  if (segments.amOut) {
    const ts = segments.amOut.timestamp
    const hour = parseInt(new Date(ts).toLocaleString('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', hour12: false }))
    const minute = parseInt(new Date(ts).toLocaleString('en-US', { timeZone: 'Asia/Manila', minute: '2-digit' }))
    const amOutMin = hour * 60 + minute
    undertime += Math.max(0, 12 * 60 - amOutMin)
  }
  if (segments.pmOut) {
    const ts = segments.pmOut.timestamp
    const hour = parseInt(new Date(ts).toLocaleString('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', hour12: false }))
    const minute = parseInt(new Date(ts).toLocaleString('en-US', { timeZone: 'Asia/Manila', minute: '2-digit' }))
    const pmOutMin = hour * 60 + minute
    undertime += Math.max(0, DEFAULT_OUT - pmOutMin)
  }
  
  return undertime
}

function formatTime(log) {
  if (!log) return '--'
  return new Date(log.timestamp).toLocaleTimeString('en-PH', {
    timeZone: 'Asia/Manila',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
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