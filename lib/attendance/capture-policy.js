import { validateLivenessEvidence } from '@/lib/biometrics/liveness'

export const SCAN_CAPTURE_POLICY_VERSION = 'scan-v4'
export const ENROLLMENT_CAPTURE_POLICY_VERSION = 'enrollment-v2'

export const PAD_ANTISPOOF_HARD_BLOCK_THRESHOLD = 0.3
export const PAD_LIVENESS_HARD_BLOCK_THRESHOLD = 0.15
export const PAD_GRAY_ZONE_THRESHOLD = 0.58
export const MIN_SCAN_STRICT_FRAMES = 2
export const MIN_SCAN_DESCRIPTOR_SPREAD = 0.06
export const HARD_BLOCK_DESCRIPTOR_SPREAD = 0.03
export const MAX_SCAN_DESCRIPTOR_SPREAD = 8
export const MIN_ACTIVE_TRACE_SAMPLES = 8
export const MIN_TRACK_SHORT_SIDE = 480
export const MIN_TRACK_LONG_SIDE = 640
export const REQUIRED_TRACK_FACING_MODE = 'user'

function toFiniteNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function mapLivenessFailure(reason) {
  switch (reason) {
    case 'antispoof_hard_fail':
      return {
        decisionCode: 'blocked_antispoof',
        message: 'Anti-spoof check failed across burst frames.',
      }
    case 'static_image_detected':
      return {
        decisionCode: 'blocked_liveness',
        message: 'Temporal liveness check detected a static image.',
      }
    case 'photo_like_rigid_motion':
      return {
        decisionCode: 'blocked_liveness',
        message: 'Photo-like scan detected. Please present your live face and blink naturally.',
      }
    case 'missing_eye_signal':
      return {
        decisionCode: 'blocked_liveness',
        message: 'Eye-movement liveness signal was not detected. Please blink naturally and scan again.',
      }
    case 'missing_motion_signal':
      return {
        decisionCode: 'blocked_liveness',
        message: 'Natural micro-motion was not detected. Please present your live face.',
      }
    case 'insufficient_liveness_frames':
      return {
        decisionCode: 'blocked_liveness',
        message: 'Not enough high-quality frames captured. Please hold steady and scan again.',
      }
    default:
      return {
        decisionCode: 'blocked_liveness',
        message: 'Liveness check failed. Please present your live face.',
      }
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

  if (Number(entry.antispoof) <= PAD_ANTISPOOF_HARD_BLOCK_THRESHOLD) {
    return {
      ok: false,
      decisionCode: 'blocked_antispoof',
      message: 'Photo or screen detected.',
      riskFlags,
    }
  }

  if (Number(entry.liveness) <= PAD_LIVENESS_HARD_BLOCK_THRESHOLD) {
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

  const livenessValidation = validateLivenessEvidence(entry?.livenessEvidence)
  if (livenessValidation && !livenessValidation.ok) {
    const { decisionCode, message } = mapLivenessFailure(livenessValidation.reason)
    return {
      ok: false,
      decisionCode,
      message,
      riskFlags: [...riskFlags, 'weak_temporal_liveness'],
    }
  }
  if (Array.isArray(livenessValidation?.riskFlags)) {
    riskFlags.push(...livenessValidation.riskFlags)
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

  if (Number.isFinite(scanDiagnostics.descriptorSpread) && Number(scanDiagnostics.descriptorSpread) < HARD_BLOCK_DESCRIPTOR_SPREAD) {
    return {
      ok: false,
      decisionCode: 'blocked_low_descriptor_spread',
      message: 'Face capture quality too low. Please hold still and try again.',
      riskFlags,
    }
  }

  if (Number.isFinite(scanDiagnostics.descriptorSpread) && Number(scanDiagnostics.descriptorSpread) > MAX_SCAN_DESCRIPTOR_SPREAD) {
    return {
      ok: false,
      decisionCode: 'blocked_unstable_descriptor_burst',
      message: 'Face capture was unstable. Hold still and try again.',
      riskFlags: [...riskFlags, 'unstable_descriptor_spread'],
    }
  }

  if (!Number.isFinite(scanDiagnostics.descriptorSpread) || Number(scanDiagnostics.descriptorSpread) < MIN_SCAN_DESCRIPTOR_SPREAD) {
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
