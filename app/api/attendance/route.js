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
import { needsBiometricReenrollment } from '@/lib/biometrics/descriptor-utils'
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
      queryDescriptorSample: rawDesc.slice(0, 10).map(v => Math.round(Number(v) * 10000) / 10000),
      // Stored descriptor sample (from best candidate if available)
      storedDescriptorSample: Array.isArray(extra.storedDescriptorSample)
        ? extra.storedDescriptorSample.slice(0, 10).map(v => Math.round(Number(v) * 10000) / 10000)
        : null,
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

    const responsePayload = { ok: true, entry: writeResult.entryPreview }
    responsePayload.needsReenrollment = needsBiometricReenrollment(person)
    responsePayload.personId = person.id || personMatch.personId || null
    if (process.env.NODE_ENV !== 'production') {
      const d = personMatch.debug
      responsePayload.debug = d
        ? { source: d.source, candidateCount: d.candidateCount, bestDistance: d.bestDistance, secondDistance: d.secondDistance, threshold: d.threshold }
        : null
    }

    const response = NextResponse.json(responsePayload)
    if (isEmployeeViewSessionConfigured()) {
      try {
        response.cookies.set(getEmployeeViewSessionCookieName(), createEmployeeViewSessionCookieValue({
          employeeId: person.employeeId,
          personId: person.id || personMatch.personId || '',
          officeId: person.officeId || '',
        }), {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: getEmployeeViewSessionMaxAge(),
          path: '/',
        })
      } catch (cookieError) {
        console.warn('[Attendance] Failed to create employee view session:', cookieError?.message)
      }
    }

    return response
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
