import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminDb } from '../../../lib/firebase-admin'
import { REGION12_OFFICES, calculateDistanceMeters, isOfficeWfhDay } from '../../../lib/offices'
import { AMBIGUOUS_MATCH_MARGIN, DISTANCE_THRESHOLD } from '../../../lib/config'
import { deriveDailyAttendanceRecord, getNextAttendanceAction } from '../../../lib/daily-attendance'
import { enforceRateLimit, getRequestIp } from '../../../lib/rate-limit'
import { euclideanDistance, matchBiometricIndexCandidates, queryBiometricIndexCandidates } from '../../../lib/biometric-index'
import { consumeAttendanceChallenge, getAttendanceChallenge } from '../../../lib/attendance-challenge'

function normalizeStoredDescriptors(value) {
  return (Array.isArray(value) ? value : [])
    .map(sample => {
      if (Array.isArray(sample)) return sample.map(Number)
      if (sample && typeof sample === 'object' && Array.isArray(sample.vector)) {
        return sample.vector.map(Number)
      }
      return null
    })
    .filter(sample => Array.isArray(sample) && sample.length > 0)
}

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
    challengeId: String(body?.challengeId || '').trim(),
  }
}

const TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000

function validateEntry(entry) {
  if (!entry.id) {
    return 'Attendance payload is incomplete.'
  }

  if (!Number.isFinite(entry.timestamp) || !entry.date || !entry.time) {
    return 'Attendance timestamp is invalid.'
  }

  if (Math.abs(entry.timestamp - Date.now()) > TIMESTAMP_TOLERANCE_MS) {
    return 'Attendance timestamp is too far from server time.'
  }

  if (entry.descriptor.length !== 128 || entry.descriptor.some(value => !Number.isFinite(value))) {
    return 'Face descriptor is required for attendance verification.'
  }

  if (!entry.challengeId) {
    return 'Attendance challenge is required.'
  }

  const norm = Math.sqrt(entry.descriptor.reduce((sum, value) => sum + value * value, 0))
  if (norm < 0.5 || norm > 2.0) {
    return 'Face descriptor is not valid.'
  }

  return null
}

async function getOffice(db, officeId) {
  const record = await db.collection('offices').doc(officeId).get()
  if (record.exists) return { id: record.id, ...record.data() }
  return REGION12_OFFICES.find(office => office.id === officeId) || null
}

async function getAllOffices(db) {
  const snapshot = await db.collection('offices').get()
  if (snapshot.empty) return REGION12_OFFICES
  return snapshot.docs.map(record => ({ id: record.id, ...record.data() }))
}

async function getPersonsForOfficeIds(db, officeIds) {
  if (!officeIds.length) return []

  const uniqueOfficeIds = Array.from(new Set(officeIds.filter(Boolean)))
  const chunks = []

  for (let index = 0; index < uniqueOfficeIds.length; index += 10) {
    chunks.push(uniqueOfficeIds.slice(index, index + 10))
  }

  const snapshots = await Promise.all(chunks.map(chunk => (
    db
      .collection('persons')
      .where('active', '==', true)
      .where('officeId', 'in', chunk)
      .get()
  )))

  const deduped = new Map()
  snapshots.forEach(snapshot => {
    snapshot.docs.forEach(record => {
      deduped.set(record.id, { id: record.id, ...record.data() })
    })
  })

  return Array.from(deduped.values())
}

function getCandidateOfficeIds(offices, entry) {
  const now = new Date(entry.timestamp)
  const wfhOfficeIds = offices
    .filter(office => isOfficeWfhDay(office, now))
    .map(office => office.id)

  if (!Number.isFinite(entry.latitude) || !Number.isFinite(entry.longitude)) {
    return {
      candidateOfficeIds: wfhOfficeIds,
      onsiteOfficeIds: [],
      wfhOfficeIds,
    }
  }

  const onsiteOfficeIds = offices
    .filter(office => {
      if (!Number.isFinite(office?.gps?.latitude) || !Number.isFinite(office?.gps?.longitude) || !Number.isFinite(office?.gps?.radiusMeters)) {
        return false
      }

      const distanceMeters = calculateDistanceMeters(
        { latitude: entry.latitude, longitude: entry.longitude },
        office.gps,
      )

      return distanceMeters <= office.gps.radiusMeters
    })
    .map(office => office.id)

  return {
    candidateOfficeIds: Array.from(new Set([...onsiteOfficeIds, ...wfhOfficeIds])),
    onsiteOfficeIds,
    wfhOfficeIds,
  }
}

async function getCandidateAttendanceContext(db, entry) {
  const offices = await getAllOffices(db)
  const candidateContext = getCandidateOfficeIds(offices, entry)

  return {
    offices,
    ...candidateContext,
  }
}

async function getAttendanceLogsForDate(db, employeeId, date) {
  const snapshot = await db
    .collection('attendance')
    .where('employeeId', '==', employeeId)
    .where('date', '==', date)
    .orderBy('timestamp', 'asc')
    .get()

  return snapshot.docs.map(record => ({ id: record.id, ...record.data() }))
}

async function getLatestAttendanceLog(db, employeeId) {
  const snapshot = await db
    .collection('attendance')
    .where('employeeId', '==', employeeId)
    .orderBy('timestamp', 'desc')
    .limit(1)
    .get()

  if (snapshot.empty) return null
  const record = snapshot.docs[0]
  return { id: record.id, ...record.data() }
}

function buildAttendanceDocId(employeeId, timestamp) {
  return `${employeeId}_${timestamp}`
}

async function writeAttendanceAtomically(db, entry) {
  const attendanceRef = db.collection('attendance').doc(buildAttendanceDocId(entry.employeeId, entry.timestamp))

  return db.runTransaction(async transaction => {
    const attendanceSnap = await transaction.get(attendanceRef)

    // Idempotency: exact same doc ID already committed
    if (attendanceSnap.exists) {
      return {
        ok: false,
        duplicate: true,
        entry: { id: attendanceSnap.id, ...attendanceSnap.data() },
      }
    }

    transaction.set(attendanceRef, {
      ...entry,
      descriptor: FieldValue.delete(),
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: false })

    return {
      ok: true,
      attendanceId: attendanceRef.id,
    }
  })
}

function getCooldownForActionMinutes(office, action) {
  const policy = office?.workPolicy || {}
  const raw = action === 'checkin'
    ? Number(policy.checkInCooldownMinutes ?? 30)
    : Number(policy.checkOutCooldownMinutes ?? 5)

  return Number.isFinite(raw) && raw >= 0 ? raw : action === 'checkin' ? 30 : 5
}

function matchPersonFromDescriptor(persons, descriptor) {
  const scored = persons
    .map(personRecord => ({
      person: personRecord,
      descriptors: normalizeStoredDescriptors(personRecord.descriptors),
    }))
    .filter(candidate => candidate.descriptors.length > 0)
    .map(candidate => ({
      person: candidate.person,
      distance: Math.min(...candidate.descriptors.map(sample => euclideanDistance(sample, descriptor))),
    }))
    .sort((left, right) => left.distance - right.distance)

  const best = scored[0]
  const second = scored[1] || null

  if (!best || best.distance > DISTANCE_THRESHOLD) {
    return { ok: false, decisionCode: 'blocked_no_reliable_match', message: 'No reliable face match was found.' }
  }

  const margin = second ? second.distance - best.distance : 1
  if (second && margin < AMBIGUOUS_MATCH_MARGIN) {
    return {
      ok: false,
      decisionCode: 'blocked_ambiguous_match',
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

async function resolveMatchedPerson(db, matchResult) {
  if (!matchResult.ok) return matchResult

  if (matchResult.person) {
    return matchResult
  }

  const record = await db.collection('persons').doc(matchResult.personId).get()
  if (!record.exists) {
    return { ok: false, decisionCode: 'blocked_no_reliable_match', message: 'Matched employee record no longer exists.' }
  }

  return {
    ok: true,
    person: { id: record.id, ...record.data() },
    distance: matchResult.distance,
    confidence: matchResult.confidence,
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
    const challenge = await getAttendanceChallenge(db, entry.challengeId)
    if (!challenge) {
      return NextResponse.json(
        { ok: false, message: 'Attendance challenge was not found.', decisionCode: 'blocked_invalid_challenge' },
        { status: 400 },
      )
    }

    const challengeResult = await consumeAttendanceChallenge(db, entry.challengeId)
    if (!challengeResult.ok) {
      return NextResponse.json(
        { ok: false, message: challengeResult.message, decisionCode: 'blocked_invalid_challenge' },
        { status: 400 },
      )
    }

    const ip = getRequestIp(request)
    const ipLimit = await enforceRateLimit(db, {
      key: `attendance-ip:${ip}`,
      limit: 120,
      windowMs: 60 * 1000,
    })

    if (!ipLimit.ok) {
      return NextResponse.json(
        { ok: false, message: 'Too many attendance requests from this device or network. Slow down and try again.', decisionCode: 'blocked_rate_limited' },
        { status: 429 },
      )
    }

    const { candidateOfficeIds, onsiteOfficeIds, wfhOfficeIds } = await getCandidateAttendanceContext(db, entry)

    if (candidateOfficeIds.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          message: 'No candidate office matched the current attendance context.',
          decisionCode: 'blocked_no_candidate_office',
        },
        { status: 404 },
      )
    }

    const indexedCandidates = await queryBiometricIndexCandidates(db, candidateOfficeIds, entry.descriptor)
    let personMatch = indexedCandidates.length > 0
      ? matchBiometricIndexCandidates(indexedCandidates, entry.descriptor, DISTANCE_THRESHOLD, AMBIGUOUS_MATCH_MARGIN)
      : null

    if (indexedCandidates.length > 0) {
      personMatch = await resolveMatchedPerson(db, personMatch)
    } else {
      const candidatePersons = await getPersonsForOfficeIds(db, candidateOfficeIds)
      personMatch = matchPersonFromDescriptor(candidatePersons, entry.descriptor)
    }

    if (!personMatch.ok) {
      return NextResponse.json(
        { ok: false, message: personMatch.message, decisionCode: personMatch.decisionCode || 'blocked_no_reliable_match' },
        { status: 403 },
      )
    }

    const person = personMatch.person
    if (person.active === false) {
      return NextResponse.json(
        { ok: false, message: 'Employee account is inactive.', decisionCode: 'blocked_inactive' },
        { status: 403 },
      )
    }

    const office = await getOffice(db, person.officeId)

    if (!office) {
      return NextResponse.json(
        {
          ok: false,
          message: 'Assigned office was not found.',
          decisionCode: 'blocked_missing_office_config',
        },
        { status: 404 },
      )
    }

    const officeMatchedOnsite = onsiteOfficeIds.includes(person.officeId)
    const officeMatchedWfh = wfhOfficeIds.includes(person.officeId)

    if (!officeMatchedOnsite && !officeMatchedWfh) {
      return NextResponse.json(
        {
          ok: false,
          message: 'Attendance context did not match the employee office.',
          decisionCode: 'blocked_wrong_office_context',
        },
        { status: 403 },
      )
    }

    entry.name = person.name
    entry.employeeId = person.employeeId
    entry.officeId = person.officeId
    entry.officeName = person.officeName
    entry.confidence = personMatch.confidence ?? entry.confidence
    entry.id = buildAttendanceDocId(entry.employeeId, entry.timestamp)

    const dailyLogs = await getAttendanceLogsForDate(db, entry.employeeId, entry.date)
    const nextAction = getNextAttendanceAction(dailyLogs, office)
    const latestAttendanceLog = await getLatestAttendanceLog(db, entry.employeeId)
    const cooldownMinutes = getCooldownForActionMinutes(office, nextAction)
    const cooldownMs = cooldownMinutes * 60 * 1000

    if (latestAttendanceLog && cooldownMs > 0 && entry.timestamp - latestAttendanceLog.timestamp < cooldownMs) {
      return NextResponse.json(
        {
          ok: false,
          message: `${nextAction === 'checkin' ? 'Check-in' : 'Check-out'} available again after ${cooldownMinutes} minute(s).`,
          decisionCode: 'blocked_recent_duplicate',
          entry: latestAttendanceLog,
        },
        { status: 409 },
      )
    }

    if (officeMatchedWfh) {
      entry.attendanceMode = 'WFH'
      entry.geofenceStatus = 'WFH office day'
      entry.decisionCode = 'accepted_wfh'
    } else {
      if (!Number.isFinite(entry.latitude) || !Number.isFinite(entry.longitude)) {
        return NextResponse.json(
          { ok: false, message: 'GPS coordinates are required for on-site attendance.', decisionCode: 'blocked_missing_gps' },
          { status: 400 },
        )
      }

      const distanceMeters = calculateDistanceMeters(
        { latitude: entry.latitude, longitude: entry.longitude },
        office.gps,
      )

      if (distanceMeters > office.gps.radiusMeters) {
        return NextResponse.json(
          { ok: false, message: `Outside ${office.name} geofence.`, decisionCode: 'blocked_geofence' },
          { status: 403 },
        )
      }

      entry.attendanceMode = 'On-site'
      entry.geofenceStatus = `Inside office radius (${Math.round(distanceMeters)}m)`
      entry.decisionCode = 'accepted_onsite'
    }

    const writeResult = await writeAttendanceAtomically(db, entry)
    if (!writeResult.ok) {
      return NextResponse.json(
        {
          ok: false,
          message: 'Attendance already recorded recently.',
          decisionCode: 'blocked_recent_duplicate',
          entry: writeResult.entry,
        },
        { status: 409 },
      )
    }

    const refreshedDailyLogs = await getAttendanceLogsForDate(db, entry.employeeId, entry.date)
    const dailyRecord = deriveDailyAttendanceRecord({
      logs: refreshedDailyLogs,
      person,
      office,
      targetDate: entry.date,
    })

    await db.collection('attendance_daily').doc(`${entry.employeeId}_${entry.date}`).set({
      ...dailyRecord,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })

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
