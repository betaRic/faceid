export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { listEmployeeDailyAttendanceRecords } from '@/lib/attendance-daily-store'
import { resolveAttendanceViewer } from '@/lib/employee-access'
import { formatAttendanceDateKey, getAttendanceHour, toLegacyAttendanceDate } from '@/lib/attendance-time'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const employeeId = String(searchParams.get('employeeId') || '').trim()
  const date = String(searchParams.get('date') || formatAttendanceDateKey(Date.now())).trim()

  if (!employeeId) {
    return NextResponse.json({ ok: false, message: 'Employee ID is required.' }, { status: 400 })
  }

  try {
    const db = getAdminDb()
    const access = await resolveAttendanceViewer(request, db, employeeId)
    if (!access.viewer) {
      return NextResponse.json({ ok: false, message: access.message }, { status: access.status })
    }

    const legacyDateLabel = toLegacyAttendanceDate(date)
    const cachedRecords = await listEmployeeDailyAttendanceRecords(db, employeeId)
    const cachedRecord = cachedRecords.find(record => record.dateKey === date && Number(record.logCount || 0) > 0)

    if (cachedRecord) {
      const attendanceMode = cachedRecord.decisionCodes.some(code => String(code).toLowerCase() === 'accepted_wfh')
        ? 'wfh'
        : 'onsite'

      const entries = [
        cachedRecord.amInTimestamp
          ? { id: `${employeeId}_${date}_amin`, action: 'checkin', timestamp: cachedRecord.amInTimestamp, time: cachedRecord.amIn, dateKey: cachedRecord.dateKey, dateLabel: cachedRecord.dateLabel, officeName: cachedRecord.officeName, attendanceMode }
          : null,
        cachedRecord.amOutTimestamp
          ? { id: `${employeeId}_${date}_amout`, action: 'checkout', timestamp: cachedRecord.amOutTimestamp, time: cachedRecord.amOut, dateKey: cachedRecord.dateKey, dateLabel: cachedRecord.dateLabel, officeName: cachedRecord.officeName, attendanceMode }
          : null,
        cachedRecord.pmInTimestamp
          ? { id: `${employeeId}_${date}_pmin`, action: 'checkin', timestamp: cachedRecord.pmInTimestamp, time: cachedRecord.pmIn, dateKey: cachedRecord.dateKey, dateLabel: cachedRecord.dateLabel, officeName: cachedRecord.officeName, attendanceMode }
          : null,
        cachedRecord.pmOutTimestamp
          ? { id: `${employeeId}_${date}_pmout`, action: 'checkout', timestamp: cachedRecord.pmOutTimestamp, time: cachedRecord.pmOut, dateKey: cachedRecord.dateKey, dateLabel: cachedRecord.dateLabel, officeName: cachedRecord.officeName, attendanceMode }
          : null,
      ].filter(Boolean)

      return NextResponse.json({
        ok: true,
        date,
        employeeId,
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

    const snapshot = await db
      .collection('attendance')
      .where('employeeId', '==', employeeId)
      .where('dateKey', '==', date)
      .get()

    let attendance = snapshot.docs.map(record => ({ id: record.id, ...record.data() }))

    if (attendance.length === 0) {
      const legacySnapshot = await db
        .collection('attendance')
        .where('employeeId', '==', employeeId)
        .where('date', '==', legacyDateLabel)
        .get()

      attendance = legacySnapshot.docs.map(record => ({ id: record.id, ...record.data() }))
    }

    const entries = attendance
      .map(entry => ({
        ...entry,
        timestamp: Number(entry?.timestamp ?? 0),
        dateKey: entry?.dateKey || date,
        dateLabel: entry?.dateLabel || entry?.date || legacyDateLabel,
        officeName: access.person?.officeName || entry.officeName || 'Unknown Office',
      }))
      .sort((a, b) => Number(a.timestamp ?? 0) - Number(b.timestamp ?? 0))

    const amEntries = entries.filter(entry => Number(entry.timestamp ?? 0) > 0 && getAttendanceHour(Number(entry.timestamp)) < 12)
    const pmEntries = entries.filter(entry => Number(entry.timestamp ?? 0) > 0 && getAttendanceHour(Number(entry.timestamp)) >= 12)

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
      entries,
      summary: {
        amIn: amIn ? amIn.time : null,
        amOut: amOut ? amOut.time : null,
        pmIn: pmIn ? pmIn.time : null,
        pmOut: pmOut ? pmOut.time : null,
        status,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to load attendance records.' },
      { status: 500 },
    )
  }
}
