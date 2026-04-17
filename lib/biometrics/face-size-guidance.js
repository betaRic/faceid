function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function toFiniteNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

// Shared face-size calibration across kiosk, registration, and admin re-enrollment.
// This is the single source of truth for camera-distance guidance. If capture
// feels wrong in one flow, it should be fixed here instead of drifting into
// separate kiosk/registration bands.
export const CAPTURE_FACE_AREA_READY_MIN = 0.13
export const CAPTURE_FACE_AREA_TARGET_RATIO = 0.28
export const CAPTURE_FACE_AREA_READY_MAX = 0.70
export const CAPTURE_FACE_AREA_TOO_CLOSE = 0.88

export function getFaceAreaRatioFromBox(box, frameWidth, frameHeight) {
  if (!box) return null
  const safeWidth = Math.max(1, Number(frameWidth || 0))
  const safeHeight = Math.max(1, Number(frameHeight || 0))
  const faceWidth = Math.max(0, Number(box.width || 0))
  const faceHeight = Math.max(0, Number(box.height || 0))
  if (!faceWidth || !faceHeight) return null
  return (faceWidth * faceHeight) / (safeWidth * safeHeight)
}

function getMeterPosition(faceAreaRatio) {
  const ratio = toFiniteNumber(faceAreaRatio)
  if (!ratio || ratio <= 0) return 0

  if (ratio < CAPTURE_FACE_AREA_HINT_MIN) {
    return clamp((ratio / CAPTURE_FACE_AREA_HINT_MIN) * 20, 4, 20)
  }

  if (ratio < CAPTURE_FACE_AREA_READY_MIN) {
    const progress = (ratio - CAPTURE_FACE_AREA_HINT_MIN) / Math.max(0.001, CAPTURE_FACE_AREA_READY_MIN - CAPTURE_FACE_AREA_HINT_MIN)
    return 20 + (progress * 15)
  }

  if (ratio <= CAPTURE_FACE_AREA_READY_MAX) {
    const progress = (ratio - CAPTURE_FACE_AREA_READY_MIN) / Math.max(0.001, CAPTURE_FACE_AREA_READY_MAX - CAPTURE_FACE_AREA_READY_MIN)
    return 38 + (progress * 24)
  }

  if (ratio <= CAPTURE_FACE_AREA_TOO_CLOSE) {
    const progress = (ratio - CAPTURE_FACE_AREA_READY_MAX) / Math.max(0.001, CAPTURE_FACE_AREA_TOO_CLOSE - CAPTURE_FACE_AREA_READY_MAX)
    return 68 + (progress * 20)
  }

  return 92
}

export function getFaceSizeGuidance(faceAreaRatio) {
  const ratio = toFiniteNumber(faceAreaRatio)

  if (!ratio || ratio <= 0) {
    return {
      status: 'not-detected',
      label: 'Find the frame',
      detail: 'Center your face inside the oval.',
      meterPosition: 0,
      faceAreaRatio: null,
      isCaptureReady: false,
    }
  }

  if (ratio < CAPTURE_FACE_AREA_HINT_MIN) {
    return {
      status: 'too-far',
      label: 'Move closer',
      detail: 'Bring your face slightly closer.',
      meterPosition: getMeterPosition(ratio),
      faceAreaRatio: ratio,
      isCaptureReady: false,
    }
  }

  if (ratio < CAPTURE_FACE_AREA_READY_MIN) {
    return {
      status: 'move-closer',
      label: 'Closer',
      detail: 'Your face is still a bit small in the oval.',
      meterPosition: getMeterPosition(ratio),
      faceAreaRatio: ratio,
      isCaptureReady: false,
    }
  }

  if (ratio <= CAPTURE_FACE_AREA_READY_MAX) {
    return {
      status: 'ready',
      label: 'Good position',
      detail: 'Hold steady and keep your face inside the oval.',
      meterPosition: getMeterPosition(ratio),
      faceAreaRatio: ratio,
      isCaptureReady: true,
    }
  }

  if (ratio <= CAPTURE_FACE_AREA_TOO_CLOSE) {
    return {
      status: 'slightly-close',
      label: 'Ease back',
      detail: 'You are a little close. Lean back slightly.',
      meterPosition: getMeterPosition(ratio),
      faceAreaRatio: ratio,
      isCaptureReady: false,
    }
  }

  return {
    status: 'too-close',
    label: 'Move back',
    detail: 'You are too close. Move back until your full face fits comfortably.',
    meterPosition: getMeterPosition(ratio),
    faceAreaRatio: ratio,
    isCaptureReady: false,
  }
}

export function isFaceSizeCaptureReady(faceAreaRatio) {
  return getFaceSizeGuidance(faceAreaRatio).isCaptureReady
}
