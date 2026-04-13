const MIN_FRAMES = 4
const MIN_VARIANCE = 1.5
const MAX_VARIANCE = 500
const MIN_VALID_FRAMES = 3

const ENROLLMENT_MIN_FRAMES = 4
const ENROLLMENT_MIN_VARIANCE = 0.5

const LIVENESS_POINTS = [1, 4, 6, 9, 33, 263, 61, 291, 199]

const EYE_LEFT_INDICES = [33, 133, 160, 153, 144, 145, 246, 161, 160]
const EYE_RIGHT_INDICES = [362, 263, 387, 380, 373, 374, 381, 256, 388]
const NOSE_INDICES = [6, 197, 195, 5, 4, 1, 2, 3, 10]
const MOUTH_INDICES = [13, 14, 78, 308]

function extractXY(pt) {
  if (!pt) return null
  if (Array.isArray(pt)) {
    const x = pt[0]
    const y = pt[1]
    return typeof x === 'number' && typeof y === 'number' ? { x, y } : null
  }
  const x = pt._x ?? pt.x
  const y = pt._y ?? pt.y
  return typeof x === 'number' && typeof y === 'number' ? { x, y } : null
}

function extractXYZ(pt) {
  if (!pt) return null
  if (Array.isArray(pt) && pt.length >= 3) {
    return { x: pt[0], y: pt[1], z: pt[2] }
  }
  return { x: pt.x ?? 0, y: pt.y ?? 0, z: pt.z ?? 0 }
}

function computeVariances(frameLandmarks) {
  return LIVENESS_POINTS.map(pointIndex => {
    const positions = frameLandmarks
      .map(landmarks => {
        const pt = Array.isArray(landmarks) ? landmarks[pointIndex] : null
        return extractXY(pt)
      })
      .filter(Boolean)

    if (positions.length < MIN_VALID_FRAMES) return null

    const meanX = positions.reduce((s, p) => s + p.x, 0) / positions.length
    const meanY = positions.reduce((s, p) => s + p.y, 0) / positions.length
    return positions.reduce((s, p) => s + (p.x - meanX) ** 2 + (p.y - meanY) ** 2, 0) / positions.length
  }).filter(v => v !== null)
}

function checkEyeBlink(frameLandmarks) {
  if (!Array.isArray(frameLandmarks) || frameLandmarks.length < 2) {
    return { hasBlink: false, reason: 'insufficient_frames' }
  }
  
  const leftEyePositions = frameLandmarks.map(f => {
    const positions = EYE_LEFT_INDICES.map(i => extractXY(f[i])).filter(Boolean)
    if (positions.length === 0) return null
    const avgX = positions.reduce((s, p) => s + p.x, 0) / positions.length
    const avgY = positions.reduce((s, p) => s + p.y, 0) / positions.length
    return { x: avgX, y: avgY }
  }).filter(Boolean)
  
  const rightEyePositions = frameLandmarks.map(f => {
    const positions = EYE_RIGHT_INDICES.map(i => extractXY(f[i])).filter(Boolean)
    if (positions.length === 0) return null
    const avgX = positions.reduce((s, p) => s + p.x, 0) / positions.length
    const avgY = positions.reduce((s, p) => s + p.y, 0) / positions.length
    return { x: avgX, y: avgY }
  }).filter(Boolean)
  
  if (leftEyePositions.length < 2 || rightEyePositions.length < 2) {
    return { hasBlink: false, reason: 'no_eye_data' }
  }
  
  const firstLeft = leftEyePositions[0].y
  const lastLeft = leftEyePositions[leftEyePositions.length - 1].y
  const leftDiff = Math.abs(lastLeft - firstLeft)
  
  const firstRight = rightEyePositions[0].y
  const lastRight = rightEyePositions[rightEyePositions.length - 1].y
  const rightDiff = Math.abs(lastRight - firstRight)
  
  const threshold = 8
  
  if (leftDiff > threshold || rightDiff > threshold) {
    return { hasBlink: true, reason: 'eye_movement_detected' }
  }
  
  return { hasBlink: false, reason: 'no_blink' }
}

function checkFlatness3D(frameLandmarks) {
  if (!Array.isArray(frameLandmarks) || frameLandmarks.length < 2) {
    return { isFlat: false, reason: 'insufficient_frames' }
  }
  
  const zValues = frameLandmarks.map(f => {
    const nosePoints = NOSE_INDICES.map(i => extractXYZ(f[i])).filter(Boolean)
    if (nosePoints.length === 0) return null
    return nosePoints.map(p => p.z).reduce((s, z) => s + z, 0) / nosePoints.length
  }).filter(v => v !== null && typeof v === 'number' && !isNaN(v))
  
  if (zValues.length < 2) {
    return { isFlat: false, reason: 'no_z_data' }
  }
  
  const meanZ = zValues.reduce((s, z) => s + z, 0) / zValues.length
  const variance = zValues.reduce((s, z) => s + (z - meanZ) ** 2, 0) / zValues.length
  
  if (variance < 0.01) {
    return { isFlat: true, reason: 'flat_3d', variance }
  }
  
  return { isFlat: false, reason: 'has_depth', variance }
}

function analyzeFrameLandmarks(frameLandmarks, minVariance, minFramesRequired) {
  if (!Array.isArray(frameLandmarks) || frameLandmarks.length < minFramesRequired) {
    return {
      live: false,
      reason: 'insufficient_frames',
      variance: 0,
      framesAnalyzed: frameLandmarks?.length ?? 0,
      minRequired: minFramesRequired,
    }
  }

  const variances = computeVariances(frameLandmarks)

  if (variances.length < 3) {
    return {
      live: false,
      reason: 'insufficient_landmark_data',
      variance: 0,
      framesAnalyzed: frameLandmarks.length,
    }
  }

  const sorted = [...variances].sort((a, b) => a - b)
  const medianVariance = sorted[Math.floor(sorted.length / 2)]

  const blinkCheck = checkEyeBlink(frameLandmarks)
  const flatnessCheck = checkFlatness3D(frameLandmarks)
  
  const hasMovement = medianVariance >= minVariance
  const hasBlink = blinkCheck.hasBlink
  const isNotFlat = !flatnessCheck.isFlat

  if (!hasMovement) {
    if (flatnessCheck.isFlat && !hasBlink) {
      return {
        live: false,
        reason: 'photo_detected_flat_no_blink',
        variance: medianVariance,
        framesAnalyzed: frameLandmarks.length,
        details: { flatness: flatnessCheck.reason, blink: blinkCheck.reason }
      }
    }
    
    if (flatnessCheck.isFlat && hasBlink) {
      return {
        live: false,
        reason: 'photo_detected_flat',
        variance: medianVariance,
        framesAnalyzed: frameLandmarks.length,
        details: { flatness: flatnessCheck.reason, blink: blinkCheck.reason }
      }
    }
    
    return {
      live: false,
      reason: 'static_face',
      variance: medianVariance,
      framesAnalyzed: frameLandmarks.length,
    }
  }

  if (medianVariance > MAX_VARIANCE) {
    return {
      live: true,
      reason: 'excessive_movement_allowed',
      variance: medianVariance,
      framesAnalyzed: frameLandmarks.length,
    }
  }

  return {
    live: true,
    reason: 'ok',
    variance: medianVariance,
    framesAnalyzed: frameLandmarks.length,
    details: { hasBlink, isNotFlat }
  }
}

export function analyzeLiveness(frameLandmarks) {
  return analyzeFrameLandmarks(frameLandmarks, MIN_VARIANCE, MIN_FRAMES)
}

export function analyzeEnrollmentLiveness(frameLandmarks) {
  return analyzeFrameLandmarks(frameLandmarks, ENROLLMENT_MIN_VARIANCE, ENROLLMENT_MIN_FRAMES)
}

export function extractLandmarkPositions(faceResult) {
  if (faceResult?.mesh) return faceResult.mesh
  return faceResult?.landmarks?.positions ?? null
}