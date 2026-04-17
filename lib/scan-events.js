import 'server-only'

import { FieldValue } from 'firebase-admin/firestore'

function roundMetric(value, digits = 4) {
  if (!Number.isFinite(value)) return null
  const factor = 10 ** digits
  return Math.round(Number(value) * factor) / factor
}

function toPlainObject(value) {
  return value && typeof value === 'object' ? value : {}
}

export async function writeScanEvent(db, {
  status = 'blocked',
  decisionCode = 'blocked_unknown',
  reason = '',
  entry = {},
  person = null,
  debug = null,
  requestMeta = null,
}) {
  try {
    const descriptor = Array.isArray(entry?.descriptor) ? entry.descriptor : []
    const descriptorMagnitude = descriptor.length > 0
      ? Math.sqrt(descriptor.reduce((sum, value) => sum + (Number(value) * Number(value)), 0))
      : null
    const captureContext = toPlainObject(entry?.captureContext)
    const scanDiagnostics = toPlainObject(entry?.scanDiagnostics)
    const kioskContext = toPlainObject(entry?.kioskContext)
    const challenge = toPlainObject(entry?.challenge)
    const activeChallengeTrace = toPlainObject(entry?.activeChallengeTrace)
    const matchDebug = toPlainObject(debug)
    const riskFlags = Array.isArray(entry?.riskFlags) ? entry.riskFlags : []
    const geo = {
      latitude: Number.isFinite(entry?.latitude) ? Number(entry.latitude) : null,
      longitude: Number.isFinite(entry?.longitude) ? Number(entry.longitude) : null,
    }

    await db.collection('scan_events').add({
      status,
      decisionCode: String(decisionCode || '').slice(0, 80),
      reason: String(reason || '').slice(0, 500),
      timestamp: Number(entry?.timestamp || Date.now()),
      createdAt: FieldValue.serverTimestamp(),
      verificationMode: String(entry?.verificationMode || 'legacy').slice(0, 80),
      verificationStage: String(entry?.verificationStage || '').slice(0, 40),
      employeeId: String(person?.employeeId || entry?.employeeId || '').slice(0, 64),
      personId: String(person?.id || requestMeta?.personId || '').slice(0, 128),
      name: String(person?.name || entry?.name || '').slice(0, 160),
      officeId: String(person?.officeId || entry?.officeId || requestMeta?.officeId || '').slice(0, 64),
      officeName: String(person?.officeName || entry?.officeName || '').slice(0, 160),
      attendanceMode: String(entry?.attendanceMode || requestMeta?.attendanceMode || '').slice(0, 40),
      geofenceStatus: String(entry?.geofenceStatus || requestMeta?.geofenceStatus || '').slice(0, 120),
      wifiSsid: entry?.wifiSsid ? String(entry.wifiSsid).slice(0, 120) : null,
      location: geo,
      descriptor: {
        length: descriptor.length,
        magnitude: roundMetric(descriptorMagnitude),
      },
      kioskContext: {
        kioskId: String(kioskContext.kioskId || '').slice(0, 120),
        source: String(kioskContext.source || '').slice(0, 40),
      },
      challenge: {
        challengeId: String(challenge.challengeId || challenge.token || '').slice(0, 200),
        mode: String(challenge.mode || '').slice(0, 40),
        motionType: String(challenge.motionType || '').slice(0, 64),
      },
      riskFlags: Array.from(new Set(
        riskFlags
          .map(flag => String(flag || '').trim().toLowerCase())
          .filter(Boolean),
      )).slice(0, 16),
      captureContext: {
        mobile: Boolean(captureContext.mobile),
        platform: String(captureContext.platform || '').slice(0, 120),
        capturePolicyVersion: String(captureContext.capturePolicyVersion || '').slice(0, 40),
        captureResolution: String(captureContext.captureResolution || '').slice(0, 24),
        verificationFrames: Number.isFinite(captureContext.verificationFrames) ? Number(captureContext.verificationFrames) : null,
        descriptorSpread: roundMetric(captureContext.descriptorSpread),
        deviceMemoryGb: Number.isFinite(captureContext.deviceMemoryGb) ? Number(captureContext.deviceMemoryGb) : null,
        hardwareConcurrency: Number.isFinite(captureContext.hardwareConcurrency) ? Number(captureContext.hardwareConcurrency) : null,
        burstQualityScore: roundMetric(captureContext.burstQualityScore),
        strictFrames: Number.isFinite(captureContext.strictFrames) ? Number(captureContext.strictFrames) : null,
        fallbackFrames: Number.isFinite(captureContext.fallbackFrames) ? Number(captureContext.fallbackFrames) : null,
        screenOrientation: String(captureContext.screenOrientation || '').slice(0, 40),
        trackWidth: Number.isFinite(captureContext.trackWidth) ? Number(captureContext.trackWidth) : null,
        trackHeight: Number.isFinite(captureContext.trackHeight) ? Number(captureContext.trackHeight) : null,
        trackAspectRatio: roundMetric(captureContext.trackAspectRatio),
        trackFrameRate: roundMetric(captureContext.trackFrameRate),
        trackFacingMode: String(captureContext.trackFacingMode || '').slice(0, 40),
        trackResizeMode: String(captureContext.trackResizeMode || '').slice(0, 40),
        userAgent: String(captureContext.userAgent || '').slice(0, 512),
      },
      scanDiagnostics: {
        deviceClass: String(scanDiagnostics.deviceClass || '').slice(0, 40),
        browser: String(scanDiagnostics.browser || '').slice(0, 80),
        bestFaceAreaRatio: roundMetric(scanDiagnostics.bestFaceAreaRatio),
        bestCenteredness: roundMetric(scanDiagnostics.bestCenteredness),
        bestYaw: roundMetric(scanDiagnostics.bestYaw),
        bestPitch: roundMetric(scanDiagnostics.bestPitch),
        bestRoll: roundMetric(scanDiagnostics.bestRoll),
        targetFrames: Number.isFinite(scanDiagnostics.targetFrames) ? Number(scanDiagnostics.targetFrames) : null,
        capturedFrames: Number.isFinite(scanDiagnostics.capturedFrames) ? Number(scanDiagnostics.capturedFrames) : null,
        strictFrames: Number.isFinite(scanDiagnostics.strictFrames) ? Number(scanDiagnostics.strictFrames) : null,
        fallbackFrames: Number.isFinite(scanDiagnostics.fallbackFrames) ? Number(scanDiagnostics.fallbackFrames) : null,
        aggregatedFrames: Number.isFinite(scanDiagnostics.aggregatedFrames) ? Number(scanDiagnostics.aggregatedFrames) : null,
        multiFaceFrames: Number.isFinite(scanDiagnostics.multiFaceFrames) ? Number(scanDiagnostics.multiFaceFrames) : null,
        descriptorSpread: roundMetric(scanDiagnostics.descriptorSpread),
      },
      matchDebug: {
        source: String(matchDebug.source || '').slice(0, 40),
        candidateCount: Number.isFinite(matchDebug.candidateCount) ? Number(matchDebug.candidateCount) : null,
        bestDistance: roundMetric(matchDebug.bestDistance),
        secondDistance: roundMetric(matchDebug.secondDistance),
        threshold: roundMetric(matchDebug.threshold),
        ambiguousMargin: roundMetric(matchDebug.ambiguousMargin),
        supportDescriptorCount: Number.isFinite(matchDebug.supportDescriptorCount) ? Number(matchDebug.supportDescriptorCount) : null,
        supportCount: Number.isFinite(matchDebug.supportCount) ? Number(matchDebug.supportCount) : null,
        supportDistance: roundMetric(matchDebug.supportDistance),
        supportBestDistance: roundMetric(matchDebug.supportBestDistance),
        supportSecondBestDistance: roundMetric(matchDebug.supportSecondBestDistance),
        supportGate: String(matchDebug.supportGate || '').slice(0, 80),
        searchPhase: String(matchDebug.searchPhase || '').slice(0, 80),
        searchPhases: Array.isArray(matchDebug.searchPhases)
          ? matchDebug.searchPhases
            .slice(0, 8)
            .map(phase => ({
              key: String(phase?.key || '').slice(0, 80),
              officeIdsCount: Number.isFinite(phase?.officeIdsCount) ? Number(phase.officeIdsCount) : null,
              decisionCode: String(phase?.decisionCode || '').slice(0, 80),
              candidateCount: Number.isFinite(phase?.candidateCount) ? Number(phase.candidateCount) : null,
              bestDistance: roundMetric(phase?.bestDistance),
              secondDistance: roundMetric(phase?.secondDistance),
            }))
          : [],
      },
      activeChallengeTrace: {
        motionType: String(activeChallengeTrace.motionType || '').slice(0, 64),
        startedAt: Number.isFinite(activeChallengeTrace.startedAt) ? Number(activeChallengeTrace.startedAt) : null,
        completedAt: Number.isFinite(activeChallengeTrace.completedAt) ? Number(activeChallengeTrace.completedAt) : null,
        sampleCount: Array.isArray(activeChallengeTrace.samples) ? activeChallengeTrace.samples.length : 0,
      },
      clientIp: String(requestMeta?.clientIp || '').slice(0, 80),
      clientKey: String(requestMeta?.clientKey || '').slice(0, 160),
      challengeUsed: Boolean(entry?.challenge?.token),
    })
  } catch {
    // Scan telemetry is non-blocking by design.
  }
}
