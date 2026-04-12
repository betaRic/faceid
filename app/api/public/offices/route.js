export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { listOfficeRecords } from '@/lib/office-directory'

function toPublicOffice(office) {
  return {
    id: String(office?.id || ''),
    code: String(office?.code || ''),
    officeType: String(office?.officeType || ''),
    name: String(office?.name || ''),
    shortName: String(office?.shortName || ''),
    location: String(office?.location || ''),
    provinceOrCity: String(office?.provinceOrCity || ''),
    status: String(office?.status || 'active'),
    wifiSsid: office?.wifiSsid || [],
    gps: {
      latitude: office?.gps?.latitude,
      longitude: office?.gps?.longitude,
      radiusMeters: office?.gps?.radiusMeters,
    },
    workPolicy: {
      schedule: office?.workPolicy?.schedule || '',
      workingDays: office?.workPolicy?.workingDays || [],
      wfhDays: office?.workPolicy?.wfhDays || [],
      morningIn: office?.workPolicy?.morningIn || '08:00',
      morningOut: office?.workPolicy?.morningOut || '12:00',
      afternoonIn: office?.workPolicy?.afternoonIn || '13:00',
      afternoonOut: office?.workPolicy?.afternoonOut || '17:00',
    },
  }
}

export async function GET() {
  try {
    const db = getAdminDb()
    const offices = await listOfficeRecords(db)

    return NextResponse.json({
      ok: true,
      offices: offices
        .filter(office => (office?.status || 'active') !== 'inactive')
        .map(toPublicOffice),
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to load offices.' },
      { status: 500 },
    )
  }
}


