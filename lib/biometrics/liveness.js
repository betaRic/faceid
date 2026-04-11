const MIN_FRAMES = 3
const MIN_VARIANCE = 0.8
const MAX_VARIANCE = 500
const MIN_VALID_FRAMES = 2

const ENROLLMENT_MIN_FRAMES = 6
const ENROLLMENT_MIN_VARIANCE = 1.0

const LIVENESS_POINTS = [1, 4, 6, 9, 33, 263, 61, 291, 199]

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

  if (medianVariance < minVariance) {
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
