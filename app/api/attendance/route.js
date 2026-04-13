export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { getOfficeRecord, listOfficeRecords } from '@/lib/office-directory'
import { getNextAttendanceAction } from '@/lib/daily-attendance'
import { buildAttendanceEntryTiming, toLegacyAttendanceDate } from '@/lib/attendance-time'
import { enforceRateLimit, getRequestIp } from '@/lib/rate-limit'
import { analyzeLiveness } from '@/lib/biometrics/liveness'
import { createOriginGuard } from '@/lib/csrf'
import { isPersonApproved } from '@/lib/person-approval'
import { FieldValue } from 'firebase-admin/firestore'
import {
  normalizeEntry,
  validateEntry,
  checkAttendanceLocation,
  getAttendanceLogsForDate,
  getCooldownForActionMinutes,
  writeAttendanceAtomically,
  updateDailyAttendanceCache,
  findGlobalMatch,
} from '@/lib/attendance'

async function writeFailedScanLog(db, entry, decisionCode, reason, extra = {}) {
  try {
    await db.collection('audit_logs').add({
      actorRole: 'kiosk',
      actorScope: 'public',
      actorOfficeId: '',
      action: 'attendance_scan_failed',
      targetType: 'attendance',
      targetId: '',
      officeId: extra.officeId || '',
      summary: `Scan blocked: ${decisionCode} — ${reason}`,
      metadata: {
        decisionCode,
        reason,
        timestamp: entry.timestamp || Date.now(),
        dateKey: entry.dateKey || '',
        latitude: entry.latitude ?? null,
        longitude: entry.longitude ?? null,
        ...extra,
      },
      createdAt: FieldValue.serverTimestamp(),
    })
  } catch {
    // Non-fatal — audit log failure must never block the response
  }
}

export async function POST(request) {
  const guard = createOriginGuard()
  const originError = await guard(request)
  if (originError) return originError

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
    const ip = getRequestIp(request)

    const ipLimit = await enforceRateLimit(db, {
      key: `attendance-ip:${ip}`,
      limit: 60,
      windowMs: 60 * 1000,
    })
    if (!ipLimit.ok) {
      return NextResponse.json(
        { ok: false, message: 'Too many attendance requests. Slow down and try again.', decisionCode: 'blocked_rate_limited' },
        { status: 429 },
      )
    }

    // Liveness check — DISABLED for testing, re-enable after verifying matching works
    // if (entry.landmarks?.length > 0) {
    //   const livenessResult = analyzeLiveness(entry.landmarks)
    //   if (
    //     !livenessResult.live &&
    //     (livenessResult.reason === 'static_face' ||
    //       livenessResult.reason === 'photo_detected_flat' ||
    //       livenessResult.reason === 'photo_detected_flat_no_blink')
    //   ) {
    //     await writeFailedScanLog(db, entry, 'blocked_liveness_failed', livenessResult.reason)
    //     return NextResponse.json(
    //       { ok: false, message: 'Photo detected. Please scan your real face, not a photo.', decisionCode: livenessResult.reason },
    //       { status: 403 },
    //     )
    //   }
    // }

    // Fetch all offices once — used for both global match (office IDs) and location check
    const allOffices = await listOfficeRecords(db)
    const allOfficeIds = allOffices.map(o => o.id)

    // STEP 1: Global biometric match — identify who the person is first
    const personMatch = await findGlobalMatch(db, allOfficeIds, entry.descriptor)
    if (!personMatch.ok) {
      await writeFailedScanLog(db, entry, personMatch.decisionCode, personMatch.message, personMatch.debug || {})
      const failResponse = { ok: false, message: personMatch.message, decisionCode: personMatch.decisionCode }
      failResponse.debug = personMatch.debug ?? null
      return NextResponse.json(failResponse, { status: 403 })
    }

    // STEP 2: Person status checks
    const person = personMatch.person
    if (person.active === false) {
      await writeFailedScanLog(db, entry, 'blocked_inactive', 'Employee account inactive', { employeeId: person.employeeId, name: person.name })
      return NextResponse.json({ ok: false, message: 'Employee account is inactive.', decisionCode: 'blocked_inactive' }, { status: 403 })
    }
    if (!isPersonApproved(person)) {
      await writeFailedScanLog(db, entry, 'blocked_pending_approval', 'Enrollment not yet approved', { employeeId: person.employeeId, name: person.name })
      return NextResponse.json({ ok: false, message: 'Employee enrollment is still pending admin approval.', decisionCode: 'blocked_pending_approval' }, { status: 403 })
    }

    // STEP 3: Get person's assigned office
    const office = await getOfficeRecord(db, person.officeId)
    if (!office) {
      return NextResponse.json({ ok: false, message: 'Assigned office was not found.', decisionCode: 'blocked_missing_office_config' }, { status: 404 })
    }

    // STEP 4: Location check — WFH or GPS within any DILG office geofence
    const locationResult = checkAttendanceLocation(person, office, entry, allOffices)
    if (!locationResult.ok) {
      await writeFailedScanLog(db, entry, locationResult.decisionCode, locationResult.message, {
        employeeId: person.employeeId,
        officeId: person.officeId,
      })
      return NextResponse.json(
        { ok: false, message: locationResult.message, decisionCode: locationResult.decisionCode },
        { status: 403 },
      )
    }

    // STEP 5: Determine action and write
    entry.name = person.name
    entry.employeeId = person.employeeId
    entry.officeId = person.officeId
    entry.officeName = office.name
    entry.confidence = personMatch.confidence ?? entry.confidence
    entry.attendanceMode = locationResult.attendanceMode
    entry.geofenceStatus = locationResult.geofenceStatus
    entry.decisionCode = locationResult.decisionCode
    entry.id = `${entry.employeeId}_${entry.timestamp}`

    const legacyDateLabel = toLegacyAttendanceDate(entry.dateKey)
    const dailyLogs = await getAttendanceLogsForDate(db, entry.employeeId, entry.dateKey, legacyDateLabel)
    const nextAction = getNextAttendanceAction(dailyLogs, office)

    if (nextAction === 'complete') {
      return NextResponse.json({ ok: false, message: 'Full day attendance already recorded.', decisionCode: 'blocked_day_complete' }, { status: 409 })
    }

    entry.action = nextAction
    const cooldownMs = getCooldownForActionMinutes(office, nextAction) * 60 * 1000

    const writeResult = await writeAttendanceAtomically(db, entry, cooldownMs)
    if (!writeResult.ok) {
      const cooldownMinutes = getCooldownForActionMinutes(office, nextAction)
      return NextResponse.json(
        { ok: false, message: `${nextAction === 'checkin' ? 'Check-in' : 'Check-out'} available again after ${cooldownMinutes} minute(s).`, decisionCode: 'blocked_recent_duplicate', entry: writeResult.entry },
        { status: 409 },
      )
    }

    await updateDailyAttendanceCache(db, writeResult.storedEntry, dailyLogs, person, office)

    const response = { ok: true, entry: writeResult.entryPreview }
    if (process.env.NODE_ENV !== 'production') {
      const d = personMatch.debug
      response.debug = d
        ? { source: d.source, candidateCount: d.candidateCount, bestDistance: d.bestDistance, secondDistance: d.secondDistance, threshold: d.threshold }
        : null
    }
    return NextResponse.json(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to log attendance.'
    if (message.includes('FAILED_PRECONDITION') && message.includes('query requires an index')) {
      return NextResponse.json(
        { ok: false, message: 'Attendance index is still building in Firestore. Try again after the index finishes.', decisionCode: 'blocked_index_building' },
        { status: 503 },
      )
    }
    return NextResponse.json({ ok: false, message, decisionCode: 'blocked_server_error' }, { status: 500 })
  }
}