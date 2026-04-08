import { NextResponse } from 'next/server'
import { getAdminDb } from '../../../../lib/firebase-admin'
import { adminSessionAllowsOffice, getAdminSessionCookieName, parseAdminSessionCookieValue } from '../../../../lib/admin-auth'

export async function GET(request) {
  try {
    const session = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
    const db = getAdminDb()
    const snapshot = await db
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
        attendanceMode: data.attendanceMode || '',
        geofenceStatus: data.geofenceStatus || '',
        decisionCode: data.decisionCode || '',
        confidence: Number(data.confidence ?? 0),
        timestamp: Number(data.timestamp ?? 0),
        date: data.date || '',
        time: data.time || '',
        latitude: data.latitude ?? null,
        longitude: data.longitude ?? null,
      }
    }).filter(entry => adminSessionAllowsOffice(session, entry.officeId))

    return NextResponse.json({ ok: true, attendance })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to load attendance.' },
      { status: 500 },
    )
  }
}
