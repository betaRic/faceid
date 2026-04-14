export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { buildAttendanceSummary } from '@/lib/attendance-summary'
import { toLegacyAttendanceDate } from '@/lib/attendance-time'
import { listOfficeRecords } from '@/lib/office-directory'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const date = String(searchParams.get('date') || '').trim()
  const officeIdFilter = String(searchParams.get('officeId') || 'all').trim()

  if (!date) {
    return NextResponse.json({ ok: false, message: 'Date is required.' }, { status: 400 })
  }

  try {
    const db = getAdminDb()
    const offices = await listOfficeRecords(db)
    const legacyDateLabel = toLegacyAttendanceDate(date)

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