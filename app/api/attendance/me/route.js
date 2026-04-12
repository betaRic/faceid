export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { listOfficeRecords } from '@/lib/office-directory'
import { toLegacyAttendanceDate } from '@/lib/attendance-time'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const employeeId = String(searchParams.get('employeeId') || '').trim()
  const date = String(searchParams.get('date') || new Date().toISOString().split('T')[0]).trim()

  if (!employeeId) {
    return NextResponse.json({ ok: false, message: 'Employee ID is required.' }, { status: 400 })
  }

  try {
    const db = getAdminDb()
    const offices = await listOfficeRecords(db)
    const officeMap = new Map(offices.map(o => [o.id, o]))
    const legacyDateLabel = toLegacyAttendanceDate(date)

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
        officeName: entry.officeId ? officeMap.get(entry.officeId)?.name || 'Unknown Office' : 'Unknown Office',
      }))
      .sort((a, b) => Number(a.timestamp ?? 0) - Number(b.timestamp ?? 0))

    const amIn = entries.find(e => e.action === 'check_in' && e.period === 'am')
    const amOut = entries.find(e => e.action === 'check_out' && e.period === 'am')
    const pmIn = entries.find(e => e.action === 'check_in' && e.period === 'pm')
    const pmOut = entries.find(e => e.action === 'check_out' && e.period === 'pm')

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
        amIn: amIn ? amIn.timeLabel : null,
        amOut: amOut ? amOut.timeLabel : null,
        pmIn: pmIn ? pmIn.timeLabel : null,
        pmOut: pmOut ? pmOut.timeLabel : null,
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