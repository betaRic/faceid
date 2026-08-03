export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { adminSessionAllowsOffice, getAdminSessionCookieName, parseAdminSessionCookieValue, resolveAdminSession } from '@/lib/admin-auth'
import { getHrSessionCookieName, hrSessionAllowsOffice, parseHrSessionCookieValue, resolveHrSession } from '@/lib/hr-auth'
import { listDailyAttendanceRecordsForDate } from '@/lib/attendance-daily-store'
import { buildAttendanceSummary } from '@/lib/attendance-summary'
import { recalculateDailyAttendanceMetrics } from '@/lib/daily-attendance'
import { toLegacyAttendanceDate } from '@/lib/attendance-time'
import { listOfficeRecords } from '@/lib/office-directory'
import { postgresEnabled } from '@/lib/postgres/client'
import { listLocalAttendanceLogs } from '@/lib/postgres/report-store'

function hasSegmentTimestamp(record) {
  return Boolean(
    record?.amInTimestamp ||
    record?.amOutTimestamp ||
    record?.pmInTimestamp ||
    record?.pmOutTimestamp,
  )
}

function shouldRebuildFromRawLogs(records) {
  return records.some(record => Number(record?.logCount ?? 0) > 0 && !hasSegmentTimestamp(record))
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const date = String(searchParams.get('date') || '').trim()
  const officeIdFilter = String(searchParams.get('officeId') || 'all').trim()

  if (!date) {
    return NextResponse.json({ ok: false, message: 'Date is required.' }, { status: 400 })
  }

  try {
    const usePostgres = postgresEnabled()
    const db = null
    const adminSession = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
    const resolvedAdmin = adminSession ? await resolveAdminSession(db, adminSession) : null
    const hrSession = resolvedAdmin ? null : parseHrSessionCookieValue(request.cookies.get(getHrSessionCookieName())?.value)
    const resolvedHr = hrSession ? await resolveHrSession(db, hrSession) : null
    if (!resolvedAdmin && !resolvedHr) {
      return NextResponse.json({ ok: false, message: 'Admin or HR login is required to load daily attendance records.' }, { status: 401 })
    }
    const sessionAllowsOffice = (officeId) => (
      resolvedAdmin ? adminSessionAllowsOffice(resolvedAdmin, officeId) : hrSessionAllowsOffice(resolvedHr, officeId)
    )

    const offices = await listOfficeRecords(db)
    const officesById = new Map(offices.map(office => [office.id, office]))
    const cachedRecords = await listDailyAttendanceRecordsForDate(db, date)
    if (cachedRecords.length > 0 && !shouldRebuildFromRawLogs(cachedRecords)) {
      const records = cachedRecords
        .filter(entry => sessionAllowsOffice(entry.officeId))
        .filter(entry => officeIdFilter === 'all' || entry.officeId === officeIdFilter)
        .map(entry => recalculateDailyAttendanceMetrics(entry, officesById.get(entry.officeId) || null))
        .sort((left, right) => left.name.localeCompare(right.name))

      return NextResponse.json({ ok: true, records })
    }

    const legacyDateLabel = toLegacyAttendanceDate(date)

    if (usePostgres) {
      const attendance = (await listLocalAttendanceLogs({
        dateKey: date,
        direction: 'asc',
        limit: 2000,
      }))
        .filter(entry => sessionAllowsOffice(entry.officeId))
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
      .filter(entry => sessionAllowsOffice(entry.officeId))
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


