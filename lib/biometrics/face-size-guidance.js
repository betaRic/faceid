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
export const CAPTURE_FACE_AREA_HINT_MIN = 0.24
export const CAPTURE_FACE_AREA_READY_MIN = 0.38
export const CAPTURE_FACE_AREA_TARGET_RATIO = 0.54
export const CAPTURE_FACE_AREA_READY_MAX = 0.68
export const CAPTURE_FACE_AREA_TOO_CLOSE = 0.78

export const CAPTURE_DISTANCE_METER_READY_START = 32
export const CAPTURE_DISTANCE_METER_READY_END = 72

const CAPTURE_DISTANCE_METER_FAR_END = 22
const CAPTURE_DISTANCE_METER_TARGET = 50
const CAPTURE_DISTANCE_METER_TOO_CLOSE_START = 84

export function scoreCaptureFaceArea(faceAreaRatio) {
  const ratio = toFiniteNumber(faceAreaRatio)
  if (!ratio || ratio <= 0) return 0

  if (ratio < CAPTURE_FACE_AREA_READY_MIN) {
    const span = Math.max(0.001, CAPTURE_FACE_AREA_TARGET_RATIO - CAPTURE_FACE_AREA_HINT_MIN)
    return clamp(1 - ((CAPTURE_FACE_AREA_TARGET_RATIO - ratio) / span), 0, 1)
  }

  if (ratio <= CAPTURE_FACE_AREA_TARGET_RATIO) {
    const span = Math.max(0.001, CAPTURE_FACE_AREA_TARGET_RATIO - CAPTURE_FACE_AREA_READY_MIN)
    return clamp(1 - ((CAPTURE_FACE_AREA_TARGET_RATIO - ratio) / span), 0, 1)
  }

  const nearSpan = Math.max(0.001, CAPTURE_FACE_AREA_TOO_CLOSE - CAPTURE_FACE_AREA_TARGET_RATIO)
  return clamp(1 - ((ratio - CAPTURE_FACE_AREA_TARGET_RATIO) / nearSpan), 0, 1)
}

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
    return clamp((ratio / CAPTURE_FACE_AREA_HINT_MIN) * CAPTURE_DISTANCE_METER_FAR_END, 4, CAPTURE_DISTANCE_METER_FAR_END)
  }

  if (ratio < CAPTURE_FACE_AREA_READY_MIN) {
    const progress = (ratio - CAPTURE_FACE_AREA_HINT_MIN) / Math.max(0.001, CAPTURE_FACE_AREA_READY_MIN - CAPTURE_FACE_AREA_HINT_MIN)
    return CAPTURE_DISTANCE_METER_FAR_END + (progress * (CAPTURE_DISTANCE_METER_READY_START - CAPTURE_DISTANCE_METER_FAR_END))
  }

  if (ratio <= CAPTURE_FACE_AREA_TARGET_RATIO) {
    const progress = (ratio - CAPTURE_FACE_AREA_READY_MIN) / Math.max(0.001, CAPTURE_FACE_AREA_TARGET_RATIO - CAPTURE_FACE_AREA_READY_MIN)
    return CAPTURE_DISTANCE_METER_READY_START + (progress * (CAPTURE_DISTANCE_METER_TARGET - CAPTURE_DISTANCE_METER_READY_START))
  }

  if (ratio <= CAPTURE_FACE_AREA_READY_MAX) {
    const progress = (ratio - CAPTURE_FACE_AREA_TARGET_RATIO) / Math.max(0.001, CAPTURE_FACE_AREA_READY_MAX - CAPTURE_FACE_AREA_TARGET_RATIO)
    return CAPTURE_DISTANCE_METER_TARGET + (progress * (CAPTURE_DISTANCE_METER_READY_END - CAPTURE_DISTANCE_METER_TARGET))
  }

  if (ratio <= CAPTURE_FACE_AREA_TOO_CLOSE) {
    const progress = (ratio - CAPTURE_FACE_AREA_READY_MAX) / Math.max(0.001, CAPTURE_FACE_AREA_TOO_CLOSE - CAPTURE_FACE_AREA_READY_MAX)
    return CAPTURE_DISTANCE_METER_READY_END + (progress * (CAPTURE_DISTANCE_METER_TOO_CLOSE_START - CAPTURE_DISTANCE_METER_READY_END))
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
      detail: 'Bring your face closer to the camera.',
      meterPosition: getMeterPosition(ratio),
      faceAreaRatio: ratio,
      isCaptureReady: false,
    }
  }

  if (ratio < CAPTURE_FACE_AREA_READY_MIN) {
    return {
      status: 'move-closer',
      label: 'Move closer',
      detail: 'Your face is still a bit small in the oval.',
      meterPosition: getMeterPosition(ratio),
      faceAreaRatio: ratio,
      isCaptureReady: false,
    }
  }

  if (ratio <= CAPTURE_FACE_AREA_READY_MAX) {
    return {
      status: 'ready',
      label: 'Good distance',
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
