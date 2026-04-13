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
import { FieldValue } from 'firebase-admin/firestore'
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

// Write a structured failed-scan record to audit_logs so admins can
// investigate "it didn't record my attendance" disputes.
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
    const hasCoordinates = Number.isFinite(entry.latitude) && Number.isFinite(entry.longitude)
    const ip = getRequestIp(request)

    // Raised from 30 to 60 — shared NAT at government offices means many employees
    // share one IP. 30/min is too tight when 2 kiosk tablets run simultaneously.
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

    // Liveness check — landmarks are client-provided so this is a weak gate,
    // but it filters out the most obvious replay attacks (static image captures)
    if (entry.landmarks?.length > 0) {
      const livenessResult = analyzeLiveness(entry.landmarks)
      if (!livenessResult.live && livenessResult.reason === 'static_face') {
        await writeFailedScanLog(db, entry, 'blocked_liveness_failed', 'Static face detected')
        return NextResponse.json(
          { ok: false, message: 'Liveness check failed. Move slightly and try again.', decisionCode: 'blocked_liveness_failed', debug: { liveness: livenessResult } },
          { status: 403 },
        )
      }
    }

    const { candidateOfficeIds, onsiteOfficeIds, wfhOfficeIds } = await getCandidateAttendanceContext(db, entry)
    if (candidateOfficeIds.length === 0) {
      const decisionCode = hasCoordinates ? 'blocked_no_candidate_office' : 'blocked_missing_gps'
      await writeFailedScanLog(db, entry, decisionCode, hasCoordinates ? 'No office matched location' : 'No GPS provided', { hasCoordinates })
      return NextResponse.json(
        {
          ok: false,
          message: hasCoordinates
            ? 'No candidate office matched the current attendance context.'
            : 'Location is required for on-site attendance.',
          decisionCode,
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
      // Log failed face match — critical for dispute resolution
      await writeFailedScanLog(db, entry, personMatch.decisionCode || 'blocked_no_reliable_match', personMatch.message, {
        hasCoordinates,
        candidateOfficeIds,
        debug: personMatch.debug,
      })
      return NextResponse.json(
        { ok: false, message: personMatch.message, decisionCode: personMatch.decisionCode || 'blocked_no_reliable_match', debug: personMatch.debug || null },
        { status: 403 },
      )
    }

    const person = personMatch.person
    if (person.active === false) {
      await writeFailedScanLog(db, entry, 'blocked_inactive', 'Employee account inactive', { employeeId: person.employeeId, name: person.name })
      return NextResponse.json({ ok: false, message: 'Employee account is inactive.', decisionCode: 'blocked_inactive' }, { status: 403 })
    }

    if (!isPersonApproved(person)) {
      await writeFailedScanLog(db, entry, 'blocked_pending_approval', 'Enrollment not yet approved', { employeeId: person.employeeId, name: person.name })
      return NextResponse.json({ ok: false, message: 'Employee enrollment is still pending admin approval.', decisionCode: 'blocked_pending_approval' }, { status: 403 })
    }

    const office = await getOfficeRecord(db, person.officeId)
    if (!office) {
      return NextResponse.json({ ok: false, message: 'Assigned office was not found.', decisionCode: 'blocked_missing_office_config' }, { status: 404 })
    }

    const officeMatchedOnsite = onsiteOfficeIds.includes(person.officeId)
    const officeMatchedWfh = wfhOfficeIds.includes(person.officeId)
    if (!officeMatchedOnsite && !officeMatchedWfh) {
      await writeFailedScanLog(db, entry, 'blocked_wrong_office_context', 'Office not in candidate list', { employeeId: person.employeeId, officeId: person.officeId })
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
      if (entry.wifiSsid) {
        const clientSsid = entry.wifiSsid.toLowerCase().trim()
        const officeWifiSsid = Array.isArray(office.wifiSsid) ? office.wifiSsid : [office.wifiSsid].filter(Boolean)
        const match = officeWifiSsid.some(ssid => ssid.toLowerCase().trim() === clientSsid)
        entry.geofenceStatus = match ? 'WFH — WiFi verified' : officeWifiSsid.length > 0 ? 'WFH — WiFi not in office list' : 'WFH — GPS location recorded'
        entry.decisionCode = match ? 'accepted_wfh' : officeWifiSsid.length > 0 ? 'accepted_wfh_wifi_mismatch' : 'accepted_wfh'
      } else {
        entry.geofenceStatus = hasCoordinates ? 'WFH — GPS location recorded' : 'WFH — no GPS confirmation'
        entry.decisionCode = 'accepted_wfh'
      }
    } else {
      if (!hasCoordinates) {
        return NextResponse.json({ ok: false, message: 'GPS coordinates are required for on-site attendance.', decisionCode: 'blocked_missing_gps' }, { status: 400 })
      }
      const distanceMeters = calculateDistanceMeters({ latitude: entry.latitude, longitude: entry.longitude }, office.gps)
      if (distanceMeters > office.gps.radiusMeters) {
        await writeFailedScanLog(db, entry, 'blocked_geofence', `${Math.round(distanceMeters)}m from office (limit ${office.gps.radiusMeters}m)`, { employeeId: person.employeeId, distanceMeters: Math.round(distanceMeters) })
        return NextResponse.json({ ok: false, message: 'Outside office geofence.', decisionCode: 'blocked_geofence' }, { status: 403 })
      }
      if (entry.wifiSsid) {
        const clientSsid = entry.wifiSsid.toLowerCase().trim()
        const officeWifiSsid = Array.isArray(office.wifiSsid) ? office.wifiSsid : [office.wifiSsid].filter(Boolean)
        if (officeWifiSsid.length > 0 && !officeWifiSsid.some(ssid => ssid.toLowerCase().trim() === clientSsid)) {
          return NextResponse.json({ ok: false, message: `Connected to "${entry.wifiSsid}". Use one of: ${officeWifiSsid.join(', ')}`, decisionCode: 'blocked_wifi_mismatch' }, { status: 403 })
        }
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
