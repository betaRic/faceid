import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminDb } from '../../../lib/firebase-admin'
import { calculateDistanceMeters, isOfficeWfhDay } from '../../../lib/offices'
import {
  AMBIGUOUS_MATCH_MARGIN,
  DESCRIPTOR_LENGTH,
  DISTANCE_THRESHOLD,
} from '../../../lib/config'
import { deriveDailyAttendanceRecord, getNextAttendanceAction } from '../../../lib/daily-attendance'
import { enforceRateLimit, getRequestIp } from '../../../lib/rate-limit'
import {
  euclideanDistance,
  matchBiometricIndexCandidates,
  queryBiometricIndexCandidates,
} from '../../../lib/biometric-index'
import { buildAttendanceEntryTiming, toLegacyAttendanceDate } from '../../../lib/attendance-time'
import { getOfficeRecord, listOfficeRecords } from '../../../lib/office-directory'
import { isPersonApproved } from '../../../lib/person-approval'
import { analyzeLiveness } from '../../../lib/biometrics/liveness'
import { normalizeStoredDescriptors } from '../../../lib/biometrics/descriptor-utils'

function normalizeEntry(body) {
  return {
    name: String(body?.name || '').trim(),
    employeeId: String(body?.employeeId || '').trim(),
    officeId: String(body?.officeId || '').trim(),
    officeName: String(body?.officeName || '').trim(),
    attendanceMode: String(body?.attendanceMode || '').trim(),
    geofenceStatus: String(body?.geofenceStatus || '').trim(),
    confidence: Number(body?.confidence ?? 0),
    timestamp: Number(body?.timestamp),
    date: String(body?.date || '').trim(),
    dateKey: String(body?.dateKey || '').trim(),
    dateLabel: String(body?.dateLabel || '').trim(),
    time: String(body?.time || '').trim(),
    latitude: body?.latitude == null ? null : Number(body.latitude),
    longitude: body?.longitude == null ? null : Number(body.longitude),
    descriptor: Array.isArray(body?.descriptor) ? body.descriptor.map(Number) : [],
    landmarks: Array.isArray(body?.landmarks) ? body.landmarks : [],
  }
}

function validateEntry(entry) {
  // Length and numeric validity are sufficient. Norm check removed:
  // @vladmandic/human produces non-unit-normalized embeddings whose L2 norm
  // varies significantly by device and model version (~1 to ~32+). Checking
  // the norm here causes false rejections and provides zero security benefit —
  // a malicious actor can trivially craft a descriptor with any norm they want.
  if (
    !Array.isArray(entry.descriptor) ||
    entry.descriptor.length !== DESCRIPTOR_LENGTH ||
    entry.descriptor.some(value => !Number.isFinite(value))
  ) {
    return `Face descriptor must be a ${DESCRIPTOR_LENGTH}-dimensional numeric array.`
  }

  if ((entry.latitude == null) !== (entry.longitude == null)) {
    return 'GPS coordinates must include both latitude and longitude.'
  }

  if (entry.latitude != null && !Number.isFinite(entry.latitude)) {
    return 'Latitude is not valid.'
  }

  if (entry.longitude != null && !Number.isFinite(entry.longitude)) {
    return 'Longitude is not valid.'
  }

  return null
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

  return Array.from(deduped.values()).filter(person => isPersonApproved(person))
}

function getCandidateOfficeIds(offices, entry) {
  const now = new Date(entry.timestamp)
  const wfhOfficeIds = offices
    .filter(office => isOfficeWfhDay(office, now))
    .map(office => office.id)

  if (!Number.isFinite(entry.latitude) || !Number.isFinite(entry.longitude)) {
    return { candidateOfficeIds: wfhOfficeIds, onsiteOfficeIds: [], wfhOfficeIds }
  }

  const onsiteOfficeIds = offices
    .filter(office => {
      if (
        !Number.isFinite(office?.gps?.latitude) ||
        !Number.isFinite(office?.gps?.longitude) ||
        !Number.isFinite(office?.gps?.radiusMeters)
      ) return false

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
  const offices = await listOfficeRecords(db)
  const candidateContext = getCandidateOfficeIds(offices, entry)
  return { offices, ...candidateContext }
}

async function getAttendanceLogsForDate(db, employeeId, dateKey, legacyDateLabel = '') {
  const snapshot = await db
    .collection('attendance')
    .where('employeeId', '==', employeeId)
    .where('dateKey', '==', dateKey)
    .orderBy('timestamp', 'asc')
    .get()

  if (!snapshot.empty) {
    return snapshot.docs.map(record => ({ id: record.id, ...record.data() }))
  }

  if (!legacyDateLabel) return []

  const legacySnapshot = await db
    .collection('attendance')
    .where('employeeId', '==', employeeId)
    .where('date', '==', legacyDateLabel)
    .orderBy('timestamp', 'asc')
    .get()

  return legacySnapshot.docs.map(record => ({ id: record.id, ...record.data() }))
}

function buildAttendanceDocId(employeeId, timestamp) {
  return `${employeeId}_${timestamp}`
}

function buildStoredAttendanceEntry(entry) {
  const { descriptor, landmarks, ...storedEntry } = entry
  return storedEntry
}

function buildAttendanceEntryPreview(entry) {
  if (!entry) return null
  return {
    id: entry.id || buildAttendanceDocId(entry.employeeId, entry.timestamp),
    name: entry.name || '',
    employeeId: entry.employeeId || '',
    officeId: entry.officeId || '',
    officeName: entry.officeName || '',
    action: entry.action || '',
    attendanceMode: entry.attendanceMode || '',
    geofenceStatus: entry.geofenceStatus || '',
    decisionCode: entry.decisionCode || '',
    confidence: Number(entry.confidence ?? 0),
    timestamp: Number(entry.timestamp ?? 0),
    dateKey: entry.dateKey || '',
    dateLabel: entry.dateLabel || entry.date || '',
    date: entry.dateLabel || entry.date || '',
    time: entry.time || '',
  }
}

async function writeAttendanceAtomically(db, entry, cooldownMs) {
  const attendanceId = buildAttendanceDocId(entry.employeeId, entry.timestamp)
  const attendanceRef = db.collection('attendance').doc(attendanceId)
  const attendanceLockRef = db.collection('attendance_locks').doc(entry.employeeId)
  const storedEntry = buildStoredAttendanceEntry(entry)
  const entryPreview = buildAttendanceEntryPreview({ ...storedEntry, id: attendanceId })

  return db.runTransaction(async transaction => {
    const [attendanceSnap, attendanceLockSnap] = await Promise.all([
      transaction.get(attendanceRef),
      transaction.get(attendanceLockRef),
    ])

    if (attendanceSnap.exists) {
      return {
        ok: false,
        duplicate: true,
        entry: buildAttendanceEntryPreview({ id: attendanceSnap.id, ...attendanceSnap.data() }),
      }
    }

    const lastTimestamp = Number(attendanceLockSnap.data()?.lastTimestamp ?? 0)
    if (cooldownMs > 0 && lastTimestamp && entry.timestamp - lastTimestamp < cooldownMs) {
      return {
        ok: false,
        duplicate: true,
        entry: attendanceLockSnap.data()?.lastEntryPreview || null,
      }
    }

    transaction.set(attendanceRef, {
      ...storedEntry,
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: false })

    transaction.set(attendanceLockRef, {
      employeeId: entry.employeeId,
      officeId: entry.officeId,
      lastTimestamp: entry.timestamp,
      lastAttendanceId: attendanceId,
      lastAction: entry.action || '',
      lastEntryPreview: entryPreview,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })

    return { ok: true, attendanceId, storedEntry, entryPreview }
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
  const debug = {
    source: 'office_fallback',
    candidateCount: scored.length,
    bestDistance: best?.distance ?? null,
    secondDistance: second?.distance ?? null,
    threshold: DISTANCE_THRESHOLD,
    ambiguousMargin: AMBIGUOUS_MATCH_MARGIN,
    bestName: best?.person?.name ?? '',
    secondName: second?.person?.name ?? '',
  }

  if (!best || best.distance > DISTANCE_THRESHOLD) {
    return { ok: false, decisionCode: 'blocked_no_reliable_match', message: 'No reliable face match was found.', debug }
  }

  const margin = second ? second.distance - best.distance : 1
  if (second && margin < AMBIGUOUS_MATCH_MARGIN) {
    return {
      ok: false,
      decisionCode: 'blocked_ambiguous_match',
      message: `Face match is too close between ${best.person?.name} and ${second.person?.name}.`,
      debug,
    }
  }

  return {
    ok: true,
    person: best.person,
    distance: best.distance,
    confidence: 1 - best.distance,
    debug,
  }
}

async function resolveMatchedPerson(db, matchResult) {
  if (!matchResult.ok) return matchResult

  if (matchResult.person) return matchResult

  const record = await db.collection('persons').doc(matchResult.personId).get()
  if (!record.exists) {
    return { ok: false, decisionCode: 'blocked_no_reliable_match', message: 'Matched employee record no longer exists.' }
  }

  return {
    ok: true,
    person: { id: record.id, ...record.data() },
    distance: matchResult.distance,
    confidence: matchResult.confidence,
    debug: matchResult.debug || null,
  }
}

export async function POST(request) {
  const requestEntry = normalizeEntry(await request.json().catch(() => null))
  const validationError = validateEntry(requestEntry)
  if (validationError) {
    return NextResponse.json({ ok: false, message: validationError }, { status: 400 })
  }

  try {
    const db = getAdminDb()
    const entry = {
      ...requestEntry,
      ...buildAttendanceEntryTiming(Date.now()),
    }
    const hasCoordinates = Number.isFinite(entry.latitude) && Number.isFinite(entry.longitude)
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

    // Passive liveness check
    if (entry.landmarks && entry.landmarks.length > 0) {
      const livenessResult = analyzeLiveness(entry.landmarks)
      if (!livenessResult.live && livenessResult.reason === 'static_face') {
        return NextResponse.json(
          {
            ok: false,
            message: 'Liveness check failed. Move slightly and try again.',
            decisionCode: 'blocked_liveness_failed',
            debug: { liveness: livenessResult },
          },
          { status: 403 },
        )
      }
    }

    const { candidateOfficeIds, onsiteOfficeIds, wfhOfficeIds } = await getCandidateAttendanceContext(db, entry)

    if (candidateOfficeIds.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          message: hasCoordinates
            ? 'No candidate office matched the current attendance context.'
            : 'Location is required for on-site attendance. WFH attendance only works when the assigned office is on a configured WFH day.',
          decisionCode: hasCoordinates ? 'blocked_no_candidate_office' : 'blocked_missing_gps',
        },
        { status: hasCoordinates ? 404 : 400 },
      )
    }

    // Identity matching via biometric index
    const indexedCandidates = await queryBiometricIndexCandidates(db, candidateOfficeIds, entry.descriptor)
    let personMatch = null

    if (indexedCandidates.length > 0) {
      const indexedMatch = await resolveMatchedPerson(
        db,
        matchBiometricIndexCandidates(indexedCandidates, entry.descriptor, DISTANCE_THRESHOLD, AMBIGUOUS_MATCH_MARGIN),
      )
      if (indexedMatch.ok) {
        personMatch = indexedMatch
      }
    }

    // Fallback: full scan when index misses. Should be rare — run backfill if frequent.
    if (!personMatch) {
      const candidatePersons = await getPersonsForOfficeIds(db, candidateOfficeIds)
      personMatch = matchPersonFromDescriptor(candidatePersons, entry.descriptor)
    }

    if (!personMatch.ok) {
      return NextResponse.json(
        {
          ok: false,
          message: personMatch.message,
          decisionCode: personMatch.decisionCode || 'blocked_no_reliable_match',
          debug: personMatch.debug || null,
        },
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

    if (!isPersonApproved(person)) {
      return NextResponse.json(
        { ok: false, message: 'Employee enrollment is still pending admin approval.', decisionCode: 'blocked_pending_approval' },
        { status: 403 },
      )
    }

    const office = await getOfficeRecord(db, person.officeId)
    if (!office) {
      return NextResponse.json(
        { ok: false, message: 'Assigned office was not found.', decisionCode: 'blocked_missing_office_config' },
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
    entry.officeName = office.name
    entry.confidence = personMatch.confidence ?? entry.confidence
    entry.id = buildAttendanceDocId(entry.employeeId, entry.timestamp)

    const legacyDateLabel = toLegacyAttendanceDate(entry.dateKey)
    const dailyLogs = await getAttendanceLogsForDate(db, entry.employeeId, entry.dateKey, legacyDateLabel)
    const nextAction = getNextAttendanceAction(dailyLogs, office)

    if (nextAction === 'complete') {
      return NextResponse.json(
        {
          ok: false,
          message: 'Attendance for today is already complete. See you tomorrow.',
          decisionCode: 'blocked_day_complete',
        },
        { status: 409 },
      )
    }

    entry.action = nextAction
    const cooldownMinutes = getCooldownForActionMinutes(office, nextAction)
    const cooldownMs = cooldownMinutes * 60 * 1000

    if (officeMatchedWfh && !officeMatchedOnsite) {
      entry.attendanceMode = 'WFH'
      entry.geofenceStatus = hasCoordinates
        ? 'WFH — GPS location recorded'
        : 'WFH — no GPS confirmation'
      entry.decisionCode = 'accepted_wfh'
    } else {
      if (!hasCoordinates) {
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
          { ok: false, message: 'Outside office geofence.', decisionCode: 'blocked_geofence' },
          { status: 403 },
        )
      }

      entry.attendanceMode = 'On-site'
      entry.geofenceStatus = 'Inside office radius'
      entry.decisionCode = 'accepted_onsite'
    }

    const writeResult = await writeAttendanceAtomically(db, entry, cooldownMs)
    if (!writeResult.ok) {
      return NextResponse.json(
        {
          ok: false,
          message: `${nextAction === 'checkin' ? 'Check-in' : 'Check-out'} available again after ${cooldownMinutes} minute(s).`,
          decisionCode: 'blocked_recent_duplicate',
          entry: writeResult.entry,
        },
        { status: 409 },
      )
    }

    const refreshedDailyLogs = [...dailyLogs, writeResult.storedEntry]
      .sort((left, right) => Number(left.timestamp ?? 0) - Number(right.timestamp ?? 0))
    const dailyRecord = deriveDailyAttendanceRecord({
      logs: refreshedDailyLogs,
      person,
      office,
      targetDateKey: entry.dateKey,
      targetDateLabel: entry.dateLabel,
    })

    await db.collection('attendance_daily').doc(`${entry.employeeId}_${entry.dateKey}`).set({
      ...dailyRecord,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true }).catch(() => null)

    return NextResponse.json({
      ok: true,
      entry: writeResult.entryPreview,
      debug: personMatch.debug || null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to log attendance.'

    if (message.includes('FAILED_PRECONDITION') && message.includes('query requires an index')) {
      return NextResponse.json(
        {
          ok: false,
          message: 'Attendance index is still building in Firestore. Try again after the index finishes.',
          decisionCode: 'blocked_index_building',
          debug: { source: 'firestore', detail: message },
        },
        { status: 503 },
      )
    }

    return NextResponse.json(
      { ok: false, message, decisionCode: 'blocked_server_error' },
      { status: 500 },
    )
  }
}
