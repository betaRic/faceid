import { assessServerAntispoof } from '@/lib/biometrics/antispoof-policy'

export const SCAN_CAPTURE_POLICY_VERSION = 'scan-v4'
export const ENROLLMENT_CAPTURE_POLICY_VERSION = 'enrollment-v2'

export const MIN_SCAN_STRICT_FRAMES = 3
export const MIN_SCAN_DESCRIPTOR_SPREAD = 0.06
export const HARD_BLOCK_DESCRIPTOR_SPREAD = 0.03
export const MAX_SCAN_DESCRIPTOR_SPREAD = 0.85
export const MIN_ACTIVE_TRACE_SAMPLES = 8
export const MIN_TRACK_SHORT_SIDE = 480
export const MIN_TRACK_LONG_SIDE = 640
export const REQUIRED_TRACK_FACING_MODE = 'user'
const MAX_NORMALIZED_DESCRIPTOR_SPREAD = 2

function toFiniteNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function getDescriptorSpreadAssessment(scanDiagnostics = {}) {
  const serverDescriptorSpread = toFiniteNumber(scanDiagnostics.serverDescriptorSpread)
  const clientDescriptorSpread = toFiniteNumber(scanDiagnostics.descriptorSpread)
  const clientSpreadLooksLegacyRaw = Number.isFinite(clientDescriptorSpread)
    && clientDescriptorSpread > MAX_NORMALIZED_DESCRIPTOR_SPREAD
  const normalizedClientDescriptorSpread = clientSpreadLooksLegacyRaw ? null : clientDescriptorSpread
  const descriptorSpread = Number.isFinite(serverDescriptorSpread)
    ? serverDescriptorSpread
    : normalizedClientDescriptorSpread

  return {
    descriptorSpread,
    source: Number.isFinite(serverDescriptorSpread)
      ? 'server'
      : Number.isFinite(normalizedClientDescriptorSpread)
        ? 'client'
        : '',
    serverDescriptorSpread,
    clientDescriptorSpread,
    clientSpreadLooksLegacyRaw,
  }
}

export function getDescriptorMagnitude(descriptor) {
  if (!Array.isArray(descriptor) || descriptor.length === 0) return null
  const total = descriptor.reduce((sum, value) => {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? sum + (numeric * numeric) : sum
  }, 0)
  return Math.sqrt(total)
}

export function getTrackResolutionSummary(captureContext = {}) {
  const width = toFiniteNumber(captureContext.trackWidth)
  const height = toFiniteNumber(captureContext.trackHeight)
  const shortSide = Number.isFinite(width) && Number.isFinite(height)
    ? Math.min(width, height)
    : null
  const longSide = Number.isFinite(width) && Number.isFinite(height)
    ? Math.max(width, height)
    : null

  return {
    width,
    height,
    shortSide,
    longSide,
  }
}

export function getScanCapturePolicyAssessment(entry) {
  const captureContext = entry?.captureContext && typeof entry.captureContext === 'object'
    ? entry.captureContext
    : {}
  const scanDiagnostics = entry?.scanDiagnostics && typeof entry.scanDiagnostics === 'object'
    ? entry.scanDiagnostics
    : {}
  const descriptorMagnitude = getDescriptorMagnitude(entry?.descriptor)
  const spreadAssessment = getDescriptorSpreadAssessment(scanDiagnostics)
  const resolution = getTrackResolutionSummary(captureContext)
  const riskFlags = []
  const antispoofAssessment = assessServerAntispoof(entry?.antispoof)

  if (!antispoofAssessment.ok) {
    return {
      ...antispoofAssessment,
      riskFlags,
    }
  }

  if (captureContext.capturePolicyVersion !== SCAN_CAPTURE_POLICY_VERSION) {
    return {
      ok: false,
      decisionCode: 'blocked_capture_policy',
      message: 'Scan capture policy version is missing or outdated.',
      riskFlags,
    }
  }

  if (!Number.isFinite(descriptorMagnitude) || descriptorMagnitude < 0.8 || descriptorMagnitude > 1.2) {
    return {
      ok: false,
      decisionCode: 'blocked_descriptor_shape',
      message: 'Face descriptor magnitude is not plausible.',
      riskFlags,
    }
  }

  if (!Number.isFinite(captureContext.verificationFrames) || Number(captureContext.verificationFrames) < 1) {
    return {
      ok: false,
      decisionCode: 'blocked_capture_policy',
      message: 'Verification burst metadata is missing.',
      riskFlags,
    }
  }

  if (!Number.isFinite(scanDiagnostics.strictFrames) || Number(scanDiagnostics.strictFrames) < MIN_SCAN_STRICT_FRAMES) {
    riskFlags.push('low_strict_frames')
  }

  if (spreadAssessment.clientSpreadLooksLegacyRaw) {
    riskFlags.push('legacy_client_descriptor_spread')
  }

  if (
    spreadAssessment.source === 'server'
    && Number.isFinite(spreadAssessment.clientDescriptorSpread)
    && spreadAssessment.clientDescriptorSpread > MAX_SCAN_DESCRIPTOR_SPREAD
    && spreadAssessment.serverDescriptorSpread <= MAX_SCAN_DESCRIPTOR_SPREAD
  ) {
    riskFlags.push('client_server_descriptor_spread_mismatch')
  }

  if (
    Number.isFinite(spreadAssessment.descriptorSpread)
    && Number(spreadAssessment.descriptorSpread) < HARD_BLOCK_DESCRIPTOR_SPREAD
  ) {
    return {
      ok: false,
      decisionCode: 'blocked_low_descriptor_spread',
      message: 'Face capture quality too low. Please hold still and try again.',
      riskFlags,
    }
  }

  if (
    Number.isFinite(spreadAssessment.descriptorSpread)
    && Number(spreadAssessment.descriptorSpread) > MAX_SCAN_DESCRIPTOR_SPREAD
  ) {
    return {
      ok: false,
      decisionCode: 'blocked_unstable_descriptor_burst',
      message: 'Face capture was unstable. Hold still and try again.',
      riskFlags: [...riskFlags, 'unstable_descriptor_spread'],
    }
  }

  if (
    !Number.isFinite(spreadAssessment.descriptorSpread)
    || Number(spreadAssessment.descriptorSpread) < MIN_SCAN_DESCRIPTOR_SPREAD
  ) {
    riskFlags.push('low_descriptor_spread')
  }

  if (
    Number.isFinite(resolution.shortSide)
    && Number.isFinite(resolution.longSide)
    && (resolution.shortSide < MIN_TRACK_SHORT_SIDE || resolution.longSide < MIN_TRACK_LONG_SIDE)
  ) {
    return {
      ok: false,
      decisionCode: 'blocked_low_resolution',
      message: 'Camera resolution too low for reliable face matching. Please use a device with a better camera.',
      riskFlags: [...riskFlags, 'weak_track_resolution'],
    }
  }

  if (!Number.isFinite(resolution.shortSide) || !Number.isFinite(resolution.longSide)) {
    riskFlags.push('weak_track_resolution')
  }

  if (String(captureContext.trackFacingMode || '').trim().toLowerCase() !== REQUIRED_TRACK_FACING_MODE) {
    riskFlags.push('unexpected_camera_facing')
  }

  if (
    captureContext.mobile
    && String(captureContext.screenOrientation || '').toLowerCase().includes('landscape')
  ) {
    return {
      ok: false,
      decisionCode: 'blocked_landscape_mobile',
      message: 'Please rotate your phone to portrait mode for face scanning.',
      riskFlags: [...riskFlags, 'landscape_mobile_capture'],
    }
  }

  return {
    ok: true,
    descriptorMagnitude,
    resolution,
    riskFlags,
  }
}
