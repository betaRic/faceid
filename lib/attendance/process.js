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
import {
  ATTENDANCE_MIN_SERVER_FRAMES,
  buildAuthoritativeAttendancePayload,
} from '@/lib/biometrics/server-attendance'
import { queueOpenVinoProfileUpdate } from '@/lib/biometrics/openvino-shadow-profile'
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
} from './challenge-policy'

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

function appendServerTiming(response, timings = []) {
  const value = timings
    .filter(timing => timing && timing.name && Number.isFinite(timing.durationMs))
    .map(timing => `${timing.name};dur=${Math.max(0, Math.round(timing.durationMs))}`)
    .join(', ')

  if (value) response.headers.set('Server-Timing', value)
  return response
}

async function timeStep(timings, name, fn) {
  const startedAt = Date.now()
  try {
    return await fn()
  } finally {
    timings.push({ name, durationMs: Date.now() - startedAt })
  }
}

function withServerTimings(extra = {}, timings = []) {
  return {
    ...extra,
    serverTimings: Array.isArray(timings)
      ? timings.map(timing => ({
          name: timing?.name,
          durationMs: timing?.durationMs,
        }))
      : [],
  }
}

const FAST_SINGLE_FRAME_MAX_DISTANCE = 0.68
const FAST_SINGLE_FRAME_MIN_MARGIN = 0.08
const FAST_SINGLE_FRAME_MIN_SUPPORT = 2
const FAST_SINGLE_FRAME_ENABLED = process.env.ATTENDANCE_FAST_SINGLE_FRAME_ENABLED === 'true'

function getFiniteMetric(...values) {
  for (const value of values) {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return numeric
  }
  return null
}

function isStrongSingleFrameMatch(matchResult) {
  if (!matchResult?.ok) return false
  const debug = matchResult.debug || {}
  const bestDistance = getFiniteMetric(debug.bestDistance, matchResult.distance)
  const secondDistance = getFiniteMetric(debug.secondDistance)
  const supportCount = getFiniteMetric(debug.supportCount)
  const supportDescriptorCount = getFiniteMetric(debug.supportDescriptorCount)
  const margin = Number.isFinite(bestDistance) && Number.isFinite(secondDistance)
    ? secondDistance - bestDistance
    : null

  return (
    Number.isFinite(bestDistance)
    && bestDistance <= FAST_SINGLE_FRAME_MAX_DISTANCE
    && Number.isFinite(margin)
    && margin >= FAST_SINGLE_FRAME_MIN_MARGIN
    && Number.isFinite(supportCount)
    && supportCount >= FAST_SINGLE_FRAME_MIN_SUPPORT
    && Number.isFinite(supportDescriptorCount)
    && supportDescriptorCount >= FAST_SINGLE_FRAME_MIN_SUPPORT
  )
}

function applyAuthoritativePayload(entry, authoritativePayload, matchMode) {
  return {
    ...entry,
    descriptor: authoritativePayload.descriptor,
    descriptors: authoritativePayload.descriptors,
    antispoof: authoritativePayload.antispoof ?? entry.antispoof,
    liveness: authoritativePayload.liveness ?? entry.liveness,
    captureContext: {
      ...entry.captureContext,
      authoritativeDescriptorSource: authoritativePayload.diagnostics.modelVersion,
      serverEmbeddingFrames: authoritativePayload.diagnostics.acceptedCount,
      serverEmbeddingAverageMs: authoritativePayload.diagnostics.averagePerformanceMs,
    },
    scanDiagnostics: {
      ...entry.scanDiagnostics,
      serverDescriptorSpread: Number.isFinite(authoritativePayload.descriptorSpread)
        ? authoritativePayload.descriptorSpread
        : null,
      serverEmbeddingFrames: authoritativePayload.diagnostics.acceptedCount,
      serverEmbeddingRejectedFrames: authoritativePayload.diagnostics.rejectedCount,
      serverEmbeddingAverageMs: authoritativePayload.diagnostics.averagePerformanceMs,
      serverMatchMode: matchMode,
    },
  }
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
  return {
    kioskId: entry?.kioskContext?.kioskId || entry?.captureContext?.kioskId || '',
    source: entry?.kioskContext?.source || requestMeta.source || 'web-scan',
    userAgent: requestMeta.userAgent || '',
    clientIp: requestMeta.clientIp || '',
    clientKey: requestMeta.clientKey || '',
    capturePolicyVersion: entry?.captureContext?.capturePolicyVersion || '',
    mode: 'passive',
    motionType: '',
    riskFlags,
  }
}

function withChallengeMetadata(entry, consumedChallenge) {
  const challenge = {
    ...(entry.challenge || {}),
    ...(consumedChallenge || {}),
    mode: 'passive',
    motionType: '',
    verificationStage: 'passive',
  }
  return {
    ...entry,
    verificationMode: 'challenge_v2',
    verificationStage: 'passive',
    challenge,
    riskFlags: mergeRiskFlags(entry.riskFlags, challenge.riskFlags),
  }
}

export async function prepareAttendanceChallenge({ db, request, body }) {
  const entry = normalizeEntry(body || {})
  const requestMeta = buildRequestMeta(request, entry)
  const riskFlags = mergeRiskFlags(
    entry.riskFlags,
  )
  const challenge = await issueAttendanceChallenge(db, buildChallengeContext(entry, requestMeta, {
    riskFlags,
  }))

  return {
    challenge,
    riskFlags,
    geofenceContext: null,
    recentFailureCount: 0,
  }
}

export async function processAttendanceSubmission({ db, request, body, consumedChallenge = null }) {
  const timings = []
  const respond = (responseBody, init) => appendServerTiming(createJsonResponse(responseBody, init), timings)
  const requestEntry = normalizeEntry(body)
  const entryWithTiming = {
    ...requestEntry,
    ...buildAttendanceEntryTiming(Date.now()),
  }
  const requestMeta = buildRequestMeta(request, entryWithTiming)
  let entry = withChallengeMetadata(entryWithTiming, consumedChallenge)

  const ipLimit = await timeStep(timings, 'rate_limit', () => enforceRateLimit(db, {
    key: `attendance-ip:${requestMeta.clientIp}`,
    limit: 60,
    windowMs: 60 * 1000,
  }))
  if (!ipLimit.ok) {
    entry.riskFlags = mergeRiskFlags(entry.riskFlags, ['rate_limited'])
    await writeScanEvent(db, {
      status: 'blocked',
      decisionCode: 'blocked_rate_limited',
      reason: 'Too many attendance requests from this client.',
      entry,
      debug: withServerTimings({}, timings),
      requestMeta,
    })
    return respond(
      { ok: false, message: 'Too many attendance requests. Slow down and try again.', decisionCode: 'blocked_rate_limited' },
      { status: 429 },
    )
  }

  let authoritativePayload = null
  let serverMatchMode = FAST_SINGLE_FRAME_ENABLED ? 'single_frame_fast' : 'two_frame_required'
  try {
    authoritativePayload = FAST_SINGLE_FRAME_ENABLED
      ? await timeStep(timings, 'server_embed_1', () => buildAuthoritativeAttendancePayload(entry.scanFrames, {
          frameLimit: 1,
          minFrames: 1,
        }))
      : await timeStep(timings, 'server_embed_2', () => buildAuthoritativeAttendancePayload(entry.scanFrames))
    entry = applyAuthoritativePayload(entry, authoritativePayload, serverMatchMode)
  } catch (error) {
    if (!FAST_SINGLE_FRAME_ENABLED) {
      const decisionCode = String(error?.decisionCode || 'blocked_no_reliable_match')
      const message = error?.message || 'Server could not verify this scan. Try again.'
      entry.riskFlags = mergeRiskFlags(entry.riskFlags, ['server_authoritative_biometrics_failed'])
      await writeFailedScanLog(db, entry, decisionCode, message, withServerTimings({
        clientIp: requestMeta.clientIp,
        clientKey: requestMeta.clientKey,
      }, timings))
      return respond(
        { ok: false, message, decisionCode, riskFlags: entry.riskFlags },
        { status: Number.isInteger(error?.status) ? error.status : 403 },
      )
    }

    try {
      serverMatchMode = 'two_frame_fallback'
      authoritativePayload = await timeStep(timings, 'server_embed_2', () => buildAuthoritativeAttendancePayload(entry.scanFrames))
      entry = applyAuthoritativePayload(entry, authoritativePayload, serverMatchMode)
    } catch (fallbackError) {
      const decisionCode = String(fallbackError?.decisionCode || error?.decisionCode || 'blocked_no_reliable_match')
      const message = fallbackError?.message || error?.message || 'Server could not verify this scan. Try again.'
      entry.riskFlags = mergeRiskFlags(entry.riskFlags, ['server_authoritative_biometrics_failed'])
      await writeFailedScanLog(db, entry, decisionCode, message, withServerTimings({
        clientIp: requestMeta.clientIp,
        clientKey: requestMeta.clientKey,
      }, timings))
      return respond(
        { ok: false, message, decisionCode, riskFlags: entry.riskFlags },
        { status: Number.isInteger(fallbackError?.status) ? fallbackError.status : Number.isInteger(error?.status) ? error.status : 403 },
      )
    }
  }

  const validationError = validateEntry(entry)
  if (validationError) {
    return respond({ ok: false, message: validationError }, { status: 400 })
  }

  const capturePolicy = getScanCapturePolicyAssessment(entry)
  entry.riskFlags = mergeRiskFlags(entry.riskFlags, capturePolicy.riskFlags)
  if (!capturePolicy.ok) {
    await writeFailedScanLog(db, entry, capturePolicy.decisionCode, capturePolicy.message, withServerTimings({
      clientIp: requestMeta.clientIp,
      clientKey: requestMeta.clientKey,
    }, timings))
    return respond(
      { ok: false, message: capturePolicy.message, decisionCode: capturePolicy.decisionCode, riskFlags: entry.riskFlags },
      { status: 403 },
    )
  }

  const allOffices = await timeStep(timings, 'offices', () => listOfficeRecords(db))
  const geofenceContext = getGeofenceContext(allOffices, entry)
  if (!Number.isFinite(entry.latitude) || !Number.isFinite(entry.longitude)) {
    entry.riskFlags = mergeRiskFlags(entry.riskFlags, geofenceContext.riskFlags, ['missing_location'])
    await writeFailedScanLog(db, entry, 'blocked_missing_gps', 'Verified GPS location is required for attendance.', withServerTimings({
      clientIp: requestMeta.clientIp,
      clientKey: requestMeta.clientKey,
    }, timings))
    return respond(
      { ok: false, message: 'Verified GPS location is required for attendance.', decisionCode: 'blocked_missing_gps', riskFlags: entry.riskFlags },
      { status: 403 },
    )
  }

  // The submit path already has hard rate limiting. Keep recent-failure
  // analytics out of the critical biometric path; querying scan_events here
  // added Firestore latency without improving match accuracy.
  const preMatchRiskFlags = mergeRiskFlags(
    entry.riskFlags,
    geofenceContext.riskFlags,
    getPreMatchRiskFlags(entry, geofenceContext, 0),
  )
  entry.riskFlags = preMatchRiskFlags

  let personMatch = await timeStep(timings, serverMatchMode === 'single_frame_fast' ? 'match_1' : 'match_2', () => findGlobalMatch(db, allOffices, entry.descriptor, {
    entry,
    geofenceContext,
  }))

  if (
    FAST_SINGLE_FRAME_ENABLED
    &&
    serverMatchMode === 'single_frame_fast'
    && !isStrongSingleFrameMatch(personMatch)
  ) {
    if (!Array.isArray(entry.scanFrames) || entry.scanFrames.length < ATTENDANCE_MIN_SERVER_FRAMES) {
      const message = `At least ${ATTENDANCE_MIN_SERVER_FRAMES} server-authoritative scan frames are required.`
      entry.riskFlags = mergeRiskFlags(entry.riskFlags, ['single_frame_match_not_allowed'])
      await writeFailedScanLog(db, entry, 'blocked_missing_scan_frames', message, withServerTimings({
        clientIp: requestMeta.clientIp,
        clientKey: requestMeta.clientKey,
      }, timings))
      return respond(
        { ok: false, message, decisionCode: 'blocked_missing_scan_frames', riskFlags: entry.riskFlags },
        { status: 400 },
      )
    }

    try {
      serverMatchMode = 'two_frame_fallback'
      authoritativePayload = await timeStep(timings, 'server_embed_2', () => buildAuthoritativeAttendancePayload(entry.scanFrames, {
        acceptedFrames: authoritativePayload?.acceptedFrames,
        rejectedFrames: authoritativePayload?.rejectedFrames,
        processedCount: authoritativePayload?.processedCount,
      }))
      entry = applyAuthoritativePayload(entry, authoritativePayload, serverMatchMode)

      const fullValidationError = validateEntry(entry)
      if (fullValidationError) {
        return respond({ ok: false, message: fullValidationError }, { status: 400 })
      }

      const fullCapturePolicy = getScanCapturePolicyAssessment(entry)
      entry.riskFlags = mergeRiskFlags(entry.riskFlags, fullCapturePolicy.riskFlags)
      if (!fullCapturePolicy.ok) {
        await writeFailedScanLog(db, entry, fullCapturePolicy.decisionCode, fullCapturePolicy.message, withServerTimings({
          clientIp: requestMeta.clientIp,
          clientKey: requestMeta.clientKey,
        }, timings))
        return respond(
          { ok: false, message: fullCapturePolicy.message, decisionCode: fullCapturePolicy.decisionCode, riskFlags: entry.riskFlags },
          { status: 403 },
        )
      }

      personMatch = await timeStep(timings, 'match_2', () => findGlobalMatch(db, allOffices, entry.descriptor, {
        entry,
        geofenceContext,
      }))
    } catch (error) {
      const decisionCode = String(error?.decisionCode || 'blocked_no_reliable_match')
      const message = error?.message || 'Server could not verify this scan. Try again.'
      entry.riskFlags = mergeRiskFlags(entry.riskFlags, ['server_authoritative_biometrics_failed'])
      await writeFailedScanLog(db, entry, decisionCode, message, withServerTimings({
        clientIp: requestMeta.clientIp,
        clientKey: requestMeta.clientKey,
      }, timings))
      return respond(
        { ok: false, message, decisionCode, riskFlags: entry.riskFlags },
        { status: Number.isInteger(error?.status) ? error.status : 403 },
      )
    }
  }

  if (!personMatch.ok) {
    await writeFailedScanLog(db, entry, personMatch.decisionCode, personMatch.message, withServerTimings({
      ...(personMatch.debug || {}),
      clientIp: requestMeta.clientIp,
      clientKey: requestMeta.clientKey,
    }, timings))
    return respond(
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

  const person = personMatch.person
  touchKioskDevice(db, {
    ...(entry.kioskContext || null),
    userAgent: requestMeta.userAgent,
  }, {
    officeId: person.officeId || '',
    officeName: person.officeName || '',
    decisionCode: personMatch.decisionCode || 'matched_person',
  }).catch(() => {})

  if (person.active === false) {
    await writeFailedScanLog(db, entry, 'blocked_inactive', 'Employee account inactive', withServerTimings({
      employeeId: person.employeeId,
      name: person.name,
      clientIp: requestMeta.clientIp,
      clientKey: requestMeta.clientKey,
    }, timings))
    return respond({ ok: false, message: 'Employee account is inactive.', decisionCode: 'blocked_inactive' }, { status: 403 })
  }

  if (!isPersonApproved(person)) {
    await writeFailedScanLog(db, entry, 'blocked_pending_approval', 'Enrollment not yet approved', withServerTimings({
      employeeId: person.employeeId,
      name: person.name,
      clientIp: requestMeta.clientIp,
      clientKey: requestMeta.clientKey,
    }, timings))
    return respond(
      { ok: false, message: 'Employee enrollment is still pending admin approval.', decisionCode: 'blocked_pending_approval' },
      { status: 403 },
    )
  }

  const officesById = new Map(allOffices.map(officeEntry => [officeEntry.id, officeEntry]))
  const office = officesById.get(person.officeId) || await timeStep(timings, 'office', () => getOfficeRecord(db, person.officeId))
  if (!office) {
    await writeFailedScanLog(db, entry, 'blocked_missing_office_config', 'Assigned office configuration missing', withServerTimings({
      employeeId: person.employeeId,
      officeId: person.officeId,
      clientIp: requestMeta.clientIp,
      clientKey: requestMeta.clientKey,
    }, timings))
    return respond({ ok: false, message: 'Assigned office was not found.', decisionCode: 'blocked_missing_office_config' }, { status: 404 })
  }

  const locationResult = checkAttendanceLocation(person, office, entry, allOffices)
  if (!locationResult.ok) {
    await writeFailedScanLog(db, entry, locationResult.decisionCode, locationResult.message, withServerTimings({
      employeeId: person.employeeId,
      officeId: person.officeId,
      clientIp: requestMeta.clientIp,
      clientKey: requestMeta.clientKey,
    }, timings))
    return respond(
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
  const dailyLogs = await timeStep(timings, 'daily_logs', () => getAttendanceLogsForDate(db, entry.employeeId, entry.dateKey, legacyDateLabel))
  const nextAction = getNextAttendanceAction(dailyLogs, office)

  if (nextAction === 'complete') {
    const latestDailyEntry = dailyLogs.length > 0
      ? buildAttendanceEntryPreview(dailyLogs[dailyLogs.length - 1])
      : null
    const employeeViewPayload = await timeStep(timings, 'employee_session', () => buildEmployeeViewSessionPayload(db, person, personMatch.personId))
    await writeFailedScanLog(db, entry, 'blocked_day_complete', 'Full day attendance already recorded', withServerTimings({
      employeeId: person.employeeId,
      officeId: person.officeId,
      clientIp: requestMeta.clientIp,
      clientKey: requestMeta.clientKey,
    }, timings))
    const response = respond({
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
  const writeResult = await timeStep(timings, 'write_attendance', () => writeAttendanceAtomically(db, entry, cooldownMs))
  if (!writeResult.ok) {
    const cooldownMinutes = getCooldownForActionMinutes(office, nextAction)
    const employeeViewPayload = await timeStep(timings, 'employee_session', () => buildEmployeeViewSessionPayload(db, person, personMatch.personId))
    await writeFailedScanLog(db, entry, 'blocked_recent_duplicate', `Duplicate ${nextAction} attempt within cooldown window`, withServerTimings({
      employeeId: person.employeeId,
      officeId: person.officeId,
      clientIp: requestMeta.clientIp,
      clientKey: requestMeta.clientKey,
    }, timings))
    const response = respond(
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

  await timeStep(timings, 'daily_cache', () => updateDailyAttendanceCache(db, writeResult.storedEntry, dailyLogs, person, office))
  await timeStep(timings, 'scan_event', () => writeScanEvent(db, {
    status: 'accepted',
    decisionCode: entry.decisionCode || 'accepted',
    reason: `Attendance ${entry.action || 'recorded'}.`,
    entry,
    person,
    debug: withServerTimings(personMatch.debug || {}, timings),
    requestMeta: {
      personId: person.id || personMatch.personId || '',
      officeId: person.officeId || '',
      attendanceMode: entry.attendanceMode || '',
      geofenceStatus: entry.geofenceStatus || '',
      clientIp: requestMeta.clientIp,
      clientKey: requestMeta.clientKey,
    },
  }))
  queueOpenVinoProfileUpdate(db, {
    person,
    personId: person.id || personMatch.personId || '',
    entry,
    personMatch,
  })

  const responsePayload = {
    ok: true,
    entry: writeResult.entryPreview,
    ...(await timeStep(timings, 'employee_session', () => buildEmployeeViewSessionPayload(db, person, personMatch.personId))),
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
          serverMatchMode,
        }
      : null
  }

  const response = respond(responsePayload)
  return attachEmployeeViewSessionCookie(response, responsePayload)
}
