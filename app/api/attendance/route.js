export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/firebase-admin'
import { calculateDistanceMeters } from '@/lib/offices'
import { getOfficeRecord } from '@/lib/office-directory'
import { getNextAttendanceAction } from '@/lib/daily-attendance'
import { buildAttendanceEntryTiming, toLegacyAttendanceDate } from '@/lib/attendance-time'
import { enforceRateLimit, getRequestIp } from '@/lib/rate-limit'
import { analyzeLiveness } from '@/lib/biometrics/liveness'
import { createOriginGuard } from '@/lib/csrf'
import { isPersonApproved } from '@/lib/person-approval'
import {
  normalizeEntry,
  validateEntry,
  getCandidateAttendanceContext,
  getPersonsForOfficeIds,
  getAttendanceLogsForDate,
  getCooldownForActionMinutes,
  writeAttendanceAtomically,
  updateDailyAttendanceCache,
  findMatchFromCandidates,
  matchPersonFromDescriptor,
} from '@/lib/attendance'

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
    const hasCoordinates = Number.isFinite(entry.latitude) && Number.isFinite(entry.longitude)
    const ip = getRequestIp(request)

    const ipLimit = await enforceRateLimit(db, {
      key: `attendance-ip:${ip}`,
      limit: 30,
      windowMs: 60 * 1000,
    })
    if (!ipLimit.ok) {
      return NextResponse.json(
        { ok: false, message: 'Too many attendance requests. Slow down and try again.', decisionCode: 'blocked_rate_limited' },
        { status: 429 },
      )
    }

    if (entry.landmarks?.length > 0) {
      const livenessResult = analyzeLiveness(entry.landmarks)
      if (!livenessResult.live && livenessResult.reason === 'static_face') {
        return NextResponse.json(
          { ok: false, message: 'Liveness check failed. Move slightly and try again.', decisionCode: 'blocked_liveness_failed', debug: { liveness: livenessResult } },
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

    let personMatch = await findMatchFromCandidates(db, candidateOfficeIds, entry.descriptor)
    if (!personMatch.ok) {
      const candidatePersons = await getPersonsForOfficeIds(db, candidateOfficeIds)
      personMatch = matchPersonFromDescriptor(candidatePersons, entry.descriptor)
    }

    if (!personMatch.ok) {
      return NextResponse.json(
        { ok: false, message: personMatch.message, decisionCode: personMatch.decisionCode || 'blocked_no_reliable_match', debug: personMatch.debug || null },
        { status: 403 },
      )
    }

    const person = personMatch.person
    if (person.active === false) {
      return NextResponse.json({ ok: false, message: 'Employee account is inactive.', decisionCode: 'blocked_inactive' }, { status: 403 })
    }

    if (!isPersonApproved(person)) {
      return NextResponse.json({ ok: false, message: 'Employee enrollment is still pending admin approval.', decisionCode: 'blocked_pending_approval' }, { status: 403 })
    }

    const office = await getOfficeRecord(db, person.officeId)
    if (!office) {
      return NextResponse.json({ ok: false, message: 'Assigned office was not found.', decisionCode: 'blocked_missing_office_config' }, { status: 404 })
    }

    const officeMatchedOnsite = onsiteOfficeIds.includes(person.officeId)
    const officeMatchedWfh = wfhOfficeIds.includes(person.officeId)
    if (!officeMatchedOnsite && !officeMatchedWfh) {
      return NextResponse.json(
        { ok: false, message: 'Attendance context did not match the employee office.', decisionCode: 'blocked_wrong_office_context' },
        { status: 403 },
      )
    }

    entry.name = person.name
    entry.employeeId = person.employeeId
    entry.officeId = person.officeId
    entry.officeName = office.name
    entry.confidence = personMatch.confidence ?? entry.confidence
    entry.id = `${entry.employeeId}_${entry.timestamp}`

    const legacyDateLabel = toLegacyAttendanceDate(entry.dateKey)
    const dailyLogs = await getAttendanceLogsForDate(db, entry.employeeId, entry.dateKey, legacyDateLabel)
    const nextAction = getNextAttendanceAction(dailyLogs, office)

    if (nextAction === 'complete') {
      return NextResponse.json({ ok: false, message: 'Full day attendance already recorded.', decisionCode: 'blocked_day_complete' }, { status: 409 })
    }

    entry.action = nextAction
    const cooldownMinutes = getCooldownForActionMinutes(office, nextAction)
    const cooldownMs = cooldownMinutes * 60 * 1000

    if (officeMatchedWfh) {
      entry.attendanceMode = 'WFH'
      entry.geofenceStatus = hasCoordinates ? 'WFH — GPS location recorded' : 'WFH — no GPS confirmation'
      entry.decisionCode = 'accepted_wfh'
    } else {
      if (!hasCoordinates) {
        return NextResponse.json({ ok: false, message: 'GPS coordinates are required for on-site attendance.', decisionCode: 'blocked_missing_gps' }, { status: 400 })
      }

      const distanceMeters = calculateDistanceMeters({ latitude: entry.latitude, longitude: entry.longitude }, office.gps)
      if (distanceMeters > office.gps.radiusMeters) {
        return NextResponse.json({ ok: false, message: 'Outside office geofence.', decisionCode: 'blocked_geofence' }, { status: 403 })
      }

      entry.attendanceMode = 'On-site'
      entry.geofenceStatus = 'Inside office radius'
      entry.decisionCode = 'accepted_onsite'
    }

    const writeResult = await writeAttendanceAtomically(db, entry, cooldownMs)
    if (!writeResult.ok) {
      return NextResponse.json(
        { ok: false, message: `${nextAction === 'checkin' ? 'Check-in' : 'Check-out'} available again after ${cooldownMinutes} minute(s).`, decisionCode: 'blocked_recent_duplicate', entry: writeResult.entry },
        { status: 409 },
      )
    }

    await updateDailyAttendanceCache(db, writeResult.storedEntry, dailyLogs, person, office)

    const response = { ok: true, entry: writeResult.entryPreview }
    if (process.env.NODE_ENV !== 'production') {
      const d = personMatch.debug
      response.debug = d ? { source: d.source, candidateCount: d.candidateCount, bestDistance: d.bestDistance, secondDistance: d.secondDistance, threshold: d.threshold, ambiguousMargin: d.ambiguousMargin } : null
    }
    return NextResponse.json(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to log attendance.'

    if (message.includes('FAILED_PRECONDITION') && message.includes('query requires an index')) {
      return NextResponse.json(
        { ok: false, message: 'Attendance index is still building in Firestore. Try again after the index finishes.', decisionCode: 'blocked_index_building', debug: { source: 'firestore', detail: message } },
        { status: 503 },
      )
    }

    return NextResponse.json({ ok: false, message, decisionCode: 'blocked_server_error' }, { status: 500 })
  }
}
