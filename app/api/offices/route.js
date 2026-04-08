import { NextResponse } from 'next/server'
import { getAdminDb } from '../../../lib/firebase-admin'
import { REGION12_OFFICES } from '../../../lib/offices'
import { adminSessionAllowsOffice, getAdminSessionCookieName, parseAdminSessionCookieValue } from '../../../lib/admin-auth'

function normalizeOffice(office) {
  return {
    ...office,
    gps: {
      latitude: Number(office.gps?.latitude),
      longitude: Number(office.gps?.longitude),
      radiusMeters: Number(office.gps?.radiusMeters),
    },
    workPolicy: {
      schedule: String(office.workPolicy?.schedule || ''),
      workingDays: Array.isArray(office.workPolicy?.workingDays) ? office.workPolicy.workingDays.map(Number) : [],
      wfhDays: Array.isArray(office.workPolicy?.wfhDays) ? office.workPolicy.wfhDays.map(Number) : [],
      morningIn: String(office.workPolicy?.morningIn || '08:00'),
      morningOut: String(office.workPolicy?.morningOut || '12:00'),
      afternoonIn: String(office.workPolicy?.afternoonIn || '13:00'),
      afternoonOut: String(office.workPolicy?.afternoonOut || '17:00'),
      gracePeriodMinutes: Number(office.workPolicy?.gracePeriodMinutes ?? 0),
    },
  }
}

export async function GET(request) {
  try {
    const session = parseAdminSessionCookieValue(request.cookies.get(getAdminSessionCookieName())?.value)
    const db = getAdminDb()
    const snapshot = await db.collection('offices').orderBy('name').get()
    const offices = snapshot.empty
      ? REGION12_OFFICES.map(normalizeOffice)
      : snapshot.docs.map(record => normalizeOffice({ id: record.id, ...record.data() }))

    return NextResponse.json({ ok: true, offices: offices.filter(office => adminSessionAllowsOffice(session, office.id)) })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to load offices.' },
      { status: 500 },
    )
  }
}
