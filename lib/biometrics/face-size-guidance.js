function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function toFiniteNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

// Shared face-size calibration across kiosk, registration, and admin re-enrollment.
// The old target (0.18) biased the system toward faces that were still too small in-frame,
// which made operators stand farther than necessary and reduced mobile robustness.
// The new band deliberately shifts capture closer while still leaving enough room for
// device-to-device FOV differences and for the full face to fit inside the oval.
export const CAPTURE_FACE_AREA_HINT_MIN = 0.10
export const CAPTURE_FACE_AREA_READY_MIN = 0.16
export const CAPTURE_FACE_AREA_TARGET_RATIO = 0.24
export const CAPTURE_FACE_AREA_READY_MAX = 0.48
export const CAPTURE_FACE_AREA_TOO_CLOSE = 0.70

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
      label: 'Position face',
      detail: 'Center your face in the oval before capture starts.',
      meterPosition: 0,
      faceAreaRatio: null,
      isCaptureReady: false,
    }
  }

  if (ratio < CAPTURE_FACE_AREA_HINT_MIN) {
    return {
      status: 'too-far',
      label: 'Move closer',
      detail: 'Bring your face closer until it fills more of the oval.',
      meterPosition: getMeterPosition(ratio),
      faceAreaRatio: ratio,
      isCaptureReady: false,
    }
  }

  if (ratio < CAPTURE_FACE_AREA_READY_MIN) {
    return {
      status: 'move-closer',
      label: 'Move a little closer',
      detail: 'The face is visible, but still smaller than the capture target.',
      meterPosition: getMeterPosition(ratio),
      faceAreaRatio: ratio,
      isCaptureReady: false,
    }
  }

  if (ratio <= CAPTURE_FACE_AREA_READY_MAX) {
    return {
      status: 'ready',
      label: 'Good distance',
      detail: 'Hold steady and keep your full face centered inside the oval.',
      meterPosition: getMeterPosition(ratio),
      faceAreaRatio: ratio,
      isCaptureReady: true,
    }
  }

  if (ratio <= CAPTURE_FACE_AREA_TOO_CLOSE) {
    return {
      status: 'slightly-close',
      label: 'Move back a little',
      detail: 'Your face is getting too large in frame. Step back slightly.',
      meterPosition: getMeterPosition(ratio),
      faceAreaRatio: ratio,
      isCaptureReady: false,
    }
  }

  return {
    status: 'too-close',
    label: 'Move back',
    detail: 'Your face is too close. Step back until the full face fits cleanly in the oval.',
    meterPosition: getMeterPosition(ratio),
    faceAreaRatio: ratio,
    isCaptureReady: false,
  }
}

export function isFaceSizeCaptureReady(faceAreaRatio) {
  return getFaceSizeGuidance(faceAreaRatio).isCaptureReady
}
