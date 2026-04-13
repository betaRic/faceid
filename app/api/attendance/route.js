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

    // Liveness check — client-provided landmarks (weak but filters obvious attacks)
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

    // Get location context first (to know which offices to search)
    const { candidateOfficeIds, onsiteOfficeIds, wfhOfficeIds } = await getCandidateAttendanceContext(db, entry)

    // STEP 1: Try biometric match against candidate offices FIRST
    let personMatch = null
    
    if (candidateOfficeIds.length > 0) {
      personMatch = await findMatchFromCandidates(db, candidateOfficeIds, entry.descriptor, true)
      if (!personMatch.ok) {
        const candidatePersons = await getPersonsForOfficeIds(db, candidateOfficeIds)
        personMatch = matchPersonFromDescriptor(candidatePersons, entry.descriptor, true)
      }
    }

    // STEP 2: If no match from candidates, try ALL offices (fallback)
    if (!personMatch || !personMatch.ok) {
      const allPersons = await getPersonsForOfficeIds(db, [], true) // fallback to all
      personMatch = matchPersonFromDescriptor(allPersons, entry.descriptor, true)
    }

    // STEP 3: If still no match, fail
    if (!personMatch || !personMatch.ok) {
      await writeFailedScanLog(db, entry, personMatch?.decisionCode || 'blocked_no_reliable_match', personMatch?.message || 'No match found', {
        hasCoordinates,
        candidateOfficeIds,
        debug: personMatch?.debug,
      })
      return NextResponse.json(
        { ok: false, message: personMatch?.message || 'No reliable face match was found.', decisionCode: personMatch?.decisionCode || 'blocked_no_reliable_match', debug: personMatch?.debug || null },
        { status: 403 },
      )
    }

    // STEP 4: Now check person status
    const person = personMatch.person
    if (person.active === false) {
      await writeFailedScanLog(db, entry, 'blocked_inactive', 'Employee account inactive', { employeeId: person.employeeId, name: person.name })
      return NextResponse.json({ ok: false, message: 'Employee account is inactive.', decisionCode: 'blocked_inactive' }, { status: 403 })
    }

    if (!isPersonApproved(person)) {
      await writeFailedScanLog(db, entry, 'blocked_pending_approval', 'Enrollment not yet approved', { employeeId: person.employeeId, name: person.name })
      return NextResponse.json({ ok: false, message: 'Employee enrollment is still pending admin approval.', decisionCode: 'blocked_pending_approval' }, { status: 403 })
    }

    // STEP 5: Get person's assigned office
    const office = await getOfficeRecord(db, person.officeId)
    if (!office) {
      return NextResponse.json({ ok: false, message: 'Assigned office was not found.', decisionCode: 'blocked_missing_office_config' }, { status: 404 })
    }

    // STEP 6: Check location context against person's ASSIGNED office
    // Check if person's office is in WFH list (they can work from home today)
    const isWfhDay = wfhOfficeIds.includes(person.officeId)
    
    // Check if person is at ANY DILG office location (onsite)
    const isAtAnyDILGOffice = onsiteOfficeIds.length > 0
    
    // Determine attendance mode - more flexible for government employees
    let attendanceMode = ''
    let geofenceStatus = ''
    let decisionCode = ''

    if (isWfhDay && !hasCoordinates) {
      // WFH day and no GPS = allow (they're working from home)
      attendanceMode = 'WFH'
      geofenceStatus = 'WFH — no GPS required on WFH day'
      decisionCode = 'accepted_wfh'
    } else if (isWfhDay && hasCoordinates) {
      // WFH day with GPS - verify WiFi if available
      if (entry.wifiSsid) {
        const clientSsid = entry.wifiSsid.toLowerCase().trim()
        const officeWifiSsid = Array.isArray(office.wifiSsid) ? office.wifiSsid : [office.wifiSsid].filter(Boolean)
        const wifiMatch = officeWifiSsid.some(ssid => ssid.toLowerCase().trim() === clientSsid)
        if (wifiMatch) {
          attendanceMode = 'WFH'
          geofenceStatus = 'WFH — WiFi verified'
          decisionCode = 'accepted_wfh'
        } else {
          // WiFi doesn't match office, but they're on WFH day - allow with warning
          attendanceMode = 'WFH'
          geofenceStatus = officeWifiSsid.length > 0 ? 'WFH — WiFi not in office list' : 'WFH — GPS location recorded'
          decisionCode = 'accepted_wfh'
        }
      } else {
        attendanceMode = 'WFH'
        geofenceStatus = hasCoordinates ? 'WFH — GPS location recorded' : 'WFH — no GPS confirmation'
        decisionCode = 'accepted_wfh'
      }
    } else if (isAtAnyDILGOffice) {
      // At ANY DILG office - allow check-in (not just their assigned office)
      // Government employees can check in at any DILG office
      if (!hasCoordinates) {
        return NextResponse.json({ ok: false, message: 'GPS coordinates are required for on-site attendance.', decisionCode: 'blocked_missing_gps' }, { status: 400 })
      }
      
      // Find which office they're at for reporting
      const officeAtLocation = await getOfficeRecord(db, onsiteOfficeIds[0])
      const atAssignedOffice = onsiteOfficeIds.includes(person.officeId)
      
      const distanceMeters = calculateDistanceMeters({ latitude: entry.latitude, longitude: entry.longitude }, office.gps)
      if (distanceMeters > office.gps.radiusMeters) {
        await writeFailedScanLog(db, entry, 'blocked_geofence', `${Math.round(distanceMeters)}m from office (limit ${office.gps.radiusMeters}m)`, { employeeId: person.employeeId, distanceMeters: Math.round(distanceMeters) })
        return NextResponse.json({ ok: false, message: 'Outside office geofence.', decisionCode: 'blocked_geofence' }, { status: 403 })
      }
      
      // Check WiFi if provided
      if (entry.wifiSsid) {
        const clientSsid = entry.wifiSsid.toLowerCase().trim()
        const officeWifiSsid = Array.isArray(office.wifiSsid) ? office.wifiSsid : [office.wifiSsid].filter(Boolean)
        if (officeWifiSsid.length > 0 && !officeWifiSsid.some(ssid => ssid.toLowerCase().trim() === clientSsid)) {
          return NextResponse.json({ ok: false, message: `Connected to "${entry.wifiSsid}". Use one of: ${officeWifiSsid.join(', ')}`, decisionCode: 'blocked_wifi_mismatch' }, { status: 403 })
        }
      }
      
      // Allow check-in at any DILG office
      if (atAssignedOffice) {
        attendanceMode = 'On-site'
        geofenceStatus = 'Inside office radius'
        decisionCode = 'accepted_onsite'
      } else {
        attendanceMode = 'On-site'
        geofenceStatus = `Checked in at ${officeAtLocation?.name || 'DILG office'} (not assigned office)`
        decisionCode = 'accepted_onsite_other_office'
      }
    } else {
      // Not at any DILG office and not a WFH day - check if they have GPS
      if (hasCoordinates) {
        await writeFailedScanLog(db, entry, 'blocked_geofence', 'Not at any DILG office and not a WFH day', { employeeId: person.employeeId, officeId: person.officeId })
        return NextResponse.json({ ok: false, message: 'You are not at a DILG office. If today is a WFH day, please ensure WFH is enabled for your office.', decisionCode: 'blocked_wrong_context' }, { status: 403 })
      }
      
      // No location data at all - this is more flexible
      // Allow with warning if they're checking in from unknown location
      attendanceMode = 'On-site'
      geofenceStatus = 'Location not recorded'
      decisionCode = 'accepted_no_location'
    }

    // STEP 7: Write attendance
    entry.name = person.name
    entry.employeeId = person.employeeId
    entry.officeId = person.officeId
    entry.officeName = office.name
    entry.confidence = personMatch.confidence ?? entry.confidence
    entry.attendanceMode = attendanceMode
    entry.geofenceStatus = geofenceStatus
    entry.decisionCode = decisionCode
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