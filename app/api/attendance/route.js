import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminDb } from '../../../lib/firebase-admin'
import { REGION12_OFFICES, calculateDistanceMeters, isOfficeWfhDay } from '../../../lib/offices'

function normalizeEntry(body) {
  return {
    id: String(body?.id || '').trim(),
    name: String(body?.name || '').trim(),
    employeeId: String(body?.employeeId || '').trim(),
    officeId: String(body?.officeId || '').trim(),
    officeName: String(body?.officeName || '').trim(),
    attendanceMode: String(body?.attendanceMode || '').trim(),
    geofenceStatus: String(body?.geofenceStatus || '').trim(),
    confidence: Number(body?.confidence ?? 0),
    timestamp: Number(body?.timestamp),
    date: String(body?.date || '').trim(),
    time: String(body?.time || '').trim(),
    latitude: body?.latitude == null ? null : Number(body.latitude),
    longitude: body?.longitude == null ? null : Number(body.longitude),
  }
}

function validateEntry(entry) {
  if (!entry.id || !entry.name || !entry.employeeId || !entry.officeId || !entry.officeName) {
    return 'Attendance payload is incomplete.'
  }

  if (!Number.isFinite(entry.timestamp) || !entry.date || !entry.time) {
    return 'Attendance timestamp is invalid.'
  }

  return null
}

async function getOffice(db, officeId) {
  const record = await db.collection('offices').doc(officeId).get()
  if (record.exists) return { id: record.id, ...record.data() }
  return REGION12_OFFICES.find(office => office.id === officeId) || null
}

async function getPersonByEmployeeId(db, employeeId) {
  const snapshot = await db
    .collection('persons')
    .where('employeeId', '==', employeeId)
    .limit(1)
    .get()

  if (snapshot.empty) return null

  const record = snapshot.docs[0]
  return { id: record.id, ...record.data() }
}

export async function POST(request) {
  const entry = normalizeEntry(await request.json().catch(() => null))
  const validationError = validateEntry(entry)
  if (validationError) {
    return NextResponse.json({ ok: false, message: validationError }, { status: 400 })
  }

  try {
    const db = getAdminDb()
    const person = await getPersonByEmployeeId(db, entry.employeeId)

    if (!person) {
      return NextResponse.json({ ok: false, message: 'Employee record was not found.' }, { status: 404 })
    }

    if (person.active === false) {
      return NextResponse.json({ ok: false, message: 'Employee account is inactive.' }, { status: 403 })
    }

    const office = await getOffice(db, person.officeId)

    if (!office) {
      return NextResponse.json({ ok: false, message: 'Assigned office was not found.' }, { status: 404 })
    }

    entry.name = person.name
    entry.officeId = person.officeId
    entry.officeName = person.officeName

    if (isOfficeWfhDay(office)) {
      entry.attendanceMode = 'WFH'
      entry.geofenceStatus = 'WFH office day'
    } else {
      if (!Number.isFinite(entry.latitude) || !Number.isFinite(entry.longitude)) {
        return NextResponse.json({ ok: false, message: 'GPS coordinates are required for on-site attendance.' }, { status: 400 })
      }

      const distanceMeters = calculateDistanceMeters(
        { latitude: entry.latitude, longitude: entry.longitude },
        office.gps,
      )

      if (distanceMeters > office.gps.radiusMeters) {
        return NextResponse.json({ ok: false, message: `Outside ${office.name} geofence.` }, { status: 403 })
      }

      entry.attendanceMode = 'On-site'
      entry.geofenceStatus = `Inside office radius (${Math.round(distanceMeters)}m)`
    }

    await db.collection('attendance').doc(entry.id).set({
      ...entry,
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: false })

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to log attendance.' },
      { status: 500 },
    )
  }
}
