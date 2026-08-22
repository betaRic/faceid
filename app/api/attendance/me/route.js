export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getEmployeeDailyAttendanceRecord } from '@/lib/attendance-daily-store'
import { resolveAttendanceViewer } from '@/lib/employee-access'
import { formatAttendanceDateKey, getAttendanceHour } from '@/lib/attendance-time'
import { listLocalAttendanceLogs } from '@/lib/postgres/report-store'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const employeeId = String(searchParams.get('employeeId') || '').trim()
  const date = String(searchParams.get('date') || formatAttendanceDateKey(Date.now())).trim()

  try {
    const db = null
    const access = await resolveAttendanceViewer(request, db, employeeId)
    if (!access.viewer) {
      return NextResponse.json({ ok: false, message: access.message }, { status: access.status })
    }

    const personId = String(access.person?.id || '').trim()
    const resolvedEmployeeId = String(access.person?.employeeId || employeeId || '').trim()
    const identityLabel = resolvedEmployeeId || personId
    const cachedRecord = await getEmployeeDailyAttendanceRecord(db, personId, date, resolvedEmployeeId)

    if (cachedRecord && Number(cachedRecord.logCount || 0) > 0) {
      const attendanceMode = cachedRecord.decisionCodes.some(code => String(code).toLowerCase() === 'accepted_wfh')
        ? 'wfh'
        : 'onsite'

      const entries = [
        cachedRecord.amInTimestamp
          ? { id: `${identityLabel}_${date}_amin`, action: 'checkin', timestamp: cachedRecord.amInTimestamp, time: cachedRecord.amIn, dateKey: cachedRecord.dateKey, dateLabel: cachedRecord.dateLabel, officeName: cachedRecord.officeName, attendanceMode }
          : null,
        cachedRecord.amOutTimestamp
          ? { id: `${identityLabel}_${date}_amout`, action: 'checkout', timestamp: cachedRecord.amOutTimestamp, time: cachedRecord.amOut, dateKey: cachedRecord.dateKey, dateLabel: cachedRecord.dateLabel, officeName: cachedRecord.officeName, attendanceMode }
          : null,
        cachedRecord.pmInTimestamp
          ? { id: `${identityLabel}_${date}_pmin`, action: 'checkin', timestamp: cachedRecord.pmInTimestamp, time: cachedRecord.pmIn, dateKey: cachedRecord.dateKey, dateLabel: cachedRecord.dateLabel, officeName: cachedRecord.officeName, attendanceMode }
          : null,
        cachedRecord.pmOutTimestamp
          ? { id: `${identityLabel}_${date}_pmout`, action: 'checkout', timestamp: cachedRecord.pmOutTimestamp, time: cachedRecord.pmOut, dateKey: cachedRecord.dateKey, dateLabel: cachedRecord.dateLabel, officeName: cachedRecord.officeName, attendanceMode }
          : null,
      ].filter(Boolean)

      return NextResponse.json({
        ok: true,
        date,
        employeeId: resolvedEmployeeId,
        entries,
        summary: {
          amIn: cachedRecord.amInTimestamp ? cachedRecord.amIn : null,
          amOut: cachedRecord.amOutTimestamp ? cachedRecord.amOut : null,
          pmIn: cachedRecord.pmInTimestamp ? cachedRecord.pmIn : null,
          pmOut: cachedRecord.pmOutTimestamp ? cachedRecord.pmOut : null,
          status: cachedRecord.status || 'No Record',
        },
      })
    }

    const entries = (await listLocalAttendanceLogs({ personId, dateKey: date, direction: 'asc', limit: 100 }))
      .map(entry => ({
        ...entry,
        timestamp: Number(entry?.timestamp ?? 0),
        dateKey: entry?.dateKey || date,
        dateLabel: entry?.dateLabel || entry?.date || date,
        officeName: access.person?.officeName || entry.officeName || 'Unknown Office',
      }))
    return buildAttendanceMeResponse({ date, employeeId: resolvedEmployeeId, entries })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to load attendance records.' },
      { status: 500 },
    )
  }
}

function buildAttendanceMeResponse({ date, employeeId, entries }) {
  const sortedEntries = entries.sort((a, b) => Number(a.timestamp ?? 0) - Number(b.timestamp ?? 0))
  const amEntries = sortedEntries.filter(entry => Number(entry.timestamp ?? 0) > 0 && getAttendanceHour(Number(entry.timestamp)) < 12)
  const pmEntries = sortedEntries.filter(entry => Number(entry.timestamp ?? 0) > 0 && getAttendanceHour(Number(entry.timestamp)) >= 12)
  const amIn = amEntries[0] || null
  const amOut = amEntries.length > 1 ? amEntries[amEntries.length - 1] : null
  const pmIn = pmEntries[0] || null
  const pmOut = pmEntries.length > 1 ? pmEntries[pmEntries.length - 1] : null
  const hasAM = Boolean(amIn)
  const hasPM = Boolean(pmIn)
  let status = 'No Record'
  if (hasAM && hasPM) status = 'Complete'
  else if (hasAM || hasPM) status = 'Partial'

  return NextResponse.json({
    ok: true,
    date,
    employeeId,
    entries: sortedEntries,
    summary: {
      amIn: amIn ? amIn.time : null,
      amOut: amOut ? amOut.time : null,
      pmIn: pmIn ? pmIn.time : null,
      pmOut: pmOut ? pmOut.time : null,
      status,
    },
  })
}

