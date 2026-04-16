export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { getOfficeRecord, listOfficeRecords } from '@/lib/office-directory'
import { getNextAttendanceAction } from '@/lib/daily-attendance'
import { buildAttendanceEntryTiming, toLegacyAttendanceDate } from '@/lib/attendance-time'
import { enforceRateLimit, getRequestIp } from '@/lib/rate-limit'
import { createOriginGuard } from '@/lib/csrf'
import {
  createEmployeeViewSessionCookieValue,
  getEmployeeViewSessionCookieName,
  getEmployeeViewSessionMaxAge,
  isEmployeeViewSessionConfigured,
} from '@/lib/employee-view-auth'
import { isPersonApproved } from '@/lib/person-approval'
import { getBiometricReenrollmentAssessment } from '@/lib/biometrics/descriptor-utils'
import { writeScanEvent } from '@/lib/scan-events'
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
  buildAttendanceEntryPreview,
} from '@/lib/attendance'

function buildEmployeeViewSessionPayload(person, personId = '') {
  const reenrollmentAssessment = getBiometricReenrollmentAssessment(person)
  const payload = {
    needsReenrollment: reenrollmentAssessment.needed,
    reenrollmentReason: reenrollmentAssessment.reasonCode,
    reenrollmentMessage: reenrollmentAssessment.message,
    canSelfReenroll: isEmployeeViewSessionConfigured(),
    personId: person?.id || personId || null,
  }

  if (!payload.canSelfReenroll) {
    return payload
  }

  try {
    const employeeViewSession = createEmployeeViewSessionCookieValue({
      employeeId: person.employeeId,
      personId: person?.id || personId || '',
      officeId: person.officeId || '',
    })
    const maxAge = getEmployeeViewSessionMaxAge()
    payload.employeeViewSession = employeeViewSession
    payload.employeeViewSessionExpiresAt = Date.now() + (maxAge * 1000)
  } catch (cookieError) {
    console.warn('[Attendance] Failed to create employee view session:', cookieError?.message)
  }

  return payload
}

function attachEmployeeViewSessionCookie(response, payload) {
  if (!payload?.employeeViewSession) return response
  response.cookies.set(getEmployeeViewSessionCookieName(), payload.employeeViewSession, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: getEmployeeViewSessionMaxAge(),
    path: '/',
  })
  return response
}

async function writeFailedScanLog(db, entry, decisionCode, reason, extra = {}) {
  try {
    // Capture query descriptor diagnostics (first 10 values + magnitude)
    const rawDesc = Array.isArray(entry.descriptor) ? entry.descriptor : []
    const descMag = rawDesc.length > 0
      ? Math.round(Math.sqrt(rawDesc.reduce((s, v) => s + Number(v) * Number(v), 0)) * 10000) / 10000
      : null

    // Flatten debug info into safe Firestore-friendly primitives
    const metadata = {
      decisionCode,
      reason,
      timestamp: entry.timestamp || Date.now(),
      dateKey: entry.dateKey || '',
      latitude: entry.latitude ?? null,
      longitude: entry.longitude ?? null,
      officeId: extra.officeId || '',
      // Matching debug (from biometric-index)
      source: extra.source || '',
      candidatesFound: typeof extra.candidatesFound === 'number' ? extra.candidatesFound : null,
      candidateCount: typeof extra.candidateCount === 'number' ? extra.candidateCount : null,
      bestDistance: typeof extra.bestDistance === 'number' ? Math.round(extra.bestDistance * 10000) / 10000 : null,
      secondDistance: typeof extra.secondDistance === 'number' ? Math.round(extra.secondDistance * 10000) / 10000 : null,
      threshold: typeof extra.threshold === 'number' ? extra.threshold : null,
      ambiguousMargin: typeof extra.ambiguousMargin === 'number' ? extra.ambiguousMargin : null,
      storedMagnitude: typeof extra.storedMagnitude === 'number' ? Math.round(extra.storedMagnitude * 10000) / 10000 : null,
      queryMagnitude: typeof extra.queryMagnitude === 'number' ? Math.round(extra.queryMagnitude * 10000) / 10000 : null,
      officeIdsCount: typeof extra.officeIdsCount === 'number' ? extra.officeIdsCount : null,
      // Query descriptor diagnostics
      queryDescriptorLength: rawDesc.length,
      queryDescriptorMagnitude: descMag,
      captureMobile: Boolean(entry.captureContext?.mobile),
      capturePlatform: entry.captureContext?.platform || '',
      captureResolution: entry.captureContext?.captureResolution || '',
      captureVerificationFrames: Number.isFinite(entry.captureContext?.verificationFrames) ? Number(entry.captureContext.verificationFrames) : null,
      captureDescriptorSpread: Number.isFinite(entry.captureContext?.descriptorSpread)
        ? Math.round(Number(entry.captureContext.descriptorSpread) * 10000) / 10000
        : null,
      captureDeviceMemoryGb: Number.isFinite(entry.captureContext?.deviceMemoryGb) ? Number(entry.captureContext.deviceMemoryGb) : null,
      captureHardwareConcurrency: Number.isFinite(entry.captureContext?.hardwareConcurrency) ? Number(entry.captureContext.hardwareConcurrency) : null,
    }
    await db.collection('audit_logs').add({
      actorRole: 'kiosk',
      actorScope: 'public',
      actorOfficeId: '',
      action: 'attendance_scan_failed',
      targetType: 'attendance',
      targetId: '',
      officeId: metadata.officeId,
      summary: `Scan blocked: ${decisionCode} — ${reason}`,
      metadata,
      createdAt: FieldValue.serverTimestamp(),
    })
  } catch {
    // Non-fatal — audit log failure must never block the response
  }

  await writeScanEvent(db, {
    status: 'blocked',
    decisionCode,
    reason,
    entry,
    debug: extra,
    requestMeta: {
      officeId: extra.officeId || '',
    },
  })
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
      await writeScanEvent(db, {
        status: 'blocked',
        decisionCode: 'blocked_rate_limited',
        reason: 'Too many attendance requests from this client.',
        entry,
      })
      return NextResponse.json(
        { ok: false, message: 'Too many attendance requests. Slow down and try again.', decisionCode: 'blocked_rate_limited' },
        { status: 429 },
      )
    }

    // Validate antispoof/liveness scores sent by the client.
    // These come from @vladmandic/human's built-in models running in the browser.
    // Server-side validation prevents raw API calls from bypassing the check.
    if (entry.antispoof != null && entry.antispoof <= 0.3) {
      await writeFailedScanLog(db, entry, 'blocked_antispoof', `antispoof score ${entry.antispoof}`)
      return NextResponse.json(
        { ok: false, message: 'Photo or screen detected.', decisionCode: 'blocked_antispoof' },
        { status: 403 },
      )
    }
    if (entry.liveness != null && entry.liveness <= 0.3) {
      await writeFailedScanLog(db, entry, 'blocked_liveness', `liveness score ${entry.liveness}`)
      return NextResponse.json(
        { ok: false, message: 'Liveness check failed.', decisionCode: 'blocked_liveness' },
        { status: 403 },
      )
    }

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
      await writeFailedScanLog(db, entry, 'blocked_missing_office_config', 'Assigned office configuration missing', {
        employeeId: person.employeeId,
        officeId: person.officeId,
      })
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

    // STEP 5: Reject missing liveness/antispoof for on-site attendance.
    // WFH scans may come from kiosk-less workflows where camera scores are unavailable.
    // On-site scans must always supply finite scores — null means the client bypassed
    // the biometric pipeline (e.g. raw API call). The early threshold check above (≤ 0.3)
    // only fires when the value is non-null; this check closes the null-bypass gap.
    if (locationResult.attendanceMode !== 'WFH') {
      if (!Number.isFinite(entry.antispoof)) {
        await writeFailedScanLog(db, entry, 'blocked_missing_liveness', 'antispoof score missing or non-numeric')
        return NextResponse.json({ ok: false, message: 'Liveness check failed.', decisionCode: 'blocked_missing_liveness' }, { status: 403 })
      }
      if (!Number.isFinite(entry.liveness)) {
        await writeFailedScanLog(db, entry, 'blocked_missing_liveness', 'liveness score missing or non-numeric')
        return NextResponse.json({ ok: false, message: 'Liveness check failed.', decisionCode: 'blocked_missing_liveness' }, { status: 403 })
      }
    }

    // STEP 6: Determine action and write
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
      const latestDailyEntry = dailyLogs.length > 0
        ? buildAttendanceEntryPreview(dailyLogs[dailyLogs.length - 1])
        : null
      const employeeViewPayload = buildEmployeeViewSessionPayload(person, personMatch.personId)
      await writeFailedScanLog(db, entry, 'blocked_day_complete', 'Full day attendance already recorded', {
        employeeId: person.employeeId,
        officeId: person.officeId,
      })
      const response = NextResponse.json({
        ok: false,
        message: 'Full day attendance already recorded.',
        decisionCode: 'blocked_day_complete',
        entry: latestDailyEntry,
        ...employeeViewPayload,
      }, { status: 409 })
      return attachEmployeeViewSessionCookie(response, employeeViewPayload)
    }

    entry.action = nextAction
    const cooldownMs = getCooldownForActionMinutes(office, nextAction) * 60 * 1000

    const writeResult = await writeAttendanceAtomically(db, entry, cooldownMs)
    if (!writeResult.ok) {
      const cooldownMinutes = getCooldownForActionMinutes(office, nextAction)
      const employeeViewPayload = buildEmployeeViewSessionPayload(person, personMatch.personId)
      await writeFailedScanLog(db, entry, 'blocked_recent_duplicate', `Duplicate ${nextAction} attempt within cooldown window`, {
        employeeId: person.employeeId,
        officeId: person.officeId,
      })
      const response = NextResponse.json(
        {
          ok: false,
          message: `${nextAction === 'checkin' ? 'Check-in' : 'Check-out'} available again after ${cooldownMinutes} minute(s).`,
          decisionCode: 'blocked_recent_duplicate',
          entry: writeResult.entry,
          ...employeeViewPayload,
        },
        { status: 409 },
      )
      return attachEmployeeViewSessionCookie(response, employeeViewPayload)
    }

    await updateDailyAttendanceCache(db, writeResult.storedEntry, dailyLogs, person, office)
    await writeScanEvent(db, {
      status: 'accepted',
      decisionCode: entry.decisionCode || 'accepted',
      reason: `Attendance ${entry.action || 'recorded'}.`,
      entry,
      person,
      debug: personMatch.debug || null,
      requestMeta: {
        personId: person.id || personMatch.personId || '',
        officeId: person.officeId || '',
        attendanceMode: entry.attendanceMode || '',
        geofenceStatus: entry.geofenceStatus || '',
      },
    })

    const responsePayload = {
      ok: true,
      entry: writeResult.entryPreview,
      ...buildEmployeeViewSessionPayload(person, personMatch.personId),
    }
    if (process.env.NODE_ENV !== 'production') {
      const d = personMatch.debug
      responsePayload.debug = d
        ? { source: d.source, candidateCount: d.candidateCount, bestDistance: d.bestDistance, secondDistance: d.secondDistance, threshold: d.threshold }
        : null
    }

    const response = NextResponse.json(responsePayload)
    return attachEmployeeViewSessionCookie(response, responsePayload)
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
