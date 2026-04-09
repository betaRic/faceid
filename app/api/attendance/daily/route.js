import { NextResponse } from 'next/server'
import { getAdminDb } from '../../../../lib/firebase-admin'
import { adminSessionAllowsOffice, getAdminSessionCookieName, parseAdminSessionCookieValue, resolveAdminSession } from '../../../../lib/admin-auth'
import { toLegacyAttendanceDate } from '../../../../lib/attendance-time'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const date = String(searchParams.get('date') || '').trim()

  if (!date) {
    return NextResponse.json({ ok: false, message: 'Date is required.' }, { status: 400 })
  }

  const session = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Admin login is required to load daily attendance records.' }, { status: 401 })
  }

  try {
    const db = getAdminDb()
    const resolvedSession = await resolveAdminSession(db, session)
    if (!resolvedSession) {
      return NextResponse.json({ ok: false, message: 'Admin session is no longer valid.' }, { status: 403 })
    }

    const snapshot = await db
      .collection('attendance_daily')
      .where('dateKey', '==', date)
      .orderBy('name')
      .get()

    let records = snapshot.docs.map(record => ({
      id: record.id,
      ...record.data(),
    }))

    if (records.length === 0) {
      const legacySnapshot = await db
        .collection('attendance_daily')
        .where('date', '==', toLegacyAttendanceDate(date))
        .orderBy('name')
        .get()

      records = legacySnapshot.docs.map(record => ({
        id: record.id,
        ...record.data(),
      }))
    }

    records = records.filter(record => adminSessionAllowsOffice(resolvedSession, record.officeId))

    return NextResponse.json({ ok: true, records })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to load daily attendance records.' },
      { status: 500 },
    )
  }
}
