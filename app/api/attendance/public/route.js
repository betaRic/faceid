export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { listDailyAttendanceRecordsForDate } from '@/lib/attendance-daily-store'
import { buildAttendanceSummary } from '@/lib/attendance-summary'
import { toLegacyAttendanceDate } from '@/lib/attendance-time'
import { listOfficeRecords } from '@/lib/office-directory'
import { isPublicAttendanceEnabled } from '@/lib/public-features'
import { postgresEnabled } from '@/lib/postgres/client'
import { listLocalAttendanceLogs } from '@/lib/postgres/report-store'

export async function GET(request) {
  if (!isPublicAttendanceEnabled()) {
    return NextResponse.json({ ok: false, message: 'Public attendance is disabled.' }, { status: 404 })
  }

  const { searchParams } = new URL(request.url)
  const date = String(searchParams.get('date') || '').trim()
  const officeIdFilter = String(searchParams.get('officeId') || 'all').trim()

  if (!date) {
    return NextResponse.json({ ok: false, message: 'Date is required.' }, { status: 400 })
  }

  try {
    const usePostgres = postgresEnabled()
    const db = null
    const cachedRecords = await listDailyAttendanceRecordsForDate(db, date)
    if (cachedRecords.length > 0) {
      const records = cachedRecords
        .filter(entry => officeIdFilter === 'all' || entry.officeId === officeIdFilter)
        .sort((left, right) => left.name.localeCompare(right.name))

      return NextResponse.json({ ok: true, records })
    }

    const offices = await listOfficeRecords(db)
    const legacyDateLabel = toLegacyAttendanceDate(date)

    if (usePostgres) {
      const attendance = (await listLocalAttendanceLogs({
        dateKey: date,
        direction: 'asc',
        limit: 2000,
      }))
        .filter(entry => officeIdFilter === 'all' || entry.officeId === officeIdFilter)

      const summary = buildAttendanceSummary({
        attendance,
        persons: [],
        offices,
        targetDate: date,
      })

      const records = summary.map(row => ({
        id: row.employeeId ? `${row.employeeId}_${date}` : `${row.name}_${date}`,
        ...row,
      }))

      return NextResponse.json({ ok: true, records })
    }

    const snapshot = await db
      .collection('attendance')
      .where('dateKey', '==', date)
      .get()

    let attendance = snapshot.docs.map(record => ({ id: record.id, ...record.data() }))

    if (attendance.length === 0) {
      const legacySnapshot = await db
        .collection('attendance')
        .where('date', '==', legacyDateLabel)
        .get()

      attendance = legacySnapshot.docs.map(record => ({ id: record.id, ...record.data() }))
    }

    attendance = attendance
      .map(entry => ({
        ...entry,
        timestamp: Number(entry?.timestamp ?? 0),
        dateKey: entry?.dateKey || date,
        dateLabel: entry?.dateLabel || entry?.date || legacyDateLabel,
      }))
      .filter(entry => officeIdFilter === 'all' || entry.officeId === officeIdFilter)
      .sort((left, right) => Number(left.timestamp ?? 0) - Number(right.timestamp ?? 0))

    const summary = buildAttendanceSummary({
      attendance,
      persons: [],
      offices,
      targetDate: date,
    })

    const records = summary.map(row => ({
      id: row.employeeId ? `${row.employeeId}_${date}` : `${row.name}_${date}`,
      ...row,
    }))

    return NextResponse.json({ ok: true, records })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to load daily attendance records.' },
      { status: 500 },
    )
  }
}

