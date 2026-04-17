export const SCAN_CAPTURE_POLICY_VERSION = 'scan-v2'
export const ENROLLMENT_CAPTURE_POLICY_VERSION = 'enrollment-v2'

export const PAD_HARD_BLOCK_THRESHOLD = 0.3
export const PAD_GRAY_ZONE_THRESHOLD = 0.58
export const MIN_SCAN_STRICT_FRAMES = 2
export const MIN_SCAN_DESCRIPTOR_SPREAD = 0.06
export const MIN_ACTIVE_TRACE_SAMPLES = 8
export const MIN_TRACK_SHORT_SIDE = 360
export const MIN_TRACK_LONG_SIDE = 640
export const REQUIRED_TRACK_FACING_MODE = 'user'

function toFiniteNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
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
  const resolution = getTrackResolutionSummary(captureContext)
  const riskFlags = []

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

  if (!Number.isFinite(entry?.antispoof) || !Number.isFinite(entry?.liveness)) {
    return {
      ok: false,
      decisionCode: 'blocked_missing_liveness',
      message: 'Passive liveness and anti-spoof scores are required.',
      riskFlags,
    }
  }

  if (Number(entry.antispoof) <= PAD_HARD_BLOCK_THRESHOLD) {
    return {
      ok: false,
      decisionCode: 'blocked_antispoof',
      message: 'Photo or screen detected.',
      riskFlags,
    }
  }

  if (Number(entry.liveness) <= PAD_HARD_BLOCK_THRESHOLD) {
    return {
      ok: false,
      decisionCode: 'blocked_liveness',
      message: 'Liveness check failed.',
      riskFlags,
    }
  }

  if (Number(entry.antispoof) < PAD_GRAY_ZONE_THRESHOLD || Number(entry.liveness) < PAD_GRAY_ZONE_THRESHOLD) {
    riskFlags.push('pad_gray_zone')
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

  if (!Number.isFinite(scanDiagnostics.descriptorSpread) || Number(scanDiagnostics.descriptorSpread) < MIN_SCAN_DESCRIPTOR_SPREAD) {
    riskFlags.push('low_descriptor_spread')
  }

  if (
    !Number.isFinite(resolution.shortSide)
    || !Number.isFinite(resolution.longSide)
    || resolution.shortSide < MIN_TRACK_SHORT_SIDE
    || resolution.longSide < MIN_TRACK_LONG_SIDE
  ) {
    riskFlags.push('weak_track_resolution')
  }

  if (String(captureContext.trackFacingMode || '').trim().toLowerCase() !== REQUIRED_TRACK_FACING_MODE) {
    riskFlags.push('unexpected_camera_facing')
  }

  if (
    captureContext.mobile
    && String(captureContext.screenOrientation || '').toLowerCase().includes('landscape')
  ) {
    riskFlags.push('landscape_mobile_capture')
  }

  return {
    ok: true,
    descriptorMagnitude,
    resolution,
    riskFlags,
  }
}
