import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminDb } from '../../../lib/firebase-admin'
import { REGION12_OFFICES, calculateDistanceMeters, isOfficeWfhDay } from '../../../lib/offices'
import { AMBIGUOUS_MATCH_MARGIN, DISTANCE_THRESHOLD } from '../../../lib/config'

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
    descriptor: Array.isArray(body?.descriptor) ? body.descriptor.map(Number) : [],
  }
}

function validateEntry(entry) {
  if (!entry.id) {
    return 'Attendance payload is incomplete.'
  }

  if (!Number.isFinite(entry.timestamp) || !entry.date || !entry.time) {
    return 'Attendance timestamp is invalid.'
  }

  if (entry.descriptor.length === 0 || entry.descriptor.some(value => !Number.isFinite(value))) {
    return 'Face descriptor is required for attendance verification.'
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

async function getAllActivePersons(db) {
  const snapshot = await db
    .collection('persons')
    .where('active', '!=', false)
    .get()

  return snapshot.docs.map(record => ({ id: record.id, ...record.data() }))
}

function euclideanDistance(left, right) {
  let total = 0

  for (let index = 0; index < left.length; index += 1) {
    const diff = left[index] - right[index]
    total += diff * diff
  }

  return Math.sqrt(total)
}

function matchPersonFromDescriptor(persons, descriptor) {
  const scored = persons
    .filter(person => Array.isArray(person.descriptors) && person.descriptors.length > 0)
    .map(person => ({
      person,
      distance: Math.min(...person.descriptors.map(sample => euclideanDistance(sample, descriptor))),
    }))
    .sort((left, right) => left.distance - right.distance)

  const best = scored[0]
  const second = scored[1] || null

  if (!best || best.distance > DISTANCE_THRESHOLD) {
    return { ok: false, message: 'No reliable face match was found.' }
  }

  const margin = second ? second.distance - best.distance : 1
  if (second && margin < AMBIGUOUS_MATCH_MARGIN) {
    return {
      ok: false,
      message: `Face match is too close between ${best.person.name} and ${second.person.name}.`,
    }
  }

  return {
    ok: true,
    person: best.person,
    distance: best.distance,
    confidence: 1 - best.distance,
  }
}

export async function POST(request) {
  const entry = normalizeEntry(await request.json().catch(() => null))
  const validationError = validateEntry(entry)
  if (validationError) {
    return NextResponse.json({ ok: false, message: validationError }, { status: 400 })
  }

  try {
    const db = getAdminDb()
    const personMatch = entry.employeeId
      ? await getPersonByEmployeeId(db, entry.employeeId).then(person => person ? ({
          ok: true,
          person,
          distance: null,
          confidence: entry.confidence || null,
        }) : { ok: false, message: 'Employee record was not found.' })
      : matchPersonFromDescriptor(await getAllActivePersons(db), entry.descriptor)

    if (!personMatch.ok) {
      return NextResponse.json({ ok: false, message: personMatch.message }, { status: 403 })
    }

    const person = personMatch.person
    if (person.active === false) {
      return NextResponse.json({ ok: false, message: 'Employee account is inactive.' }, { status: 403 })
    }

    const office = await getOffice(db, person.officeId)

    if (!office) {
      return NextResponse.json({ ok: false, message: 'Assigned office was not found.' }, { status: 404 })
    }

    entry.name = person.name
    entry.employeeId = person.employeeId
    entry.officeId = person.officeId
    entry.officeName = person.officeName
    entry.confidence = personMatch.confidence ?? entry.confidence

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
      descriptor: FieldValue.delete(),
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: false })

    return NextResponse.json({
      ok: true,
      entry: {
        ...entry,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : 'Failed to log attendance.' },
      { status: 500 },
    )
  }
}
