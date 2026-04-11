export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { adminSessionAllowsOffice, getAdminSessionCookieName, parseAdminSessionCookieValue, resolveAdminSession } from '@/lib/admin-auth'

export async function GET(request) {
  const session = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
  if (!session) {
    return NextResponse.json({ ok: false, message: 'Admin login is required to load attendance.' }, { status: 401 })
  }

  try {
    const db = getAdminDb()
    const resolvedSession = await resolveAdminSession(db, session)
    if (!resolvedSession) {
      return NextResponse.json({ ok: false, message: 'Admin session is no longer valid.' }, { status: 403 })
    }

    const snapshot = resolvedSession.scope === 'office'
      ? await db.collection('attendance').where('officeId', '==', resolvedSession.officeId).get()
      : await db
        .collection('attendance')
        .orderBy('timestamp', 'desc')
        .limit(500)
        .get()

    const attendance = snapshot.docs.map(record => {
      const data = record.data()

      return {
        id: record.id,
        name: data.name || '',
        employeeId: data.employeeId || '',
        officeId: data.officeId || '',
        officeName: data.officeName || 'Unassigned',
        action: data.action || '',
        attendanceMode: data.attendanceMode || '',
        geofenceStatus: data.geofenceStatus || '',
        decisionCode: data.decisionCode || '',
        confidence: Number(data.confidence ?? 0),
        timestamp: Number(data.timestamp ?? 0),
        dateKey: data.dateKey || '',
        dateLabel: data.dateLabel || data.date || '',
        date: data.dateLabel || data.date || '',
        time: data.time || '',
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
      }
    })
      .filter(entry => adminSessionAllowsOffice(resolvedSession, entry.officeId))
      .sort((left, right) => right.timestamp - left.timestamp)
      .slice(0, 500)

    return NextResponse.json({ ok: true, attendance })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to load attendance.' },
      { status: 500 },
    )
  }
}

