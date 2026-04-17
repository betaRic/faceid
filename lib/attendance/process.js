import 'server-only'

import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getOfficeRecord, listOfficeRecords } from '@/lib/office-directory'
import { getNextAttendanceAction } from '@/lib/daily-attendance'
import { buildAttendanceEntryTiming, toLegacyAttendanceDate } from '@/lib/attendance-time'
import { enforceRateLimit, getRequestIp } from '@/lib/rate-limit'
import {
  getEmployeeViewSessionCookieName,
  getEmployeeViewSessionMaxAge,
  isEmployeeViewSessionConfigured,
  issueEmployeeViewSession,
} from '@/lib/employee-view-auth'
import { isPersonApproved } from '@/lib/person-approval'
import { writeScanEvent } from '@/lib/scan-events'
import { touchKioskDevice } from '@/lib/kiosk-devices'
import { issueAttendanceChallenge } from '@/lib/attendance-challenge'
import { normalizeEntry, validateEntry } from './normalize'
import { checkAttendanceLocation } from './context'
import { getAttendanceLogsForDate, buildAttendanceEntryPreview } from './logs'
import { getCooldownForActionMinutes, writeAttendanceAtomically, updateDailyAttendanceCache } from './write'
import { findGlobalMatch } from './match'
import { getScanCapturePolicyAssessment } from './capture-policy'
import {
  getGeofenceContext,
  getPostMatchRiskFlags,
  getPreMatchRiskFlags,
  pickMotionType,
  resolveChallengeMode,
  validateActiveChallengeTrace,
} from './challenge-policy'

const RECENT_FAILURE_WINDOW_MS = 15 * 60 * 1000

function mergeRiskFlags(...lists) {
  return Array.from(new Set(
    lists
      .flat()
      .map(flag => String(flag || '').trim().toLowerCase())
      .filter(Boolean),
  ))
}

function createJsonResponse(body, init) {
  return NextResponse.json(body, init)
}

function buildRequestMeta(request, entry = {}) {
  return {
    clientIp: getRequestIp(request),
    clientKey: String(entry?.kioskContext?.clientKey || entry?.captureContext?.clientKey || '').slice(0, 160),
    userAgent: request.headers.get('user-agent') || '',
    source: entry?.kioskContext?.source || 'web-scan',
    kioskId: entry?.kioskContext?.kioskId || entry?.captureContext?.kioskId || '',
  }
}

async function countRecentBlockedScans(db, requestMeta) {
  const ip = String(requestMeta?.clientIp || '').trim()
  if (!ip) return 0

  try {
    const snapshot = await db
      .collection('scan_events')
      .where('clientIp', '==', ip)
      .limit(20)
      .get()

    const since = Date.now() - RECENT_FAILURE_WINDOW_MS
    return snapshot.docs.reduce((count, record) => {
      const data = record.data() || {}
      const timestamp = Number(data.timestamp || 0)
      return data.status === 'blocked' && timestamp >= since ? count + 1 : count
    }, 0)
  } catch {
    return 0
  }
}

async function buildEmployeeViewSessionPayload(db, person, personId = '') {
  const payload = {}

  if (!isEmployeeViewSessionConfigured()) {
    return payload
  }

  try {
    const employeeViewSession = await issueEmployeeViewSession(db, {
      employeeId: person.employeeId,
      personId: person?.id || personId || '',
      officeId: person.officeId || '',
    })
    payload.employeeViewSession = employeeViewSession.value
    payload.employeeViewSessionExpiresAt = employeeViewSession.expiresAtMs
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
    const rawDesc = Array.isArray(entry.descriptor) ? entry.descriptor : []
    const descMag = rawDesc.length > 0
      ? Math.round(Math.sqrt(rawDesc.reduce((s, v) => s + Number(v) * Number(v), 0)) * 10000) / 10000
      : null

    const metadata = {
      decisionCode,
      reason,
      timestamp: entry.timestamp || Date.now(),
      dateKey: entry.dateKey || '',
      latitude: entry.latitude ?? null,
      longitude: entry.longitude ?? null,
      officeId: extra.officeId || '',
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
      captureScreenOrientation: entry.captureContext?.screenOrientation || '',
      captureTrackWidth: Number.isFinite(entry.captureContext?.trackWidth) ? Number(entry.captureContext.trackWidth) : null,
      captureTrackHeight: Number.isFinite(entry.captureContext?.trackHeight) ? Number(entry.captureContext.trackHeight) : null,
      captureTrackAspectRatio: Number.isFinite(entry.captureContext?.trackAspectRatio) ? Number(entry.captureContext.trackAspectRatio) : null,
      captureTrackFrameRate: Number.isFinite(entry.captureContext?.trackFrameRate) ? Number(entry.captureContext.trackFrameRate) : null,
      captureTrackFacingMode: entry.captureContext?.trackFacingMode || '',
      captureTrackResizeMode: entry.captureContext?.trackResizeMode || '',
      verificationStage: entry.verificationStage || '',
      challengeMode: entry.challenge?.mode || '',
      motionType: entry.challenge?.motionType || '',
      riskFlags: Array.isArray(entry.riskFlags) ? entry.riskFlags : [],
      clientIp: extra.clientIp || '',
      clientKey: extra.clientKey || '',
    }
    await db.collection('audit_logs').add({
      actorRole: 'scan',
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
    // Non-fatal by design.
  }

  await writeScanEvent(db, {
    status: 'blocked',
    decisionCode,
    reason,
    entry,
    debug: extra,
    requestMeta: {
      officeId: extra.officeId || '',
      clientIp: extra.clientIp || '',
      clientKey: extra.clientKey || '',
    },
  })
}

function buildChallengeContext(entry, requestMeta, overrides = {}) {
  const riskFlags = mergeRiskFlags(
    entry?.riskFlags,
    overrides?.riskFlags,
  )
  const mode = String(overrides?.mode || 'passive').trim().toLowerCase() === 'active' ? 'active' : 'passive'
  return {
    kioskId: entry?.kioskContext?.kioskId || entry?.captureContext?.kioskId || '',
    source: entry?.kioskContext?.source || requestMeta.source || 'web-scan',
    userAgent: requestMeta.userAgent || '',
    clientIp: requestMeta.clientIp || '',
    clientKey: requestMeta.clientKey || '',
    capturePolicyVersion: entry?.captureContext?.capturePolicyVersion || '',
    mode,
    motionType: mode === 'active'
      ? String(overrides?.motionType || pickMotionType()).trim()
      : '',
    riskFlags,
  }
}

async function issueEscalationChallenge(db, entry, requestMeta, riskFlags, motionType = '') {
  return issueAttendanceChallenge(db, buildChallengeContext(entry, requestMeta, {
    mode: 'active',
    motionType: motionType || pickMotionType(),
    riskFlags,
  }))
}

function withChallengeMetadata(entry, consumedChallenge) {
  const challenge = {
    ...(entry.challenge || {}),
    ...(consumedChallenge || {}),
  }
  return {
    ...entry,
    verificationMode: 'challenge_v2',
    verificationStage: String(entry.verificationStage || challenge.verificationStage || challenge.mode || 'passive').trim(),
    challenge,
    riskFlags: mergeRiskFlags(entry.riskFlags, challenge.riskFlags),
  }
}

export async function prepareAttendanceChallenge({ db, request, body }) {
  const entry = normalizeEntry(body || {})
  const requestMeta = buildRequestMeta(request, entry)
  const offices = await listOfficeRecords(db)
  const geofenceContext = getGeofenceContext(offices, entry)
  const capturePolicy = getScanCapturePolicyAssessment(entry)
  const recentFailureCount = await countRecentBlockedScans(db, requestMeta)
  const riskFlags = mergeRiskFlags(
    capturePolicy.riskFlags,
    getPreMatchRiskFlags(entry, geofenceContext, recentFailureCount),
    entry.riskFlags,
  )
  const mode = resolveChallengeMode(riskFlags)
  const motionType = mode === 'active' ? pickMotionType() : ''
  const challenge = await issueAttendanceChallenge(db, buildChallengeContext(entry, requestMeta, {
    mode,
    motionType,
    riskFlags,
  }))

  return {
    challenge,
    riskFlags,
    geofenceContext,
    recentFailureCount,
  }
}

async function requireActiveChallengeIfNeeded(db, entry, requestMeta, riskFlags) {
  const requiresActive = resolveChallengeMode(riskFlags) === 'active'
  if (!requiresActive) {
    return { ok: true }
  }

  const challengeMode = String(entry.challenge?.mode || '').trim().toLowerCase()
  const verificationStage = String(entry.verificationStage || '').trim().toLowerCase()

  if (challengeMode !== 'active' || verificationStage !== 'active') {
    const challenge = await issueEscalationChallenge(db, entry, requestMeta, riskFlags)
    return {
      ok: false,
      decisionCode: 'challenge_required',
      status: 409,
      body: {
        ok: false,
        message: 'Additional active liveness verification is required.',
        decisionCode: 'challenge_required',
        challenge,
        riskFlags,
      },
    }
  }

  const traceValidation = validateActiveChallengeTrace(entry.activeChallengeTrace, entry.challenge.motionType)
  if (!traceValidation.ok) {
    return {
      ok: false,
      decisionCode: traceValidation.decisionCode,
      status: 403,
      body: {
        ok: false,
        message: traceValidation.message,
        decisionCode: traceValidation.decisionCode,
        riskFlags,
      },
    }
  }

  entry.activeChallengeTrace = traceValidation.trace
  return { ok: true }
}

export async function processAttendanceSubmission({ db, request, body, consumedChallenge = null }) {
  const requestEntry = normalizeEntry(body)
  const validationError = validateEntry(requestEntry)
  if (validationError) {
    return createJsonResponse({ ok: false, message: validationError }, { status: 400 })
  }

  const entryWithTiming = {
    ...requestEntry,
    ...buildAttendanceEntryTiming(Date.now()),
  }
  const requestMeta = buildRequestMeta(request, entryWithTiming)
  const entry = withChallengeMetadata(entryWithTiming, consumedChallenge)

  await touchKioskDevice(db, {
    ...(entry.kioskContext || null),
    userAgent: requestMeta.userAgent,
  })

  const ipLimit = await enforceRateLimit(db, {
    key: `attendance-ip:${requestMeta.clientIp}`,
    limit: 60,
    windowMs: 60 * 1000,
  })
  if (!ipLimit.ok) {
    entry.riskFlags = mergeRiskFlags(entry.riskFlags, ['rate_limited'])
    await writeScanEvent(db, {
      status: 'blocked',
      decisionCode: 'blocked_rate_limited',
      reason: 'Too many attendance requests from this client.',
      entry,
      requestMeta,
    })
    return createJsonResponse(
      { ok: false, message: 'Too many attendance requests. Slow down and try again.', decisionCode: 'blocked_rate_limited' },
      { status: 429 },
    )
  }

  const capturePolicy = getScanCapturePolicyAssessment(entry)
  entry.riskFlags = mergeRiskFlags(entry.riskFlags, capturePolicy.riskFlags)
  if (!capturePolicy.ok) {
    await writeFailedScanLog(db, entry, capturePolicy.decisionCode, capturePolicy.message, {
      clientIp: requestMeta.clientIp,
      clientKey: requestMeta.clientKey,
    })
    return createJsonResponse(
      { ok: false, message: capturePolicy.message, decisionCode: capturePolicy.decisionCode, riskFlags: entry.riskFlags },
      { status: 403 },
    )
  }

  const allOffices = await listOfficeRecords(db)
  const geofenceContext = getGeofenceContext(allOffices, entry)
  if (!Number.isFinite(entry.latitude) || !Number.isFinite(entry.longitude)) {
    entry.riskFlags = mergeRiskFlags(entry.riskFlags, geofenceContext.riskFlags, ['missing_location'])
    await writeFailedScanLog(db, entry, 'blocked_missing_gps', 'Verified GPS location is required for attendance.', {
      clientIp: requestMeta.clientIp,
      clientKey: requestMeta.clientKey,
    })
    return createJsonResponse(
      { ok: false, message: 'Verified GPS location is required for attendance.', decisionCode: 'blocked_missing_gps', riskFlags: entry.riskFlags },
      { status: 403 },
    )
  }

  const recentFailureCount = await countRecentBlockedScans(db, requestMeta)
  const preMatchRiskFlags = mergeRiskFlags(
    entry.riskFlags,
    geofenceContext.riskFlags,
    getPreMatchRiskFlags(entry, geofenceContext, recentFailureCount),
  )
  entry.riskFlags = preMatchRiskFlags

  const preMatchChallengeCheck = await requireActiveChallengeIfNeeded(db, entry, requestMeta, preMatchRiskFlags)
  if (!preMatchChallengeCheck.ok) {
    if (preMatchChallengeCheck.decisionCode === 'challenge_required') {
      await writeScanEvent(db, {
        status: 'challenged',
        decisionCode: preMatchChallengeCheck.decisionCode,
        reason: preMatchChallengeCheck.body?.message || 'Additional active liveness verification is required.',
        entry,
        requestMeta,
      })
    } else {
      await writeFailedScanLog(db, entry, preMatchChallengeCheck.decisionCode, preMatchChallengeCheck.body?.message || 'Active challenge validation failed.', {
        clientIp: requestMeta.clientIp,
        clientKey: requestMeta.clientKey,
      })
    }
    return createJsonResponse(preMatchChallengeCheck.body, { status: preMatchChallengeCheck.status })
  }

  const personMatch = await findGlobalMatch(db, allOffices, entry.descriptor, {
    entry,
    geofenceContext,
  })
  if (!personMatch.ok) {
    await writeFailedScanLog(db, entry, personMatch.decisionCode, personMatch.message, {
      ...(personMatch.debug || {}),
      clientIp: requestMeta.clientIp,
      clientKey: requestMeta.clientKey,
    })
    return createJsonResponse(
      {
        ok: false,
        message: personMatch.message,
        decisionCode: personMatch.decisionCode,
        debug: personMatch.debug ?? null,
        riskFlags: entry.riskFlags,
      },
      { status: 403 },
    )
  }

  const postMatchRiskFlags = mergeRiskFlags(
    entry.riskFlags,
    getPostMatchRiskFlags(entry, personMatch),
  )
  entry.riskFlags = postMatchRiskFlags

  const postMatchChallengeCheck = await requireActiveChallengeIfNeeded(db, entry, requestMeta, postMatchRiskFlags)
  if (!postMatchChallengeCheck.ok) {
    if (postMatchChallengeCheck.decisionCode === 'challenge_required') {
      await writeScanEvent(db, {
        status: 'challenged',
        decisionCode: postMatchChallengeCheck.decisionCode,
        reason: postMatchChallengeCheck.body?.message || 'Additional active liveness verification is required.',
        entry,
        person: personMatch.person || null,
        debug: personMatch.debug || null,
        requestMeta: {
          ...requestMeta,
          personId: personMatch.personId || '',
        },
      })
    } else {
      await writeFailedScanLog(db, entry, postMatchChallengeCheck.decisionCode, postMatchChallengeCheck.body?.message || 'Active challenge validation failed.', {
        ...(personMatch.debug || {}),
        clientIp: requestMeta.clientIp,
        clientKey: requestMeta.clientKey,
      })
    }
    return createJsonResponse(postMatchChallengeCheck.body, { status: postMatchChallengeCheck.status })
  }

  const person = personMatch.person
  await touchKioskDevice(db, {
    ...(entry.kioskContext || null),
    userAgent: requestMeta.userAgent,
  }, {
    officeId: person.officeId || '',
    officeName: person.officeName || '',
    decisionCode: personMatch.decisionCode || 'matched_person',
  })

  if (person.active === false) {
    await writeFailedScanLog(db, entry, 'blocked_inactive', 'Employee account inactive', {
      employeeId: person.employeeId,
      name: person.name,
      clientIp: requestMeta.clientIp,
      clientKey: requestMeta.clientKey,
    })
    return createJsonResponse({ ok: false, message: 'Employee account is inactive.', decisionCode: 'blocked_inactive' }, { status: 403 })
  }

  if (!isPersonApproved(person)) {
    await writeFailedScanLog(db, entry, 'blocked_pending_approval', 'Enrollment not yet approved', {
      employeeId: person.employeeId,
      name: person.name,
      clientIp: requestMeta.clientIp,
      clientKey: requestMeta.clientKey,
    })
    return createJsonResponse(
      { ok: false, message: 'Employee enrollment is still pending admin approval.', decisionCode: 'blocked_pending_approval' },
      { status: 403 },
    )
  }

  const office = await getOfficeRecord(db, person.officeId)
  if (!office) {
    await writeFailedScanLog(db, entry, 'blocked_missing_office_config', 'Assigned office configuration missing', {
      employeeId: person.employeeId,
      officeId: person.officeId,
      clientIp: requestMeta.clientIp,
      clientKey: requestMeta.clientKey,
    })
    return createJsonResponse({ ok: false, message: 'Assigned office was not found.', decisionCode: 'blocked_missing_office_config' }, { status: 404 })
  }

  const locationResult = checkAttendanceLocation(person, office, entry, allOffices)
  if (!locationResult.ok) {
    await writeFailedScanLog(db, entry, locationResult.decisionCode, locationResult.message, {
      employeeId: person.employeeId,
      officeId: person.officeId,
      clientIp: requestMeta.clientIp,
      clientKey: requestMeta.clientKey,
    })
    return createJsonResponse(
      { ok: false, message: locationResult.message, decisionCode: locationResult.decisionCode },
      { status: 403 },
    )
  }

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
    const employeeViewPayload = await buildEmployeeViewSessionPayload(db, person, personMatch.personId)
    await writeFailedScanLog(db, entry, 'blocked_day_complete', 'Full day attendance already recorded', {
      employeeId: person.employeeId,
      officeId: person.officeId,
      clientIp: requestMeta.clientIp,
      clientKey: requestMeta.clientKey,
    })
    const response = createJsonResponse({
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
    const employeeViewPayload = await buildEmployeeViewSessionPayload(db, person, personMatch.personId)
    await writeFailedScanLog(db, entry, 'blocked_recent_duplicate', `Duplicate ${nextAction} attempt within cooldown window`, {
      employeeId: person.employeeId,
      officeId: person.officeId,
      clientIp: requestMeta.clientIp,
      clientKey: requestMeta.clientKey,
    })
    const response = createJsonResponse(
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
      clientIp: requestMeta.clientIp,
      clientKey: requestMeta.clientKey,
    },
  })

  const responsePayload = {
    ok: true,
    entry: writeResult.entryPreview,
    ...(await buildEmployeeViewSessionPayload(db, person, personMatch.personId)),
  }
  if (process.env.NODE_ENV !== 'production') {
    const debug = personMatch.debug
    responsePayload.debug = debug
      ? {
          source: debug.source,
          candidateCount: debug.candidateCount,
          bestDistance: debug.bestDistance,
          secondDistance: debug.secondDistance,
          threshold: debug.threshold,
          searchPhase: debug.searchPhase,
          searchPhases: debug.searchPhases || [],
        }
      : null
  }

  const response = createJsonResponse(responsePayload)
  return attachEmployeeViewSessionCookie(response, responsePayload)
}
