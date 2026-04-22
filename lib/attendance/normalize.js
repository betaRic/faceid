import { DESCRIPTOR_LENGTH } from '@/lib/config'

export function normalizeEntry(body) {
  const captureContext = body?.captureContext && typeof body.captureContext === 'object'
    ? body.captureContext
    : {}
  const scanDiagnostics = body?.scanDiagnostics && typeof body.scanDiagnostics === 'object'
    ? body.scanDiagnostics
    : {}
  const kioskContext = body?.kioskContext && typeof body.kioskContext === 'object'
    ? body.kioskContext
    : {}
  const challenge = body?.challenge && typeof body.challenge === 'object'
    ? body.challenge
    : {}
  const activeChallengeTrace = body?.activeChallengeTrace && typeof body.activeChallengeTrace === 'object'
    ? body.activeChallengeTrace
    : {}
  const livenessEvidence = body?.livenessEvidence && typeof body.livenessEvidence === 'object'
    ? body.livenessEvidence
    : null
  const riskFlags = Array.isArray(body?.riskFlags) ? body.riskFlags : []
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
    wifiSsid: Array.isArray(body?.wifiSsid) ? body.wifiSsid[0] : (String(body?.wifiSsid || '').trim() || null),
    descriptor: Array.isArray(body?.descriptor) ? body.descriptor.map(Number) : [],
    descriptors: Array.isArray(body?.descriptors)
      ? body.descriptors
          .filter(d => Array.isArray(d) && d.length === DESCRIPTOR_LENGTH)
          .slice(0, 5)
          .map(d => d.map(Number))
      : [],
    landmarks: Array.isArray(body?.landmarks) ? body.landmarks : [],
    antispoof: body?.antispoof == null ? null : Number(body.antispoof),
    liveness: body?.liveness == null ? null : Number(body.liveness),
    verificationMode: String(body?.verificationMode || '').trim(),
    verificationStage: String(body?.verificationStage || '').trim(),
    riskFlags: Array.from(new Set(
      riskFlags
        .map(flag => String(flag || '').trim().toLowerCase())
        .filter(Boolean),
    )).slice(0, 16),
    captureContext: {
      userAgent: String(captureContext.userAgent || '').slice(0, 512),
      platform: String(captureContext.platform || '').slice(0, 120),
      mobile: Boolean(captureContext.mobile),
      deviceMemoryGb: Number.isFinite(captureContext.deviceMemoryGb) ? Number(captureContext.deviceMemoryGb) : null,
      hardwareConcurrency: Number.isFinite(captureContext.hardwareConcurrency) ? Number(captureContext.hardwareConcurrency) : null,
      captureResolution: String(captureContext.captureResolution || '').slice(0, 24),
      verificationFrames: Number.isFinite(captureContext.verificationFrames) ? Number(captureContext.verificationFrames) : null,
      descriptorSpread: Number.isFinite(captureContext.descriptorSpread) ? Number(captureContext.descriptorSpread) : null,
      burstQualityScore: Number.isFinite(captureContext.burstQualityScore) ? Number(captureContext.burstQualityScore) : null,
      strictFrames: Number.isFinite(captureContext.strictFrames) ? Number(captureContext.strictFrames) : null,
      fallbackFrames: Number.isFinite(captureContext.fallbackFrames) ? Number(captureContext.fallbackFrames) : null,
      capturePolicyVersion: String(captureContext.capturePolicyVersion || '').slice(0, 40),
      screenOrientation: String(captureContext.screenOrientation || '').slice(0, 40),
      trackWidth: Number.isFinite(captureContext.trackWidth) ? Number(captureContext.trackWidth) : null,
      trackHeight: Number.isFinite(captureContext.trackHeight) ? Number(captureContext.trackHeight) : null,
      trackAspectRatio: Number.isFinite(captureContext.trackAspectRatio) ? Number(captureContext.trackAspectRatio) : null,
      trackFrameRate: Number.isFinite(captureContext.trackFrameRate) ? Number(captureContext.trackFrameRate) : null,
      trackFacingMode: String(captureContext.trackFacingMode || '').slice(0, 40),
      trackResizeMode: String(captureContext.trackResizeMode || '').slice(0, 40),
      kioskId: String(captureContext.kioskId || '').slice(0, 120),
    },
    scanDiagnostics: {
      deviceClass: String(scanDiagnostics.deviceClass || '').slice(0, 40),
      browser: String(scanDiagnostics.browser || '').slice(0, 80),
      bestFaceAreaRatio: Number.isFinite(scanDiagnostics.bestFaceAreaRatio) ? Number(scanDiagnostics.bestFaceAreaRatio) : null,
      bestCenteredness: Number.isFinite(scanDiagnostics.bestCenteredness) ? Number(scanDiagnostics.bestCenteredness) : null,
      bestYaw: Number.isFinite(scanDiagnostics.bestYaw) ? Number(scanDiagnostics.bestYaw) : null,
      bestPitch: Number.isFinite(scanDiagnostics.bestPitch) ? Number(scanDiagnostics.bestPitch) : null,
      bestRoll: Number.isFinite(scanDiagnostics.bestRoll) ? Number(scanDiagnostics.bestRoll) : null,
      targetFrames: Number.isFinite(scanDiagnostics.targetFrames) ? Number(scanDiagnostics.targetFrames) : null,
      capturedFrames: Number.isFinite(scanDiagnostics.capturedFrames) ? Number(scanDiagnostics.capturedFrames) : null,
      strictFrames: Number.isFinite(scanDiagnostics.strictFrames) ? Number(scanDiagnostics.strictFrames) : null,
      fallbackFrames: Number.isFinite(scanDiagnostics.fallbackFrames) ? Number(scanDiagnostics.fallbackFrames) : null,
      aggregatedFrames: Number.isFinite(scanDiagnostics.aggregatedFrames) ? Number(scanDiagnostics.aggregatedFrames) : null,
      multiFaceFrames: Number.isFinite(scanDiagnostics.multiFaceFrames) ? Number(scanDiagnostics.multiFaceFrames) : null,
      descriptorSpread: Number.isFinite(scanDiagnostics.descriptorSpread) ? Number(scanDiagnostics.descriptorSpread) : null,
    },
    kioskContext: {
      kioskId: String(kioskContext.kioskId || '').slice(0, 120),
      source: String(kioskContext.source || '').slice(0, 40),
    },
    challenge: {
      challengeId: String(challenge.challengeId || challenge.token || '').slice(0, 200),
      token: String(challenge.token || challenge.challengeId || '').slice(0, 200),
      expiresAt: Number.isFinite(challenge.expiresAt) ? Number(challenge.expiresAt) : null,
      issuedAt: Number.isFinite(challenge.issuedAt) ? Number(challenge.issuedAt) : null,
      mode: String(challenge.mode || '').slice(0, 40),
      motionType: String(challenge.motionType || '').slice(0, 64),
      verificationStage: String(challenge.verificationStage || '').slice(0, 40),
      riskFlags: Array.isArray(challenge.riskFlags)
        ? Array.from(new Set(
            challenge.riskFlags
              .map(flag => String(flag || '').trim().toLowerCase())
              .filter(Boolean),
          )).slice(0, 16)
        : [],
      capturePolicyVersion: String(challenge.capturePolicyVersion || '').slice(0, 40),
    },
    activeChallengeTrace: {
      motionType: String(activeChallengeTrace.motionType || '').slice(0, 64),
      startedAt: Number.isFinite(activeChallengeTrace.startedAt) ? Number(activeChallengeTrace.startedAt) : null,
      completedAt: Number.isFinite(activeChallengeTrace.completedAt) ? Number(activeChallengeTrace.completedAt) : null,
      samples: Array.isArray(activeChallengeTrace.samples)
        ? activeChallengeTrace.samples
          .slice(0, 120)
          .map(sample => ({
            timestamp: Number.isFinite(sample?.timestamp) ? Number(sample.timestamp) : null,
            yaw: Number.isFinite(sample?.yaw) ? Number(sample.yaw) : null,
            pitch: Number.isFinite(sample?.pitch) ? Number(sample.pitch) : null,
            roll: Number.isFinite(sample?.roll) ? Number(sample.roll) : null,
          }))
        : [],
    },
    livenessEvidence: livenessEvidence ? {
      earSamples: Array.isArray(livenessEvidence.earSamples)
        ? livenessEvidence.earSamples.slice(0, 30).map(v => (v === null ? null : Number(v)))
        : [],
      meshDeltas: Array.isArray(livenessEvidence.meshDeltas)
        ? livenessEvidence.meshDeltas.slice(0, 30).map(v => (v === null ? null : Number(v)))
        : [],
      blinkCount: Number.isFinite(livenessEvidence.blinkCount) ? Number(livenessEvidence.blinkCount) : 0,
      earVariance: Number.isFinite(livenessEvidence.earVariance) ? Number(livenessEvidence.earVariance) : 0,
      avgMeshDelta: Number.isFinite(livenessEvidence.avgMeshDelta) ? Number(livenessEvidence.avgMeshDelta) : 0,
      avgAntispoof: livenessEvidence.avgAntispoof == null ? null : Number(livenessEvidence.avgAntispoof),
      avgLiveness: livenessEvidence.avgLiveness == null ? null : Number(livenessEvidence.avgLiveness),
      frameCount: Number.isFinite(livenessEvidence.frameCount) ? Number(livenessEvidence.frameCount) : 0,
      score: Number.isFinite(livenessEvidence.score) ? Number(livenessEvidence.score) : 0,
      pass: Boolean(livenessEvidence.pass),
      reason: String(livenessEvidence.reason || '').slice(0, 80),
    } : null,
  }
}

export function validateEntry(entry) {
  if (
    entry.descriptor.length !== DESCRIPTOR_LENGTH ||
    entry.descriptor.some(value => !Number.isFinite(value))
  ) {
    return `Face descriptor is invalid. Expected ${DESCRIPTOR_LENGTH} finite values.`
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

  if (entry.latitude != null && (entry.latitude < -90 || entry.latitude > 90)) {
    return 'Latitude must be between -90 and 90 degrees.'
  }

  if (entry.longitude != null && (entry.longitude < -180 || entry.longitude > 180)) {
    return 'Longitude must be between -180 and 180 degrees.'
  }

  const now = Date.now()
  const MAX_FUTURE_MS = 60000
  const MAX_PAST_MS = 3600000

  if (entry.timestamp != null && !Number.isFinite(entry.timestamp)) {
    return 'Timestamp is not valid.'
  }

  if (entry.timestamp != null && (entry.timestamp > now + MAX_FUTURE_MS || entry.timestamp < now - MAX_PAST_MS)) {
    return 'Timestamp is out of acceptable range.'
  }

  return null
}
