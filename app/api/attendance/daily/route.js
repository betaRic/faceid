import { NextResponse } from 'next/server'
import { getAdminDb } from '../../../../lib/firebase-admin'
import { adminSessionAllowsOffice, getAdminSessionCookieName, parseAdminSessionCookieValue } from '../../../../lib/admin-auth'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const date = String(searchParams.get('date') || '').trim()

  if (!date) {
    return NextResponse.json({ ok: false, message: 'Date is required.' }, { status: 400 })
  }

  try {
    const session = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
    const db = getAdminDb()
    const snapshot = await db
      .collection('attendance_daily')
      .where('date', '==', date)
      .orderBy('name')
      .get()

    const records = snapshot.docs.map(record => ({
      id: record.id,
      ...record.data(),
    })).filter(record => adminSessionAllowsOffice(session, record.officeId))

    return NextResponse.json({ ok: true, records })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to load daily attendance records.' },
      { status: 500 },
    )
  }
}
